-- =============================================================================
-- Fatura depolama alanı: teşhis + onarım
--
-- Ne zaman çalıştırılır?
--   Fatura yüklerken "Depolama izinleri eksik" hatası alındığında, ya da
--   Supabase panelinde Storage > Buckets ekranında `faturalar` satırının
--   POLICIES sütunu 0 görünüyorsa.
--
-- Nasıl?
--   Supabase Dashboard > SQL Editor > yapıştır > Run.
--   Çıktıdaki NOTICE satırları neyin eksik olduğunu ve neyin düzeltildiğini
--   söyler. Tekrar tekrar çalıştırmak zararsızdır.
--
-- Neden ayrı dosya?
--   Bucket'ı panelden elle oluşturmak yetmiyor: dosyaya kimin erişebileceğini
--   belirleyen kurallar (RLS politikaları) `storage.objects` tablosunda
--   yaşıyor ve panelden bucket açarken oluşmuyor. Kural yoksa Postgres
--   varsayılan olarak reddeder, yükleme sessizce başarısız olur.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Mevcut durumu raporla
-- -----------------------------------------------------------------------------
do $$
declare
  v_bucket boolean;
  v_politika integer;
  v_view boolean;
  v_fonksiyon boolean;
begin
  select exists (select 1 from storage.buckets where id = 'faturalar')
    into v_bucket;

  select count(*) into v_politika
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'faturalar_%';

  select exists (
    select 1 from pg_views where schemaname = 'public'
      and viewname = 'segment_invoice_totals') into v_view;

  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'monthly_trend') into v_fonksiyon;

  raise notice '--- MEVCUT DURUM ---';
  raise notice 'faturalar bucket''i      : %', case when v_bucket then 'VAR' else 'YOK' end;
  raise notice 'depolama politikalari    : % adet (3 olmali)', v_politika;
  raise notice 'segment_invoice_totals   : %', case when v_view then 'VAR' else 'YOK' end;
  raise notice 'monthly_trend fonksiyonu : %', case when v_fonksiyon then 'VAR' else 'YOK' end;

  if not v_view or not v_fonksiyon then
    raise notice '';
    raise notice 'UYARI: 0007 migration''i tam calismamis. Once supabase/kurulum-tumu.sql';
    raise notice '       dosyasini bastan calistirin, sonra bu dosyayi tekrar calistirin.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2) Bucket eksikse oluştur / ayarlarını düzelt
--
-- public = false: fatura ticari belge. Tahmin edilebilir bir adresten
-- açılabilir olmamalı; uygulama kısa ömürlü imzalı bağlantı üretiyor.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faturalar', 'faturalar', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public             = false,
  file_size_limit    = 10485760,
  allowed_mime_types = array['application/pdf'];

-- -----------------------------------------------------------------------------
-- 3) Erişim kuralları — yalnızca giriş yapmış personel
--
-- anon (giriş yapmamış ziyaretçi) hiçbir işlem yapamaz: politikalar yalnızca
-- `authenticated` rolüne veriliyor, kural yazılmayan rol reddedilir.
--
-- Silme yetkisi de veriliyor; yanlış yüklenen bir fatura kaydıyla birlikte
-- dosyası da kaldırılabilmeli, yoksa depoda sahipsiz dosya birikir.
-- -----------------------------------------------------------------------------
do $$
begin
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

  raise notice 'Depolama politikalari olusturuldu.';
exception
  when insufficient_privilege then
    /* Bazı Supabase projelerinde SQL Editor'ün rolü storage.objects'in
       sahibi değil. Bu durumda kurallar panelden elle eklenmeli. */
    raise notice '';
    raise notice 'HATA: storage.objects uzerinde politika olusturma yetkisi yok.';
    raise notice 'Panelden ekleyin: Storage > Policies > New policy';
    raise notice '  Bucket : faturalar';
    raise notice '  Roller : authenticated';
    raise notice '  Islem  : SELECT, INSERT, DELETE (ucu de)';
    raise notice '  Kosul  : bucket_id = ''faturalar''';
end $$;

-- -----------------------------------------------------------------------------
-- 4) Sonucu doğrula
-- -----------------------------------------------------------------------------
do $$
declare v_politika integer;
begin
  select count(*) into v_politika
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'faturalar_%';

  raise notice '';
  raise notice '--- SONUC ---';
  if v_politika = 3 then
    raise notice 'TAMAM: 3 politika aktif. Fatura yukleme calismali.';
  else
    raise notice 'EKSIK: % politika var, 3 olmali. Yukaridaki uyariya bakin.', v_politika;
  end if;
end $$;

select
  policyname as politika,
  cmd        as islem,
  roles      as roller
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'faturalar_%'
order by policyname;
