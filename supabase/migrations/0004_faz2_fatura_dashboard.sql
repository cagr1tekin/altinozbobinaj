-- =============================================================================
-- Faz 2: Fatura ve dashboard + iş akışı revizyonu
--
-- 1) Yeni iş doğrudan "devam ediyor" başlar (kullanıcı isteği): sahada işin
--    ayrıca "başlat" denmesi gereksiz bir adımdı. "Bekliyor" durumu
--    kaldırılmadı; iş sonradan beklemeye alınabiliyor.
-- 2) Maliyet hesabı: adet ve kilogram aynı birim fiyatla toplanıyordu
--    (geçici çözüm). Artık ürünün takip birimine göre hesaplanıyor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Yeni işler doğrudan "devam ediyor"
-- -----------------------------------------------------------------------------
alter table jobs alter column status set default 'in_progress';

-- -----------------------------------------------------------------------------
-- 2) Maliyet hesabı
--
-- products.purchase_price tek bir alan ama ürün hem adet hem kg ile
-- izlenebiliyor. Fiyatın hangi birime ait olduğu unit_type_default ile
-- belirleniyor:
--   piece -> fiyat adet başına
--   kg    -> fiyat kilogram başına
--   both  -> fiyat her iki birim için de geçerli sayılıyor (ikisi toplanır)
--
-- 'both' varsayımı matematiksel olarak zayıf; adet ve kg için farklı fiyat
-- gerekiyorsa products'a ayrı bir fiyat alanı eklenmeli. Şu an ürünlerin
-- büyük çoğunluğu tek birimle izlendiği için bu varsayımla ilerleniyor ve
-- arayüzde de belirtiliyor.
-- -----------------------------------------------------------------------------
create or replace function job_product_cost(
  p_unit_type unit_type,
  p_unit_cost numeric,
  p_qty_pieces integer,
  p_qty_kg numeric
)
returns numeric
language sql
immutable
as $$
  /* Enum degeri text'e cevrilip karsilastiriliyor. Sebebi: 0008 unit_type'tan
     'kg' ve 'both' degerlerini kaldiriyor; kurulum SQL'i bastan tekrar
     calistirildiginda bu govde "invalid input value for enum unit_type: kg"
     hatasi veriyordu. Text karsilastirmasi enum'un her iki surumunde de
     gecerli. Bu fonksiyon zaten 0008 tarafindan yeniden tanimlaniyor. */
  select case
    when p_unit_type::text = 'piece' then p_unit_cost * p_qty_pieces
    when p_unit_type::text = 'kg'    then p_unit_cost * p_qty_kg
    else p_unit_cost * (p_qty_pieces + p_qty_kg)
  end;
$$;

/* Gorunum qty_kg_used kolonuna bagli; 0008 o kolonu qty_grams_used yapiyor.
   Gorunum govdesi olusturulurken dogrulandigi icin kurulum SQL'i bastan
   tekrar calistirildiginda "column jp.qty_kg_used does not exist" hatasi
   veriyordu. Kolon hala varsa olusturuluyor; yoksa 0008 kendi surumunu
   asagida zaten olusturuyor. */
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_products'
      and column_name = 'qty_kg_used'
  ) then
    execute $gorunum$
      create or replace view job_costs as
      select
        j.id as job_id,
        j.segment_id,
        coalesce(sum(
          job_product_cost(p.unit_type_default, jp.unit_cost_snapshot,
                           jp.qty_pieces_used, jp.qty_kg_used)
        ), 0)::numeric(14,2) as material_cost
      from jobs j
      left join job_products jp on jp.job_id = j.id
      left join products p on p.id = jp.product_id
      group by j.id, j.segment_id;
    $gorunum$;
  else
    raise notice 'job_costs 0008 surumuyle olusturulacak, eski surum atlandi.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3) Dönemsel özet (dashboard)
--
-- Gelir faturalardan, maliyet tamamlanmış işlerin malzemelerinden geliyor.
-- Tamamlanmamış işlerin maliyeti sayılmıyor: malzemesi henüz stoktan
-- düşmediği için gerçekleşmiş bir gider değil.
-- -----------------------------------------------------------------------------
create or replace function dashboard_summary(
  p_start date,
  p_end date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with gelir as (
    select
      coalesce(sum(gross_amount), 0)::numeric(14,2) as brut,
      coalesce(sum(net_amount), 0)::numeric(14,2)   as net,
      coalesce(sum(tax_amount), 0)::numeric(14,2)   as vergi,
      count(*)                                       as fatura_sayisi
    from invoices
    where issue_date between p_start and p_end
  ),
  maliyet as (
    select coalesce(sum(jc.material_cost), 0)::numeric(14,2) as toplam
    from jobs j
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed'
      and j.completed_at::date between p_start and p_end
  ),
  isler as (
    select
      count(*) filter (where status = 'completed'
                         and completed_at::date between p_start and p_end) as tamamlanan,
      count(*) filter (where status <> 'completed')                        as acik
    from jobs
  )
  select jsonb_build_object(
    'baslangic', p_start,
    'bitis', p_end,
    'brut_gelir', gelir.brut,
    'net_gelir', gelir.net,
    'vergi', gelir.vergi,
    'fatura_sayisi', gelir.fatura_sayisi,
    'malzeme_maliyeti', maliyet.toplam,
    'kar_zarar', (gelir.net - maliyet.toplam)::numeric(14,2),
    'tamamlanan_is', isler.tamamlanan,
    'acik_is', isler.acik
  )
  from gelir, maliyet, isler;
$$;

-- -----------------------------------------------------------------------------
-- 4) Müşteri bazlı kırılım (dashboard)
-- -----------------------------------------------------------------------------
create or replace function dashboard_by_customer(
  p_start date,
  p_end date
)
returns table (
  customer_id uuid,
  customer_name text,
  net_gelir numeric,
  malzeme_maliyeti numeric,
  kar_zarar numeric,
  tamamlanan_is bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with gelir as (
    select customer_id, sum(net_amount) as net
    from invoices
    where issue_date between p_start and p_end
    group by customer_id
  ),
  maliyet as (
    select s.customer_id, sum(jc.material_cost) as tutar, count(*) as is_sayisi
    from jobs j
    join segments s on s.id = j.segment_id
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed'
      and j.completed_at::date between p_start and p_end
    group by s.customer_id
  )
  select
    c.id,
    c.name,
    coalesce(g.net, 0)::numeric(14,2),
    coalesce(m.tutar, 0)::numeric(14,2),
    (coalesce(g.net, 0) - coalesce(m.tutar, 0))::numeric(14,2),
    coalesce(m.is_sayisi, 0)
  from customers c
  left join gelir g on g.customer_id = c.id
  left join maliyet m on m.customer_id = c.id
  where g.net is not null or m.tutar is not null
  order by (coalesce(g.net, 0) - coalesce(m.tutar, 0)) desc;
$$;

-- -----------------------------------------------------------------------------
-- 5) Yetkiler
--
-- View'ler security_invoker ile çalışıyor: sorgu, çağıran kullanıcının
-- yetkisiyle ve dolayısıyla RLS politikalarıyla değerlendiriliyor.
-- Bu olmadan view sahibinin yetkisiyle çalışır ve RLS baypas edilir.
-- -----------------------------------------------------------------------------
alter view job_costs set (security_invoker = on);

revoke all on function dashboard_summary(date, date) from public;
revoke all on function dashboard_by_customer(date, date) from public;

grant execute on function dashboard_summary(date, date) to authenticated;
grant execute on function dashboard_by_customer(date, date) to authenticated;
/* 0008 bu imzayi dusurup integer'li yenisini olusturuyor. Kurulum SQL'i
   tekrar calistirildiginda imza mevcut olmadigi icin yetki satirlari
   "function does not exist" hatasi veriyordu. */
do $$
begin
  revoke all on function job_product_cost(unit_type, numeric, integer, numeric) from public;
  grant execute on function job_product_cost(unit_type, numeric, integer, numeric) to authenticated;
exception
  when undefined_function then
    raise notice 'job_product_cost eski imzasi yok (0008 uygulanmis), yetki adimi atlandi.';
end $$;
grant select on job_costs to authenticated;
