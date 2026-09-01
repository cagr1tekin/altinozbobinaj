-- =============================================================================
-- Fatura dosyası yükleme ve otomatik okuma
--
-- Faturalar artık elle girilmiyor: kullanıcı e-Fatura PDF'ini segmente
-- yüklüyor, sistem tutarları PDF'in metin katmanından okuyup kaydediyor.
--
-- Neden segment altında? Müşteri bir ziyarette birden fazla iş bırakıyor
-- (segment) ve bunların tamamına tek fatura kesiliyor. Fatura bu yüzden
-- işin değil segmentin karşılığı.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) invoices tablosuna dosya ve okuma alanları
-- -----------------------------------------------------------------------------
alter table invoices
  add column if not exists file_path text,
  add column if not exists ettn text,
  add column if not exists supplier_name text,
  add column if not exists parsed_at timestamptz;

comment on column invoices.file_path is
  'Supabase Storage yolu (faturalar bucket''i). Dosya silinirse kayıt kalır.';
comment on column invoices.ettn is
  'e-Fatura ETTN''i — GİB tarafından üretilen benzersiz belge kimliği. '
  'Aynı faturanın iki kez yüklenmesini engellemek için kullanılıyor.';
comment on column invoices.supplier_name is
  'PDF''ten okunan alıcı ünvanı. Doğrulama/karşılaştırma için saklanıyor; '
  'faturanın hangi müşteriye ait olduğu customer_id ile belirlenir.';

/* ETTN benzersiz: aynı fatura iki kez yüklenirse ikincisi reddedilir.
   Elle girilen faturalarda ETTN olmayacağı için kısmi indeks. */
create unique index if not exists invoices_ettn_key
  on invoices (ettn) where ettn is not null;

create index if not exists invoices_segment_idx
  on invoices (segment_id) where segment_id is not null;

-- -----------------------------------------------------------------------------
-- 2) Fatura dosyaları için Storage bucket'ı
--
-- public = false: dosyalara yalnızca imzalı bağlantıyla erişilir. Fatura
-- ticari belge; tahmin edilebilir bir URL ile açık olmamalı.
-- -----------------------------------------------------------------------------
/* storage şeması yalnızca Supabase'de var; yerel Postgres testlerinde
   bu blok atlanıyor ve migration hata vermiyor. */
do $$
begin
  if to_regnamespace('storage') is not null
     and exists (select 1 from pg_class where relname = 'buckets'
                 and relnamespace = to_regnamespace('storage')) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('faturalar', 'faturalar', false, 10485760, array['application/pdf'])
    on conflict (id) do update set
      public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf'];
  else
    raise notice 'storage semasi yok; faturalar bucket''i olusturulmadi (yerel test ortami)';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3) Storage politikaları — yalnızca personel
--
-- anon rolü hiçbir işlem yapamaz. Silme yetkisi de veriliyor: yanlış
-- yüklenen fatura dosyasıyla birlikte kaldırılabilmeli.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regnamespace('storage') is not null
     and exists (select 1 from pg_class where relname = 'objects'
                 and relnamespace = to_regnamespace('storage')) then

    drop policy if exists faturalar_staff_select on storage.objects;
    create policy faturalar_staff_select on storage.objects
      for select to authenticated
      using (bucket_id = 'faturalar');

    drop policy if exists faturalar_staff_insert on storage.objects;
    create policy faturalar_staff_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'faturalar');

    drop policy if exists faturalar_staff_delete on storage.objects;
    create policy faturalar_staff_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'faturalar');

    raise notice 'Fatura depolama politikalari olusturuldu (3 adet).';
  end if;
exception
  when insufficient_privilege then
    /* Bazi Supabase projelerinde SQL Editor'un rolu storage.objects'in
       sahibi degil. Bu blogun basarisizligi butun kurulumu dusurmemeli:
       kalan tablolar/gorunumler dogru kurulsun, eksik olan tek sey
       raporlansin. Bucket olusur ama POLICIES sutunu 0 kalir ve fatura
       yukleme reddedilir. */
    raise notice '';
    raise notice 'UYARI: storage.objects uzerinde politika olusturulamadi (yetki yok).';
    raise notice 'Fatura yukleme calismayacak. Duzeltmek icin:';
    raise notice '  supabase/depolama-izinleri.sql dosyasini SQL Editor de calistirin.';
end $$;

-- -----------------------------------------------------------------------------
-- 4) Segment bazlı fatura özeti
--
-- Segment sayfası faturaları ve toplamlarını tek sorguda okuyor.
-- -----------------------------------------------------------------------------
create or replace view segment_invoice_totals as
select
  s.id as segment_id,
  count(i.id) as fatura_sayisi,
  coalesce(sum(i.gross_amount), 0)::numeric(14,2) as brut_toplam,
  coalesce(sum(i.net_amount), 0)::numeric(14,2)   as net_toplam,
  coalesce(sum(i.tax_amount), 0)::numeric(14,2)   as vergi_toplam
from segments s
left join invoices i on i.segment_id = s.id
group by s.id;

alter view segment_invoice_totals set (security_invoker = on);
grant select on segment_invoice_totals to authenticated;
revoke all on segment_invoice_totals from anon;

-- -----------------------------------------------------------------------------
-- 5) Aylık gelir/gider trendi — raporlar sayfasındaki grafik için
--
-- monthly_summaries yalnızca hesaplanmış ayları içeriyor. Grafik son 12 ayı
-- kesintisiz göstermeli, veri olmayan aylar sıfır olarak dönmeli; yoksa
-- grafikte boşluk kalıyor ve trend yanlış okunuyor.
-- -----------------------------------------------------------------------------
create or replace function monthly_trend(p_ay_sayisi integer default 12)
returns table (
  donem date,
  net_gelir numeric,
  malzeme_maliyeti numeric,
  kar_zarar numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with aylar as (
    select generate_series(
      date_trunc('month', current_date) - ((greatest(p_ay_sayisi, 1) - 1) || ' months')::interval,
      date_trunc('month', current_date),
      '1 month'
    )::date as donem
  ),
  gelir as (
    select date_trunc('month', issue_date)::date as ay,
           sum(net_amount) as net
    from invoices
    group by 1
  ),
  maliyet as (
    select date_trunc('month', j.completed_at)::date as ay,
           sum(jc.material_cost) as tutar
    from jobs j
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed' and j.completed_at is not null
    group by 1
  )
  select
    a.donem,
    coalesce(g.net, 0)::numeric(14,2),
    coalesce(m.tutar, 0)::numeric(14,2),
    (coalesce(g.net, 0) - coalesce(m.tutar, 0))::numeric(14,2)
  from aylar a
  left join gelir g on g.ay = a.donem
  left join maliyet m on m.ay = a.donem
  order by a.donem;
$$;

revoke all on function monthly_trend(integer) from anon, public;
grant execute on function monthly_trend(integer) to authenticated;
