-- =============================================================================
-- Faz 5: Periyodik özetleme ve stok mutabakatı
--
-- PRD Bölüm 6: "sürekli açık backend" ihtiyacı pg_cron ile karşılanıyor.
-- Ayrı bir sunucu gerekmiyor; işler veritabanının içinde çalışıyor.
--
-- Bu dosya pg_cron olmadan da uygulanabilir: uzantı yoksa zamanlama
-- kısmı atlanıyor, fonksiyonlar yine elle çağrılabiliyor. Supabase'de
-- pg_cron'u Database → Extensions bölümünden açmak gerekiyor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Aylık özet tablosu
--
-- Dashboard sorgusu her açılışta faturaları ve iş maliyetlerini yeniden
-- topluyor. Veri büyüdükçe bu yavaşlar; kapanmış aylar için sonuç zaten
-- değişmiyor. Gecelik iş bunları önceden hesaplayıp saklıyor.
-- -----------------------------------------------------------------------------
create table if not exists monthly_summaries (
  donem            date primary key,   -- ayın ilk günü
  brut_gelir       numeric(14,2) not null default 0,
  net_gelir        numeric(14,2) not null default 0,
  vergi            numeric(14,2) not null default 0,
  fatura_sayisi    integer not null default 0,
  malzeme_maliyeti numeric(14,2) not null default 0,
  kar_zarar        numeric(14,2) not null default 0,
  tamamlanan_is    integer not null default 0,
  hesaplanma       timestamptz not null default now()
);

alter table monthly_summaries enable row level security;

drop policy if exists monthly_summaries_staff_select on monthly_summaries;
create policy monthly_summaries_staff_select
  on monthly_summaries for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- 2) Bir ayı hesaplayıp yazan fonksiyon
--
-- security definer: pg_cron işi postgres rolüyle çalışıyor ve RLS'e
-- takılmamalı. Fonksiyon yalnızca toplu sayı üretiyor, satır döndürmüyor.
-- -----------------------------------------------------------------------------
create or replace function refresh_monthly_summary(p_donem date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bas date := date_trunc('month', p_donem)::date;
  v_bit date := (date_trunc('month', p_donem) + interval '1 month - 1 day')::date;
  v_ozet jsonb;
begin
  select jsonb_build_object(
    'brut', coalesce(sum(gross_amount), 0),
    'net', coalesce(sum(net_amount), 0),
    'vergi', coalesce(sum(tax_amount), 0),
    'adet', count(*)
  )
  into v_ozet
  from invoices
  where issue_date between v_bas and v_bit;

  insert into monthly_summaries as ms (
    donem, brut_gelir, net_gelir, vergi, fatura_sayisi,
    malzeme_maliyeti, kar_zarar, tamamlanan_is, hesaplanma
  )
  select
    v_bas,
    (v_ozet->>'brut')::numeric,
    (v_ozet->>'net')::numeric,
    (v_ozet->>'vergi')::numeric,
    (v_ozet->>'adet')::integer,
    coalesce(m.maliyet, 0),
    ((v_ozet->>'net')::numeric - coalesce(m.maliyet, 0)),
    coalesce(m.is_sayisi, 0),
    now()
  from (
    select
      coalesce(sum(jc.material_cost), 0) as maliyet,
      count(*) as is_sayisi
    from jobs j
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed'
      and j.completed_at::date between v_bas and v_bit
  ) m
  on conflict (donem) do update set
    brut_gelir       = excluded.brut_gelir,
    net_gelir        = excluded.net_gelir,
    vergi            = excluded.vergi,
    fatura_sayisi    = excluded.fatura_sayisi,
    malzeme_maliyeti = excluded.malzeme_maliyeti,
    kar_zarar        = excluded.kar_zarar,
    tamamlanan_is    = excluded.tamamlanan_is,
    hesaplanma       = excluded.hesaplanma;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Gecelik iş: içinde bulunulan ve bir önceki ayı tazele
--
-- Yalnızca son iki ay hesaplanıyor: daha eski aylar değişmiyor, hepsini
-- her gece yeniden hesaplamak gereksiz yük.
-- -----------------------------------------------------------------------------
create or replace function nightly_summary_refresh()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform refresh_monthly_summary(current_date);
  perform refresh_monthly_summary((current_date - interval '1 month')::date);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Stok tutarlılık kontrolü
--
-- products.qty_* alanları hızlı okuma için tutuluyor; doğru kaynak
-- stock_movements. İkisi ayrışırsa (elle UPDATE, yarım kalan işlem)
-- maliyet ve stok raporları sessizce yanlış olur. Bu fonksiyon farkı
-- listeliyor — otomatik düzeltmiyor, çünkü hangisinin doğru olduğu
-- duruma göre değişir ve sessiz düzeltme sorunun kaynağını gizler.
-- -----------------------------------------------------------------------------
/* Bu surum products.qty_kg kolonuna bagli ve donus tipi 0008'de degisiyor
   (birim kolonu eklendi). Iki ayri sorun cikariyordu:
     - `create or replace` donus tipini degistiremiyor
     - govde `language sql` oldugu icin olusturulurken dogrulaniyor, kolon
       yeniden adlandirilmissa hata veriyor
   Bu yuzden tumu kolon varligina bagli. 0008 uygulanmissa atlaniyor ve
   asagida 0008 kendi surumunu olusturuyor. Drop da blogun icinde: disarida
   olsa, calisan surumu dusurup yerine yenisini koyamiyordu. */
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name = 'qty_kg'
  ) then
    drop function if exists stock_reconciliation();
    execute $fn$
      create function stock_reconciliation()
      returns table (
        product_id uuid,
        product_name text,
        kayitli_adet integer,
        hareketlerden_adet bigint,
        kayitli_kg numeric,
        hareketlerden_kg numeric
      )
      language sql
      stable
      security invoker
      set search_path = public, pg_temp
      as $body$
        select
          p.id,
          p.name,
          p.qty_pieces,
          coalesce(sum(sm.qty_pieces_delta), 0),
          p.qty_kg,
          coalesce(sum(sm.qty_kg_delta), 0)::numeric(12,3)
        from products p
        left join stock_movements sm on sm.product_id = p.id
        group by p.id, p.name, p.qty_pieces, p.qty_kg
        having p.qty_pieces <> coalesce(sum(sm.qty_pieces_delta), 0)
            or p.qty_kg <> coalesce(sum(sm.qty_kg_delta), 0)::numeric(12,3);
      $body$;
    $fn$;
  else
    raise notice 'stock_reconciliation 0008 surumuyle olusturulacak, eski surum atlandi.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4b) Açılış stoğu için otomatik hareket kaydı
--
-- products.qty_* alanları doğrudan INSERT ile doldurulabiliyordu ve bu,
-- stock_movements ile kalıcı bir fark bırakıyordu: stok mutabakatı her
-- zaman "tutarsız" gösteriyordu. Uygulama ürünü 0 stokla açıp girişi
-- apply_stock_movement ile yapıyor, ama şema bunu garanti etmiyordu.
--
-- Trigger, sıfırdan farklı bir açılış stoğuyla oluşturulan üründe
-- karşılık gelen 'purchase_in' hareketini kendisi yazıyor. Böylece
-- denetim izi hangi yoldan girilirse girilsin eksiksiz kalıyor.
-- -----------------------------------------------------------------------------
create or replace function record_opening_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.qty_pieces, 0) <> 0 or coalesce(new.qty_kg, 0) <> 0 then
    insert into stock_movements (
      product_id, movement_type, qty_pieces_delta, qty_kg_delta, note
    )
    values (
      new.id, 'purchase_in',
      coalesce(new.qty_pieces, 0), coalesce(new.qty_kg, 0),
      'Açılış stoğu'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists products_opening_stock on products;
create trigger products_opening_stock
  after insert on products
  for each row execute function record_opening_stock();

-- -----------------------------------------------------------------------------
-- 5) Yetkiler
-- -----------------------------------------------------------------------------
revoke all on function refresh_monthly_summary(date) from public;
revoke all on function nightly_summary_refresh() from public;
revoke all on function stock_reconciliation() from public;

grant execute on function refresh_monthly_summary(date) to authenticated;
grant execute on function stock_reconciliation() to authenticated;
grant select on monthly_summaries to authenticated;

-- -----------------------------------------------------------------------------
-- 6) Zamanlama (pg_cron varsa)
--
-- Supabase'de pg_cron: Database → Extensions → pg_cron etkinleştirilmeli.
-- Uzantı yoksa bu blok sessizce atlanıyor ve migration hata vermiyor;
-- fonksiyonlar elle veya bir Vercel Cron ucundan da çağrılabilir.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Aynı isimli iş varsa önce kaldır (migration tekrar çalıştırılabilir olmalı)
    perform cron.unschedule('altinoz-gecelik-ozet')
    where exists (
      select 1 from cron.job where jobname = 'altinoz-gecelik-ozet'
    );

    -- Her gece 02:15 UTC (Türkiye saatiyle 05:15) — mesai dışı
    perform cron.schedule(
      'altinoz-gecelik-ozet',
      '15 2 * * *',
      $cron$ select nightly_summary_refresh(); $cron$
    );

    raise notice 'pg_cron isi kuruldu: altinoz-gecelik-ozet (her gece 02:15 UTC)';
  else
    raise notice 'pg_cron uzantisi yok; gecelik ozet zamanlanmadi. Supabase panelinde Database -> Extensions -> pg_cron etkinlestirilebilir.';
  end if;
end $$;

-- İlk değerleri hemen üret ki tablo boş kalmasın
select refresh_monthly_summary(current_date);
select refresh_monthly_summary((current_date - interval '1 month')::date);
