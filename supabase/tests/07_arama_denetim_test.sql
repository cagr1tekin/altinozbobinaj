-- =============================================================================
-- Panel aramasi ve denetim gunlugu testleri (0009).
-- Calistirma:
--   docker cp supabase/tests/07_arama_denetim_test.sql altinoz-pg:/tmp/t7.sql
--   docker exec altinoz-pg psql -U postgres -d altinoz -v ON_ERROR_STOP=1 -f /tmp/t7.sql
-- Test verisi sonunda rollback ile geri alinir.
-- =============================================================================

begin;
\set ON_ERROR_STOP on

-- Denetim kaydinin aktoru: gercek Supabase'de JWT'den gelir
set local "request.jwt.claims" =
  '{"sub":"3f8d1c2a-4b56-4789-9abc-1d2e3f4a5b6c","email":"usta@altinozbobinaj.com"}';

insert into customers (id, name, phone) values
  ('a1111111-1111-4111-8111-111111111111', 'İSMAİL ŞAHİN', '5551112233'),
  ('a2222222-2222-4222-8222-222222222222', 'Mehmet Öztürk', '5554445566'),
  ('a3333333-3333-4333-8333-333333333333', 'Yüzde %50 Ticaret', null);

insert into segments (id, customer_id, segment_date) values
  ('b1111111-1111-4111-8111-111111111111',
   'a1111111-1111-4111-8111-111111111111', '2026-08-12'),
  ('b2222222-2222-4222-8222-222222222222',
   'a2222222-2222-4222-8222-222222222222', '2026-08-20');

insert into jobs (id, segment_id, title) values
  ('c1111111-1111-4111-8111-111111111111',
   'b1111111-1111-4111-8111-111111111111', 'Siemens 7.5kW Motor Sarımı'),
  ('c2222222-2222-4222-8222-222222222222',
   'b2222222-2222-4222-8222-222222222222', 'Gamak Pompa Motoru');

-- =============================================================================
-- ARAMA
-- =============================================================================

\echo '--- TEST 1: musteri adiyla bulunuyor ---'
do $$
declare v record;
begin
  select * into v from panel_arama('mehmet') where tur = 'musteri';
  if v is null then raise exception 'KALDI: musteri bulunamadi'; end if;
  if v.musteri_adi <> 'Mehmet Öztürk' then raise exception 'KALDI: ad %', v.musteri_adi; end if;
  if v.is_id is not null then raise exception 'KALDI: musteri satirinda is dolu'; end if;
  raise notice 'GECTI: musteri adiyla bulunuyor, is alanlari bos';
end $$;

\echo '--- TEST 2: motor aratildiginda musteri > segment > motor doluyor ---'
do $$
declare v record;
begin
  select * into v from panel_arama('siemens');
  if v is null then raise exception 'KALDI: motor bulunamadi'; end if;
  if v.tur <> 'is' then raise exception 'KALDI: tur %', v.tur; end if;
  if v.musteri_adi <> 'İSMAİL ŞAHİN' then raise exception 'KALDI: musteri %', v.musteri_adi; end if;
  if v.segment_tarihi <> '2026-08-12' then raise exception 'KALDI: segment %', v.segment_tarihi; end if;
  if v.is_basligi <> 'Siemens 7.5kW Motor Sarımı' then raise exception 'KALDI: motor %', v.is_basligi; end if;
  if v.is_durumu is null then raise exception 'KALDI: durum bos'; end if;
  raise notice 'GECTI: kirilim tam — % > % > %', v.musteri_adi, v.segment_tarihi, v.is_basligi;
end $$;

\echo '--- TEST 3: Turkce buyuk/kucuk harf duyarli degil ---'
do $$
declare v integer;
begin
  -- "ismail" yazan kullanici "İSMAİL" kaydini bulmali (en_US collation bunu yapmiyor)
  select count(*) into v from panel_arama('ismail') where tur = 'musteri';
  if v <> 1 then raise exception 'KALDI: ismail -> İSMAİL eslesmedi (%)', v; end if;

  select count(*) into v from panel_arama('sahin') where tur = 'musteri';
  if v <> 1 then raise exception 'KALDI: sahin -> ŞAHİN eslesmedi (%)', v; end if;

  select count(*) into v from panel_arama('ÖZTÜRK') where tur = 'musteri';
  if v <> 1 then raise exception 'KALDI: OZTURK eslesmedi (%)', v; end if;

  select count(*) into v from panel_arama('ozturk') where tur = 'musteri';
  if v <> 1 then raise exception 'KALDI: ozturk -> Öztürk eslesmedi (%)', v; end if;

  raise notice 'GECTI: ismail/sahin/ozturk hepsi Turkce karsiligini buluyor';
end $$;

\echo '--- TEST 4: joker karakter somurulemiyor ---'
do $$
declare v integer; v_ad text;
begin
  /* '%50' arayan kullanici adinda gercekten "%50" gecen kaydi gormeli.
     Kacis olmasaydi % joker olur ve "50" iceren her sey donerdi. */
  select count(*) into v from panel_arama('%50');
  if v <> 1 then raise exception 'KALDI: %%50 ile % kayit dondu, 1 bekleniyordu', v; end if;

  select musteri_adi into v_ad from panel_arama('%50');
  if v_ad <> 'Yüzde %50 Ticaret' then raise exception 'KALDI: donen kayit %', v_ad; end if;

  /* '_iemens': _ joker olsaydi "Siemens..." kaydiyla eslesirdi. */
  select count(*) into v from panel_arama('_iemens');
  if v <> 0 then raise exception 'KALDI: _ joker gibi davrandi, % kayit dondu', v; end if;

  /* Yalnizca joker karakterlerden olusan terim de her seyi dondurmemeli. */
  select count(*) into v from panel_arama('%%');
  if v <> 0 then raise exception 'KALDI: %%%% ile % kayit dondu, 0 bekleniyordu', v; end if;

  raise notice 'GECTI: %% ve _ joker olarak yorumlanmiyor';
end $$;

\echo '--- TEST 5: tek harflik terim bos donuyor ---'
do $$
declare v integer;
begin
  select count(*) into v from panel_arama('a');
  if v <> 0 then raise exception 'KALDI: tek harf % kayit dondurdu', v; end if;
  select count(*) into v from panel_arama('   ');
  if v <> 0 then raise exception 'KALDI: bosluk % kayit dondurdu', v; end if;
  select count(*) into v from panel_arama(null);
  if v <> 0 then raise exception 'KALDI: null % kayit dondurdu', v; end if;
  raise notice 'GECTI: tek harf / bosluk / null bos donuyor';
end $$;

\echo '--- TEST 6: limit sinirlaniyor ---'
do $$
declare v integer;
begin
  select count(*) into v from panel_arama('motor', 1);
  if v <> 1 then raise exception 'KALDI: limit 1 iken % kayit', v; end if;
  -- Ust sinir 100'e kirpiliyor; asiri deger hata vermemeli
  select count(*) into v from panel_arama('motor', 100000);
  if v < 1 then raise exception 'KALDI: buyuk limit sonuc dondurmedi'; end if;
  raise notice 'GECTI: limit uygulanıyor ve kirpiliyor';
end $$;

\echo '--- TEST 7: arama anon''a kapali ---'
do $$
begin
  if has_function_privilege('anon', 'panel_arama(text, integer)', 'EXECUTE') then
    raise exception 'KALDI: anon arama yapabiliyor';
  end if;
  raise notice 'GECTI: panel_arama anon''a kapali';
end $$;

-- =============================================================================
-- DENETIM GUNLUGU
-- =============================================================================

\echo '--- TEST 8: ekleme gunluge dusuyor, aktor JWT''den geliyor ---'
do $$
declare v record;
begin
  select * into v from audit_log
  where entity = 'job' and entity_id = 'c1111111-1111-4111-8111-111111111111'
    and action = 'insert';

  if v is null then raise exception 'KALDI: is eklemesi gunluge dusmedi'; end if;
  if v.label <> 'Siemens 7.5kW Motor Sarımı' then raise exception 'KALDI: etiket %', v.label; end if;
  if v.actor_email <> 'usta@altinozbobinaj.com' then raise exception 'KALDI: eposta %', v.actor_email; end if;
  if v.actor_id <> '3f8d1c2a-4b56-4789-9abc-1d2e3f4a5b6c' then raise exception 'KALDI: aktor %', v.actor_id; end if;
  raise notice 'GECTI: ekleme kaydi + aktor bilgisi dogru';
end $$;

\echo '--- TEST 9: guncellemede yalnizca degisen alan saklaniyor ---'
do $$
declare v record;
begin
  update customers set phone = '5559998877'
  where id = 'a2222222-2222-4222-8222-222222222222';

  select * into v from audit_log
  where entity = 'customer' and entity_id = 'a2222222-2222-4222-8222-222222222222'
    and action = 'update'
  order by id desc limit 1;

  if v is null then raise exception 'KALDI: guncelleme dusmedi'; end if;
  if v.details -> 'phone' ->> 'eski' <> '5554445566' then
    raise exception 'KALDI: eski deger %', v.details -> 'phone' ->> 'eski'; end if;
  if v.details -> 'phone' ->> 'yeni' <> '5559998877' then
    raise exception 'KALDI: yeni deger %', v.details -> 'phone' ->> 'yeni'; end if;
  -- Degismeyen alanlar ayrintiya girmemeli, yoksa gunluk okunamaz olur
  if v.details ? 'name' then raise exception 'KALDI: degismeyen alan saklandi'; end if;
  if v.details ? 'updated_at' then raise exception 'KALDI: updated_at gurultusu saklandi'; end if;
  raise notice 'GECTI: yalnizca degisen alan saklandi (eski/yeni)';
end $$;

\echo '--- TEST 10: yalnizca updated_at degisince kayit yazilmiyor ---'
do $$
declare v_once integer; v_sonra integer;
begin
  select count(*) into v_once from audit_log where entity = 'customer';
  -- Ayni degerle guncelleme: set_updated_at trigger'i updated_at'i degistirir
  update customers set name = name
  where id = 'a2222222-2222-4222-8222-222222222222';
  select count(*) into v_sonra from audit_log where entity = 'customer';

  if v_sonra <> v_once then
    raise exception 'KALDI: anlamsiz guncelleme gunluge dustu (% -> %)', v_once, v_sonra;
  end if;
  raise notice 'GECTI: yalnizca updated_at degisen guncelleme yazilmadi';
end $$;

\echo '--- TEST 11: silme kaydi etiketi koruyor ---'
do $$
declare v record;
begin
  delete from jobs where id = 'c2222222-2222-4222-8222-222222222222';

  select * into v from audit_log
  where entity = 'job' and entity_id = 'c2222222-2222-4222-8222-222222222222'
    and action = 'delete';

  if v is null then raise exception 'KALDI: silme dusmedi'; end if;
  -- Kayit gitti ama gunluk ne silindigini soylemeli
  if v.label <> 'Gamak Pompa Motoru' then raise exception 'KALDI: etiket %', v.label; end if;
  raise notice 'GECTI: silinen kaydin adi gunlukte duruyor';
end $$;

\echo '--- TEST 12: stok hareketi ve urun de izleniyor ---'
do $$
declare v integer;
begin
  insert into products (id, name, unit_type_default, purchase_price)
  values ('d1111111-1111-4111-8111-111111111111', 'Bakir Tel', 'gram', 480);

  perform apply_stock_movement(
    'd1111111-1111-4111-8111-111111111111', 'purchase_in', 25000, 'test girisi');

  select count(*) into v from audit_log
  where entity = 'product' and entity_id = 'd1111111-1111-4111-8111-111111111111';
  if v < 1 then raise exception 'KALDI: urun eklemesi izlenmedi'; end if;

  select count(*) into v from audit_log where entity = 'stock_movement';
  if v < 1 then raise exception 'KALDI: stok hareketi izlenmedi'; end if;

  raise notice 'GECTI: urun ve stok hareketi izleniyor';
end $$;

\echo '--- TEST 13: malzeme ekleme urun adiyla izleniyor ---'
do $$
declare v record;
begin
  perform add_job_product(
    'c1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111', 4250);

  select * into v from audit_log
  where entity = 'job_product' and action = 'insert'
  order by id desc limit 1;

  if v is null then raise exception 'KALDI: malzeme eklemesi izlenmedi'; end if;
  if v.label <> 'Bakir Tel' then raise exception 'KALDI: etiket %, urun adi bekleniyordu', v.label; end if;
  raise notice 'GECTI: malzeme satiri urun adiyla izleniyor';
end $$;

\echo '--- TEST 14: gunluk salt-eklenir (guncelleme/silme yetkisi yok) ---'
do $$
begin
  if has_table_privilege('authenticated', 'audit_log', 'UPDATE') then
    raise exception 'KALDI: personel denetim kaydini degistirebiliyor';
  end if;
  if has_table_privilege('authenticated', 'audit_log', 'DELETE') then
    raise exception 'KALDI: personel denetim kaydini silebiliyor';
  end if;
  if has_table_privilege('authenticated', 'audit_log', 'INSERT') then
    raise exception 'KALDI: personel gunluge dogrudan yazabiliyor';
  end if;
  if not has_table_privilege('authenticated', 'audit_log', 'SELECT') then
    raise exception 'KALDI: personel gunlugu okuyamiyor';
  end if;
  raise notice 'GECTI: personel yalnizca okuyabiliyor, degistirip silemiyor';
end $$;

\echo '--- TEST 15: gunluk anon''a tamamen kapali ---'
do $$
begin
  if has_table_privilege('anon', 'audit_log', 'SELECT') then
    raise exception 'KALDI: anon denetim gunlugunu okuyabiliyor';
  end if;
  if has_function_privilege('anon', 'audit_kaydet(text, uuid, text, jsonb)', 'EXECUTE') then
    raise exception 'KALDI: anon gunluge yazabiliyor';
  end if;
  if has_function_privilege('anon', 'audit_trigger()', 'EXECUTE') then
    raise exception 'KALDI: anon trigger fonksiyonunu cagirabiliyor';
  end if;
  raise notice 'GECTI: denetim gunlugu anon''a kapali';
end $$;

\echo '--- TEST 16: audit_kaydet PDF eylemini yaziyor ---'
do $$
declare v record;
begin
  perform audit_kaydet('report', null, 'Donem raporu 2026-08',
                       jsonb_build_object('bas', '2026-08-01', 'bit', '2026-08-31'));

  select * into v from audit_log where action = 'pdf' order by id desc limit 1;
  if v is null then raise exception 'KALDI: pdf kaydi yazilmadi'; end if;
  if v.entity <> 'report' then raise exception 'KALDI: varlik %', v.entity; end if;
  if v.actor_email <> 'usta@altinozbobinaj.com' then raise exception 'KALDI: aktor %', v.actor_email; end if;
  if v.details ->> 'bas' <> '2026-08-01' then raise exception 'KALDI: ayrinti kaybedildi'; end if;
  raise notice 'GECTI: PDF eylemi aktor ve ayrintiyla yazildi';
end $$;

\echo '--- TEST 17: oturumsuz audit_kaydet reddediliyor ---'
do $$
begin
  set local "request.jwt.claims" = '';
  begin
    perform audit_kaydet('report', null, 'oturumsuz deneme');
    raise exception 'KALDI: oturumsuz kayit kabul edildi';
  exception
    when insufficient_privilege then
      raise notice 'GECTI: oturumsuz denetim kaydi reddedildi';
  end;
end $$;

\echo '--- TEST 18: gecersiz varlik adi reddediliyor ---'
do $$
begin
  set local "request.jwt.claims" =
    '{"sub":"3f8d1c2a-4b56-4789-9abc-1d2e3f4a5b6c","email":"usta@altinozbobinaj.com"}';
  begin
    perform audit_kaydet('uydurma_varlik', null, 'deneme');
    raise exception 'KALDI: gecersiz varlik adi kabul edildi';
  exception
    when check_violation then
      raise notice 'GECTI: gecersiz varlik adi kisit tarafindan reddedildi';
  end;
end $$;

rollback;

\echo ''
\echo '===== ARAMA VE DENETIM TESTLERI TAMAM ====='
