-- =============================================================================
-- Guvenlik sikilastirma testleri (0013)
-- Calistirma:
--   docker cp supabase/tests/09_guvenlik_test.sql altinoz-pg:/tmp/t9.sql
--   docker exec altinoz-pg psql -U postgres -d altinoz -v ON_ERROR_STOP=1 -f /tmp/t9.sql
--
-- Bu dosya "kurallar yazildi mi" degil "kural GERCEKTEN engelliyor mu"
-- sinar. Yetki testleri authenticated rolune GECILEREK yapiliyor; postgres
-- superuser olarak calistirmak butun kisitlari baypas eder ve test hicbir
-- sey olcmez.
-- =============================================================================

begin;
\set ON_ERROR_STOP on

set local "request.jwt.claims" =
  '{"sub":"3f8d1c2a-4b56-4789-9abc-1d2e3f4a5b6c","email":"usta@altinozbobinaj.com"}';

insert into customers (id, name) values
  ('f1111111-1111-4111-8111-111111111111', 'Guvenlik Test A.S.');
insert into segments (id, customer_id, segment_date) values
  ('f2222222-2222-4222-8222-222222222222',
   'f1111111-1111-4111-8111-111111111111', current_date);
insert into jobs (id, segment_id, title) values
  ('f3333333-3333-4333-8333-333333333333',
   'f2222222-2222-4222-8222-222222222222', 'Guvenlik testi isi');
insert into products (id, name, unit_type_default, purchase_price) values
  ('f4444444-4444-4444-8444-444444444444', 'Guvenlik Tel', 'gram', 100);
insert into invoices (id, customer_id, segment_id, gross_amount, net_amount, tax_amount, issue_date)
values ('f5555555-5555-4555-8555-555555555555',
        'f1111111-1111-4111-8111-111111111111',
        'f2222222-2222-4222-8222-222222222222',
        1200, 1000, 200, current_date);

-- =============================================================================
-- A) SILME ENGELI — personel rolunde
-- =============================================================================

\echo '--- TEST 1: personel HICBIR is tablosunu silemiyor ---'
do $$
declare
  t          text;
  v_silinen  text[] := '{}';
begin
  foreach t in array array['customers','segments','jobs','job_products',
                           'invoices','products','qr_codes',
                           'stock_movements','audit_log']
  loop
    if has_table_privilege('authenticated', t, 'DELETE') then
      v_silinen := v_silinen || t;
    end if;
  end loop;

  if array_length(v_silinen, 1) is not null then
    raise exception 'KALDI: personel su tablolarda DELETE yetkisine sahip: %', v_silinen;
  end if;
  raise notice 'GECTI: 9 tabloda da personelin DELETE yetkisi yok';
end $$;

\echo '--- TEST 2: DELETE politikasi HIC yazilmamis ---'
do $$
declare v integer;
begin
  /* Yetki geri alinsa bile bir DELETE politikasi eklenirse ileride biri
     yetkiyi geri verip silebilir. Iki katman da bos olmali. */
  select count(*) into v from pg_policies
  where schemaname = 'public' and cmd = 'DELETE';
  if v <> 0 then raise exception 'KALDI: % DELETE politikasi var', v; end if;
  raise notice 'GECTI: hicbir tabloda DELETE politikasi yok';
end $$;

\echo '--- TEST 3: personel rolunde GERCEK silme denemesi reddediliyor ---'
do $$
begin
  set local role authenticated;
  begin
    delete from customers where id = 'f1111111-1111-4111-8111-111111111111';
    reset role;
    raise exception 'KALDI: personel musteri SILEBILDI';
  exception
    when insufficient_privilege then
      reset role;
      raise notice 'GECTI: personel silme denemesi reddedildi';
  end;
end $$;

\echo '--- TEST 4: finansal kayitlar degistirilemiyor/silinemiyor ---'
do $$
begin
  if has_table_privilege('authenticated', 'stock_movements', 'UPDATE') then
    raise exception 'KALDI: stok hareketi degistirilebiliyor';
  end if;
  if has_table_privilege('authenticated', 'audit_log', 'INSERT') then
    raise exception 'KALDI: personel denetim gunlugune yazabiliyor';
  end if;
  if has_table_privilege('authenticated', 'monthly_summaries', 'UPDATE') then
    raise exception 'KALDI: aylik ozet degistirilebiliyor';
  end if;
  raise notice 'GECTI: stok hareketi, denetim gunlugu ve aylik ozet salt-okunur';
end $$;

-- =============================================================================
-- B) YUMUSAK SILME — kayit kaybolmuyor ama gorunmuyor
-- =============================================================================

\echo '--- TEST 5: kayit_sil isaretliyor, veri DURUYOR ---'
do $$
declare v_deleted timestamptz; v_var integer;
begin
  perform kayit_sil('invoices', 'f5555555-5555-4555-8555-555555555555');

  select deleted_at into v_deleted from invoices
  where id = 'f5555555-5555-4555-8555-555555555555';
  if v_deleted is null then raise exception 'KALDI: isaretlenmedi'; end if;

  -- Kayit FIZIKSEL olarak duruyor
  select count(*) into v_var from invoices
  where id = 'f5555555-5555-4555-8555-555555555555';
  if v_var <> 1 then raise exception 'KALDI: kayit yok olmus'; end if;

  raise notice 'GECTI: fatura isaretlendi, satir veritabaninda duruyor';
end $$;

\echo '--- TEST 6: silinen fatura TOPLAMLARDAN dusuyor ---'
do $$
declare v_brut numeric; v_sayi integer;
begin
  /* En sinsi hata burada olurdu: kayit listeden kalkar ama raporda
     gorunmeye devam eder. */
  select brut_toplam, fatura_sayisi into v_brut, v_sayi
  from segment_invoice_totals
  where segment_id = 'f2222222-2222-4222-8222-222222222222';

  if coalesce(v_sayi, 0) <> 0 then
    raise exception 'KALDI: silinen fatura segment toplaminda: % adet', v_sayi;
  end if;
  if coalesce(v_brut, 0) <> 0 then
    raise exception 'KALDI: silinen faturanin tutari toplamda: %', v_brut;
  end if;
  raise notice 'GECTI: silinen fatura segment toplamindan dustu';
end $$;

\echo '--- TEST 7: silinen fatura AYLIK TRENDDEN dusuyor ---'
do $$
declare v_gelir numeric;
begin
  select net_gelir into v_gelir from monthly_trend(12)
  where donem = date_trunc('month', current_date)::date;
  if coalesce(v_gelir, 0) <> 0 then
    raise exception 'KALDI: silinen fatura aylik trendde: %', v_gelir;
  end if;
  raise notice 'GECTI: silinen fatura kar/zarar raporundan dustu';
end $$;

\echo '--- TEST 8: silinen malzeme MALIYETTEN dusuyor ---'
do $$
declare v_maliyet numeric; v_jp uuid;
begin
  v_jp := add_job_product('f3333333-3333-4333-8333-333333333333',
                          'f4444444-4444-4444-8444-444444444444', 5000);

  select material_cost into v_maliyet from job_costs
  where job_id = 'f3333333-3333-4333-8333-333333333333';
  if v_maliyet <> 500.00 then
    raise exception 'KALDI: baslangic maliyeti %, 500 bekleniyordu', v_maliyet;
  end if;

  perform kayit_sil('job_products', v_jp);

  select material_cost into v_maliyet from job_costs
  where job_id = 'f3333333-3333-4333-8333-333333333333';
  if coalesce(v_maliyet, 0) <> 0 then
    raise exception 'KALDI: silinen malzeme maliyette: %', v_maliyet;
  end if;
  raise notice 'GECTI: silinen malzeme is maliyetinden dustu';
end $$;

\echo '--- TEST 9: silinen malzeme TAMAMLAMADA stoktan dusulmuyor ---'
do $$
declare v_once integer; v_sonra integer;
begin
  /* Silinmis satir tamamlamada islenirse stok sessizce eksilir ve
     mutabakat bozulur. */
  select qty_grams into v_once from products
  where id = 'f4444444-4444-4444-8444-444444444444';

  perform complete_job('f3333333-3333-4333-8333-333333333333',
                       array['winding']::service_type[]);

  select qty_grams into v_sonra from products
  where id = 'f4444444-4444-4444-8444-444444444444';

  if v_once <> v_sonra then
    raise exception 'KALDI: stok degisti (% -> %), silinmis satir islendi', v_once, v_sonra;
  end if;
  raise notice 'GECTI: silinmis malzeme tamamlamada islenmedi';
end $$;

\echo '--- TEST 10: silinen musteri ARAMADA cikmiyor ---'
do $$
declare v integer;
begin
  select count(*) into v from panel_arama('Guvenlik');
  if v < 1 then raise exception 'KALDI: arama silinmeden once bulamiyor'; end if;

  perform kayit_sil('customers', 'f1111111-1111-4111-8111-111111111111');

  select count(*) into v from panel_arama('Guvenlik Test');
  if v <> 0 then raise exception 'KALDI: silinen musteri aramada cikiyor (%)', v; end if;
  raise notice 'GECTI: silinen musteri arama sonuclarinda yok';
end $$;

\echo '--- TEST 11: silinen isin QR belgesi veri dondurmuyor ---'
do $$
declare v jsonb;
begin
  /* Musteriye acik uc: silinen bir isin QR'i hala okunuyorsa veri
     "silinmis" ama disariya aciktir. */
  perform kayit_sil('jobs', 'f3333333-3333-4333-8333-333333333333');

  select public_job_by_token(token) into v from qr_codes
  where job_id = 'f3333333-3333-4333-8333-333333333333';

  if v is not null then
    raise exception 'KALDI: silinen isin QR belgesi hala veri donduruyor: %', v::text;
  end if;
  raise notice 'GECTI: silinen isin QR belgesi kapali';
end $$;

\echo '--- TEST 12: kayit_sil ayni kaydi iki kez silmiyor ---'
do $$
begin
  perform kayit_sil('jobs', 'f3333333-3333-4333-8333-333333333333');
  raise exception 'KALDI: zaten silinmis kayit tekrar silindi';
exception
  when no_data_found then
    raise notice 'GECTI: zaten silinmis kayit sessizce gecmiyor';
end $$;

\echo '--- TEST 13: kayit_sil tanimsiz tabloyu reddediyor ---'
do $$
begin
  /* Tablo adi disaridan geliyor; beyaz liste olmasaydi SQL enjeksiyonu
     yuzeyi olurdu. */
  perform kayit_sil('auth.users', 'f1111111-1111-4111-8111-111111111111');
  raise exception 'KALDI: tanimsiz tablo kabul edildi';
exception
  when invalid_parameter_value then
    raise notice 'GECTI: kayit_sil yalnizca beyaz listedeki tablolari kabul ediyor';
end $$;

-- =============================================================================
-- C) SIGNUP ENGELI
-- =============================================================================

\echo '--- TEST 14: izinsiz e-posta ile hesap acilamiyor ---'
do $$
begin
  insert into auth.users (email) values ('saldirgan@ornek.com');
  raise exception 'KALDI: izinsiz hesap acildi';
exception
  when insufficient_privilege then
    raise notice 'GECTI: izinli listede olmayan e-posta reddedildi';
end $$;

\echo '--- TEST 15: izinli e-posta ile hesap acilabiliyor ---'
do $$
declare v integer;
begin
  insert into izinli_epostalar (eposta, not_) values ('yeni@altinozbobinaj.com', 'test');
  insert into auth.users (email) values ('yeni@altinozbobinaj.com');

  select count(*) into v from auth.users where email = 'yeni@altinozbobinaj.com';
  if v <> 1 then raise exception 'KALDI: izinli hesap acilamadi'; end if;
  raise notice 'GECTI: izinli e-posta ile hesap acilabiliyor';
end $$;

\echo '--- TEST 16: buyuk/kucuk harf farki engeli atlatamiyor ---'
do $$
begin
  /* Liste kucuk harfte tutuluyor; trigger lower() ile karsilastiriyor.
     Yoksa "Saldirgan@Ornek.com" engeli atlatirdi. */
  insert into auth.users (email) values ('SALDIRGAN@ORNEK.COM');
  raise exception 'KALDI: buyuk harfli e-posta engeli atlatti';
exception
  when insufficient_privilege then
    raise notice 'GECTI: buyuk/kucuk harf farki engeli atlatamiyor';
end $$;

\echo '--- TEST 17: personel izinli listeyi DEGISTIREMIYOR ---'
do $$
begin
  /* Degistirebilse kendine yetki verip yeni hesap acabilirdi. */
  if has_table_privilege('authenticated', 'izinli_epostalar', 'INSERT') then
    raise exception 'KALDI: personel izinli listeye ekleyebiliyor';
  end if;
  if has_table_privilege('authenticated', 'izinli_epostalar', 'UPDATE') then
    raise exception 'KALDI: personel izinli listeyi degistirebiliyor';
  end if;
  if has_table_privilege('authenticated', 'izinli_epostalar', 'DELETE') then
    raise exception 'KALDI: personel izinli listeden silebiliyor';
  end if;
  if has_table_privilege('anon', 'izinli_epostalar', 'SELECT') then
    raise exception 'KALDI: anon izinli listeyi okuyabiliyor';
  end if;
  raise notice 'GECTI: izinli liste personel icin salt-okunur, anon''a kapali';
end $$;

-- =============================================================================
-- D) GIRIS DENETIMI
-- =============================================================================

\echo '--- TEST 18: giris kaydi yazilabiliyor, degistirilemiyor ---'
do $$
declare v record;
begin
  perform giris_kaydet('usta@altinozbobinaj.com', 'tr', 'allowed', '85.100.1.x', 'Test/1.0');

  select * into v from login_log order by id desc limit 1;
  if v.country <> 'TR' then raise exception 'KALDI: ulke % (buyuk harfe cevrilmeli)', v.country; end if;
  if v.outcome <> 'allowed' then raise exception 'KALDI: sonuc %', v.outcome; end if;

  if has_table_privilege('authenticated', 'login_log', 'INSERT') then
    raise exception 'KALDI: personel giris gunlugune dogrudan yazabiliyor';
  end if;
  if has_table_privilege('authenticated', 'login_log', 'UPDATE') then
    raise exception 'KALDI: personel giris kaydini degistirebiliyor';
  end if;
  if has_table_privilege('authenticated', 'login_log', 'DELETE') then
    raise exception 'KALDI: personel giris kaydini silebiliyor';
  end if;
  if has_table_privilege('anon', 'login_log', 'SELECT') then
    raise exception 'KALDI: anon giris gunlugunu okuyabiliyor';
  end if;

  raise notice 'GECTI: giris kaydi yazildi, personel icin salt-okunur';
end $$;

\echo '--- TEST 19: engellenen giris de kaydediliyor ---'
do $$
declare v integer;
begin
  perform giris_kaydet('yabanci@ornek.com', 'de', 'blocked_country', '1.2.3.x', null);
  perform giris_kaydet(null, null, 'unknown_country', null, null);

  select count(*) into v from login_log where outcome <> 'allowed';
  if v <> 2 then raise exception 'KALDI: % engellenen kayit, 2 bekleniyordu', v; end if;
  raise notice 'GECTI: engellenen ve ulkesi bilinmeyen girisler de kaydediliyor';
end $$;

-- =============================================================================
-- E) ANON YUZEYI — yeni nesneler sizinti acmadi mi
-- =============================================================================

\echo '--- TEST 20: anon yeni tablolari ve fonksiyonlari goremiyor ---'
do $$
declare
  t          text;
  v_acik     text[] := '{}';
begin
  foreach t in array array['izinli_epostalar','login_log']
  loop
    if has_table_privilege('anon', t, 'SELECT') then v_acik := v_acik || t; end if;
  end loop;

  if has_function_privilege('anon', 'kayit_sil(text, uuid)', 'EXECUTE') then
    v_acik := v_acik || 'kayit_sil()';
  end if;
  if has_function_privilege('anon', 'izinsiz_kayit_engelle()', 'EXECUTE') then
    v_acik := v_acik || 'izinsiz_kayit_engelle()';
  end if;

  if array_length(v_acik, 1) is not null then
    raise exception 'KALDI: anon''a acik: %', v_acik;
  end if;
  raise notice 'GECTI: yeni tablolar ve fonksiyonlar anon''a kapali';
end $$;

\echo '--- TEST 21: giris kaydi anon''a ACIK olmali (yazma) ---'
do $$
begin
  /* Giris denemesi henuz oturum acilmadan kaydediliyor; fonksiyon yalnizca
     INSERT yapiyor, hicbir sey okumuyor. Bu bilincli bir istisna. */
  if not has_function_privilege('anon',
       'giris_kaydet(text, text, login_outcome, text, text)', 'EXECUTE') then
    raise exception 'KALDI: anon giris kaydi yazamiyor, denemeler kayit dis kalir';
  end if;
  raise notice 'GECTI: giris kaydi anon''a acik (bilincli), okuma kapali';
end $$;

\echo '--- TEST 22: RLS butun tablolarda ACIK ---'
do $$
declare v text;
begin
  select string_agg(c.relname, ', ') into v
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if v is not null then raise exception 'KALDI: RLS kapali tablolar: %', v; end if;
  raise notice 'GECTI: public semasindaki her tabloda RLS acik';
end $$;

rollback;

\echo ''
\echo '===== GUVENLIK TESTLERI TAMAM ====='
