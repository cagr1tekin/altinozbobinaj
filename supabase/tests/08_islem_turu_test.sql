-- =============================================================================
-- Islem turleri: motor sarimi ve/veya revizyon (0011 + 0012)
-- Calistirma:
--   docker cp supabase/tests/08_islem_turu_test.sql altinoz-pg:/tmp/t8.sql
--   docker exec altinoz-pg psql -U postgres -d altinoz -v ON_ERROR_STOP=1 -f /tmp/t8.sql
-- Test verisi sonunda rollback ile geri alinir.
-- =============================================================================

begin;
\set ON_ERROR_STOP on

set local "request.jwt.claims" =
  '{"sub":"3f8d1c2a-4b56-4789-9abc-1d2e3f4a5b6c","email":"usta@altinozbobinaj.com"}';

insert into customers (id, name)
  values ('e1111111-1111-4111-8111-111111111111', 'Islem Turu Test A.S.');
insert into segments (id, customer_id, segment_date)
  values ('e2222222-2222-4222-8222-222222222222',
          'e1111111-1111-4111-8111-111111111111', current_date);

\echo '--- TEST 1: islem secilmeden tamamlanamiyor ---'
do $$
begin
  insert into jobs (id, segment_id, title)
  values ('e3333333-3333-4333-8333-333333333333',
          'e2222222-2222-4222-8222-222222222222', 'Tur secilmeyen is');
  begin
    perform complete_job('e3333333-3333-4333-8333-333333333333', null);
    raise exception 'KALDI: islem olmadan tamamlandi';
  exception
    when invalid_parameter_value then
      raise notice 'GECTI: null ile tamamlanamiyor';
  end;
end $$;

\echo '--- TEST 2: BOS DIZI de reddediliyor ---'
do $$
begin
  /* null ile bos dizi ayri durumlar; ikisi de engellenmeli. Bos dizi
     gecerse kisit tamamlamayi reddeder ama hata mesaji anlasilmaz olur. */
  perform complete_job('e3333333-3333-4333-8333-333333333333',
                       array[]::service_type[]);
  raise exception 'KALDI: bos dizi kabul edildi';
exception
  when invalid_parameter_value then
    raise notice 'GECTI: bos dizi reddediliyor';
end $$;

\echo '--- TEST 3: tamamlanmamis iste dizi bos olabiliyor ---'
do $$
declare v_turler service_type[]; v_durum job_status;
begin
  /* Is acilirken henuz ne yapilacagi belli degil; kisit yalnizca
     tamamlanmis isi baglamali, yoksa is hic acilamaz. */
  select service_types, status into v_turler, v_durum
  from jobs where id = 'e3333333-3333-4333-8333-333333333333';
  if v_turler is not null then raise exception 'KALDI: acik iste % geldi', v_turler; end if;
  if v_durum = 'completed' then raise exception 'KALDI: is tamamlanmis gorunuyor'; end if;
  raise notice 'GECTI: acik iste islem listesi bos kalabiliyor';
end $$;

\echo '--- TEST 4: TEK islem secilip tamamlaniyor ---'
do $$
declare v_sonuc jsonb; v_turler service_type[];
begin
  v_sonuc := complete_job('e3333333-3333-4333-8333-333333333333',
                          array['revision']::service_type[]);

  if v_sonuc -> 'service_types' <> '["revision"]'::jsonb then
    raise exception 'KALDI: donen liste %', v_sonuc -> 'service_types';
  end if;

  select service_types into v_turler from jobs
  where id = 'e3333333-3333-4333-8333-333333333333';
  if v_turler <> array['revision']::service_type[] then
    raise exception 'KALDI: saklanan liste %', v_turler;
  end if;

  raise notice 'GECTI: tek islem (revizyon) saklandi ve donduruldu';
end $$;

\echo '--- TEST 5: IKI islem birden secilebiliyor ---'
do $$
declare v_turler service_type[];
begin
  /* Kullanicinin asil istegi: bir motora ayni ziyarette hem sarim hem
     revizyon yapilabiliyor. */
  insert into jobs (id, segment_id, title)
  values ('e4444444-4444-4444-8444-444444444444',
          'e2222222-2222-4222-8222-222222222222', 'Ikisi birden');
  perform complete_job('e4444444-4444-4444-8444-444444444444',
                       array['winding', 'revision']::service_type[]);

  select service_types into v_turler from jobs
  where id = 'e4444444-4444-4444-8444-444444444444';
  if array_length(v_turler, 1) <> 2 then
    raise exception 'KALDI: 2 eleman bekleniyordu, gelen %', v_turler;
  end if;
  raise notice 'GECTI: iki islem birden saklandi (%)', v_turler;
end $$;

\echo '--- TEST 6: SIRA sabit — ters verilse de ayni ---'
do $$
declare v_ters service_type[]; v_duz service_type[];
begin
  /* Musteri belgesindeki metin bu diziden uretiliyor. Sira degisken
     olsaydi ayni is icin belge bir seferinde "revizyon ve motor sarimi",
     baska seferinde tersini yazardi. */
  insert into jobs (id, segment_id, title)
  values ('e5555555-5555-4555-8555-555555555555',
          'e2222222-2222-4222-8222-222222222222', 'Ters sira');
  perform complete_job('e5555555-5555-4555-8555-555555555555',
                       array['revision', 'winding']::service_type[]);

  select service_types into v_ters from jobs where id = 'e5555555-5555-4555-8555-555555555555';
  select service_types into v_duz  from jobs where id = 'e4444444-4444-4444-8444-444444444444';

  if v_ters <> v_duz then
    raise exception 'KALDI: sira tutmuyor — ters % / duz %', v_ters, v_duz;
  end if;
  if v_ters[1] <> 'winding' then
    raise exception 'KALDI: ilk eleman winding olmali, gelen %', v_ters[1];
  end if;
  raise notice 'GECTI: sira enum tanim sirasina sabitlendi (%)', v_ters;
end $$;

\echo '--- TEST 7: TEKRAR eleniyor ---'
do $$
declare v_turler service_type[];
begin
  /* array['winding','winding'] gecerli bir dizi ama anlamsiz; musteri
     belgesinde "motor sarimi ve motor sarimi" yazardi. */
  insert into jobs (id, segment_id, title)
  values ('e6666666-6666-4666-8666-666666666666',
          'e2222222-2222-4222-8222-222222222222', 'Tekrarli');
  perform complete_job('e6666666-6666-4666-8666-666666666666',
                       array['winding', 'winding']::service_type[]);

  select service_types into v_turler from jobs
  where id = 'e6666666-6666-4666-8666-666666666666';
  if array_length(v_turler, 1) <> 1 then
    raise exception 'KALDI: tekrar elenmedi, gelen %', v_turler;
  end if;
  raise notice 'GECTI: tekrar elendi (%)', v_turler;
end $$;

\echo '--- TEST 8: kisit elle tekrarli/bos diziyi engelliyor ---'
do $$
begin
  begin
    update jobs set service_types = array['winding','winding']::service_type[]
    where id = 'e4444444-4444-4444-8444-444444444444';
    raise exception 'KALDI: elle tekrarli dizi yazilabildi';
  exception
    when check_violation then
      raise notice 'GECTI: kisit tekrarli diziyi engelliyor';
  end;

  begin
    update jobs set service_types = array[]::service_type[]
    where id = 'e4444444-4444-4444-8444-444444444444';
    raise exception 'KALDI: elle bos dizi yazilabildi';
  exception
    when check_violation then
      raise notice 'GECTI: kisit bos diziyi engelliyor';
  end;

  begin
    update jobs set service_types = null
    where id = 'e4444444-4444-4444-8444-444444444444';
    raise exception 'KALDI: tamamlanmis isin listesi bosaltilabildi';
  exception
    when check_violation then
      raise notice 'GECTI: kisit null''i engelliyor';
  end;
end $$;

\echo '--- TEST 9: denetim gunlugune dusuyor ---'
do $$
declare v_kayit integer;
begin
  /* Sonradan "hangi islemler secilmis, kim secmis" sorusu sorulabilmeli. */
  select count(*) into v_kayit from audit_log
  where entity = 'job' and entity_id = 'e4444444-4444-4444-8444-444444444444'
    and action = 'update' and details ? 'service_types';
  if v_kayit < 1 then raise exception 'KALDI: islem listesi gunluge dusmedi'; end if;
  raise notice 'GECTI: islem listesi degisikligi denetim gunlugunde';
end $$;

\echo '--- TEST 10: QR ciktisi listeyi donduruyor, miktar hala gizli ---'
do $$
declare v jsonb; v_text text;
begin
  select public_job_by_token(token) into v from qr_codes
  where job_id = 'e4444444-4444-4444-8444-444444444444';
  v_text := v::text;

  if v is null then raise exception 'KALDI: QR ciktisi bos'; end if;
  if jsonb_array_length(v -> 'service_types') <> 2 then
    raise exception 'KALDI: iki islem donmeliydi: %', v_text;
  end if;
  if (v -> 'service_types' ->> 0) <> 'winding' then
    raise exception 'KALDI: sira bozuk: %', v_text;
  end if;

  /* 0010 kurali korunuyor: miktar musteriye maliyet ipucu verdigi icin
     hala donmemeli. */
  if v_text like '%qty_%' or v_text like '%unit_type%' then
    raise exception 'KALDI: miktar/birim sizdi: %', v_text;
  end if;
  if v_text like '%purchase_price%' or v_text like '%unit_cost%' then
    raise exception 'KALDI: fiyat sizdi: %', v_text;
  end if;

  raise notice 'GECTI: QR iki islemi de donduruyor, miktar ve fiyat gizli';
end $$;

\echo '--- TEST 11: geri alma listeyi KORUYOR ---'
do $$
declare v_turler service_type[]; v_durum job_status;
begin
  /* Geri alinan is tekrar tamamlanacak; onceki secim korunursa ne
     secildigi hatirlanabilir. Kisit yalnizca tamamlanmis isi bagladigi
     icin listenin dolu kalmasi sorun degil. */
  perform revert_job_completion('e4444444-4444-4444-8444-444444444444');

  select service_types, status into v_turler, v_durum from jobs
  where id = 'e4444444-4444-4444-8444-444444444444';

  if v_durum <> 'in_progress' then raise exception 'KALDI: durum %', v_durum; end if;
  if array_length(v_turler, 1) <> 2 then
    raise exception 'KALDI: liste kaybedildi: %', v_turler;
  end if;
  raise notice 'GECTI: geri almada durum donuyor, islem listesi korunuyor';
end $$;

\echo '--- TEST 12: tekrar tamamlamada liste guncelleniyor ---'
do $$
declare v_turler service_type[];
begin
  perform complete_job('e4444444-4444-4444-8444-444444444444',
                       array['revision']::service_type[]);
  select service_types into v_turler from jobs
  where id = 'e4444444-4444-4444-8444-444444444444';
  if v_turler <> array['revision']::service_type[] then
    raise exception 'KALDI: liste guncellenmedi: %', v_turler;
  end if;
  raise notice 'GECTI: tekrar tamamlamada liste guncelleniyor';
end $$;

\echo '--- TEST 13: gecersiz tur reddediliyor ---'
do $$
begin
  insert into jobs (id, segment_id, title)
  values ('e7777777-7777-4777-8777-777777777777',
          'e2222222-2222-4222-8222-222222222222', 'Gecersiz tur isi');
  begin
    perform complete_job('e7777777-7777-4777-8777-777777777777',
                         array['uydurma']::service_type[]);
    raise exception 'KALDI: gecersiz tur kabul edildi';
  exception
    when invalid_text_representation then
      raise notice 'GECTI: gecersiz islem turu reddedildi';
  end;
end $$;

\echo '--- TEST 14: enum yalnizca winding ve revision ---'
do $$
declare v text;
begin
  select string_agg(enumlabel, ',' order by enumsortorder) into v
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'service_type';
  if v <> 'winding,revision' then raise exception 'KALDI: enum %', v; end if;
  raise notice 'GECTI: islem turu enum ''winding,revision''';
end $$;

\echo '--- TEST 15: eski tek-deger kolonu kaldirildi ---'
do $$
declare v integer;
begin
  /* Iki kaynak kalirsa biri guncellenmeyip sessizce yanlis veri verir. */
  select count(*) into v from information_schema.columns
  where table_schema = 'public' and table_name = 'jobs'
    and column_name = 'service_type';
  if v <> 0 then raise exception 'KALDI: eski service_type kolonu duruyor'; end if;
  raise notice 'GECTI: eski tek-deger kolonu kaldirildi';
end $$;

\echo '--- TEST 16: yeni imza anon''a kapali ---'
do $$
begin
  if has_function_privilege('anon',
       'complete_job(uuid, service_type[], boolean)', 'EXECUTE') then
    raise exception 'KALDI: anon is tamamlayabiliyor';
  end if;
  if not has_function_privilege('authenticated',
       'complete_job(uuid, service_type[], boolean)', 'EXECUTE') then
    raise exception 'KALDI: personel is tamamlayamiyor';
  end if;
  if has_function_privilege('anon',
       'islem_turleri_gecerli(service_type[])', 'EXECUTE') then
    raise exception 'KALDI: anon kisit fonksiyonunu cagirabiliyor';
  end if;
  raise notice 'GECTI: yeni imza anon''a kapali, personele acik';
end $$;

rollback;

\echo ''
\echo '===== ISLEM TURU TESTLERI TAMAM ====='
