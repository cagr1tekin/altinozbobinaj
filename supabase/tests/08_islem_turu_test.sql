-- =============================================================================
-- Islem turu: motor sarimi / revizyon (0011)
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

\echo '--- TEST 1: islem turu secilmeden tamamlanamiyor ---'
do $$
begin
  insert into jobs (id, segment_id, title)
  values ('e3333333-3333-4333-8333-333333333333',
          'e2222222-2222-4222-8222-222222222222', 'Tur secilmeyen is');
  begin
    perform complete_job('e3333333-3333-4333-8333-333333333333', null);
    raise exception 'KALDI: islem turu olmadan tamamlandi';
  exception
    when invalid_parameter_value then
      raise notice 'GECTI: islem turu olmadan tamamlanamiyor';
  end;
end $$;

\echo '--- TEST 2: tamamlanmamis iste tur bos olabiliyor ---'
do $$
declare v_tur text; v_durum job_status;
begin
  /* Is acilirken henuz ne yapilacagi belli degil; kisit yalnizca
     tamamlanmis isi baglamali, yoksa is hic acilamaz. */
  select service_type::text, status into v_tur, v_durum
  from jobs where id = 'e3333333-3333-4333-8333-333333333333';
  if v_tur is not null then raise exception 'KALDI: acik iste tur % geldi', v_tur; end if;
  if v_durum = 'completed' then raise exception 'KALDI: is tamamlanmis gorunuyor'; end if;
  raise notice 'GECTI: acik iste islem turu bos kalabiliyor';
end $$;

\echo '--- TEST 3: revizyon secilip tamamlaniyor, deger saklaniyor ---'
do $$
declare v_sonuc jsonb; v_tur text;
begin
  v_sonuc := complete_job('e3333333-3333-4333-8333-333333333333', 'revision');

  if v_sonuc ->> 'service_type' <> 'revision' then
    raise exception 'KALDI: donen tur %', v_sonuc ->> 'service_type';
  end if;

  select service_type::text into v_tur from jobs
  where id = 'e3333333-3333-4333-8333-333333333333';
  if v_tur <> 'revision' then raise exception 'KALDI: saklanan tur %', v_tur; end if;

  raise notice 'GECTI: revizyon secildi, saklandi ve geri donduruldu';
end $$;

\echo '--- TEST 4: islem turu denetim gunlugune dusuyor ---'
do $$
declare v_kayit integer;
begin
  /* Sonradan "hangi islem secilmis, kim secmis" sorusu sorulabilmeli. */
  select count(*) into v_kayit from audit_log
  where entity = 'job' and entity_id = 'e3333333-3333-4333-8333-333333333333'
    and action = 'update' and details ? 'service_type';
  if v_kayit < 1 then raise exception 'KALDI: islem turu gunluge dusmedi'; end if;
  raise notice 'GECTI: islem turu degisikligi denetim gunlugunde';
end $$;

\echo '--- TEST 5: tamamlanmis isin turu bosaltilamiyor ---'
do $$
begin
  /* Kisit olmasaydi elle yapilan bir duzeltme musteriye gosterilecek
     belgeyi eksik birakirdi ve hangi isin ne oldugu hatirlanmak zorunda
     kalirdi. */
  update jobs set service_type = null
  where id = 'e3333333-3333-4333-8333-333333333333';
  raise exception 'KALDI: tamamlanmis isin turu bosaltilabildi';
exception
  when check_violation then
    raise notice 'GECTI: tamamlanmis isin turu bosaltilamiyor';
end $$;

\echo '--- TEST 6: QR ciktisi turu donduruyor, miktar hala gizli ---'
do $$
declare v jsonb; v_text text;
begin
  select public_job_by_token(token) into v from qr_codes
  where job_id = 'e3333333-3333-4333-8333-333333333333';
  v_text := v::text;

  if v is null then raise exception 'KALDI: QR ciktisi bos'; end if;
  if v ->> 'service_type' <> 'revision' then
    raise exception 'KALDI: tur donmedi: %', v_text;
  end if;

  /* 0010 kurali korunuyor: miktar musteriye maliyet ipucu verdigi icin
     hala donmemeli. */
  if v_text like '%qty_%' or v_text like '%unit_type%' then
    raise exception 'KALDI: miktar/birim sizdi: %', v_text;
  end if;
  if v_text like '%purchase_price%' or v_text like '%unit_cost%' then
    raise exception 'KALDI: fiyat sizdi: %', v_text;
  end if;

  raise notice 'GECTI: QR turu donduruyor, miktar ve fiyat gizli';
end $$;

\echo '--- TEST 7: motor sarimi da calisiyor ---'
do $$
declare v_tur text;
begin
  insert into jobs (id, segment_id, title)
  values ('e4444444-4444-4444-8444-444444444444',
          'e2222222-2222-4222-8222-222222222222', 'Sarim isi');
  perform complete_job('e4444444-4444-4444-8444-444444444444', 'winding');

  select service_type::text into v_tur from jobs
  where id = 'e4444444-4444-4444-8444-444444444444';
  if v_tur <> 'winding' then raise exception 'KALDI: tur %', v_tur; end if;
  raise notice 'GECTI: motor sarimi secilebiliyor';
end $$;

\echo '--- TEST 8: geri alma turu KORUYOR ---'
do $$
declare v_tur text; v_durum job_status;
begin
  /* Geri alinan is tekrar tamamlanacak; onceki secim korunursa formda
     ne secildigi hatirlanabilir. Ayrica kisit yalnizca tamamlanmis isi
     bagladigi icin tur dolu kalmasi sorun degil. */
  perform revert_job_completion('e4444444-4444-4444-8444-444444444444');

  select service_type::text, status into v_tur, v_durum from jobs
  where id = 'e4444444-4444-4444-8444-444444444444';

  if v_durum <> 'in_progress' then raise exception 'KALDI: durum %', v_durum; end if;
  if v_tur <> 'winding' then raise exception 'KALDI: tur kaybedildi: %', v_tur; end if;
  raise notice 'GECTI: geri almada durum donuyor, islem turu korunuyor';
end $$;

\echo '--- TEST 9: geri alinan is farkli turle tekrar tamamlanabiliyor ---'
do $$
declare v_tur text;
begin
  perform complete_job('e4444444-4444-4444-8444-444444444444', 'revision');
  select service_type::text into v_tur from jobs
  where id = 'e4444444-4444-4444-8444-444444444444';
  if v_tur <> 'revision' then raise exception 'KALDI: tur guncellenmedi: %', v_tur; end if;
  raise notice 'GECTI: tekrar tamamlamada tur guncelleniyor';
end $$;

\echo '--- TEST 10: enum yalnizca winding ve revision ---'
do $$
declare v text;
begin
  select string_agg(enumlabel, ',' order by enumsortorder) into v
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'service_type';
  if v <> 'winding,revision' then raise exception 'KALDI: enum %', v; end if;
  raise notice 'GECTI: islem turu enum ''winding,revision''';
end $$;

\echo '--- TEST 11: gecersiz tur reddediliyor ---'
do $$
begin
  insert into jobs (id, segment_id, title)
  values ('e5555555-5555-4555-8555-555555555555',
          'e2222222-2222-4222-8222-222222222222', 'Gecersiz tur isi');
  begin
    perform complete_job('e5555555-5555-4555-8555-555555555555', 'uydurma');
    raise exception 'KALDI: gecersiz tur kabul edildi';
  exception
    when invalid_text_representation then
      raise notice 'GECTI: gecersiz islem turu reddedildi';
  end;
end $$;

\echo '--- TEST 12: yeni imza anon''a kapali ---'
do $$
begin
  if has_function_privilege('anon',
       'complete_job(uuid, service_type, boolean)', 'EXECUTE') then
    raise exception 'KALDI: anon is tamamlayabiliyor';
  end if;
  if not has_function_privilege('authenticated',
       'complete_job(uuid, service_type, boolean)', 'EXECUTE') then
    raise exception 'KALDI: personel is tamamlayamiyor';
  end if;
  raise notice 'GECTI: yeni imza anon''a kapali, personele acik';
end $$;

rollback;

\echo ''
\echo '===== ISLEM TURU TESTLERI TAMAM ====='
