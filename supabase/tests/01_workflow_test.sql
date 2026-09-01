-- =============================================================================
-- İş akışı fonksiyonlarının davranış testleri.
-- Yerel Postgres'te çalıştırılır:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/01_workflow_test.sql
-- Test verisi sonunda geri alınır (rollback).
-- =============================================================================

begin;

\set ON_ERROR_STOP on
\echo '--- kurulum ---'

insert into customers (id, name, phone)
values ('11111111-1111-1111-1111-111111111111', 'Test Fabrika A.Ş.', '05550000000');

insert into segments (id, customer_id, segment_date, note)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  current_date,
  '4 kalem iş geldi'
);

insert into jobs (id, segment_id, title)
values (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  '75 kW asenkron motor sarımı'
);

-- Rulman: adet bazlı. Bakır tel: kg bazlı. PRD 5.3'e göre iki sayaç bağımsız.
insert into products (id, name, sku, purchase_price, unit_type_default, qty_pieces, qty_kg)
values
  ('44444444-4444-4444-4444-444444444444', 'Rulman 6206', 'RLM-6206', 120.00, 'piece', 10, 0),
  ('55555555-5555-5555-5555-555555555555', 'Bakır Tel 1.2mm', 'BKR-12', 480.50, 'kg', 0, 25.500);

\echo '--- TEST 1: add_job_product alis fiyatini sabitliyor mu ---'
select add_job_product(
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  2, 0
) as rulman_satiri;

select add_job_product(
  '33333333-3333-3333-3333-333333333333',
  '55555555-5555-5555-5555-555555555555',
  0, 4.250
) as tel_satiri;

-- Fiyat degisse bile snapshot sabit kalmali (PRD Soru 3)
update products set purchase_price = 999.99
where id = '44444444-4444-4444-4444-444444444444';

do $$
declare v_snapshot numeric;
begin
  select unit_cost_snapshot into v_snapshot
  from job_products
  where job_id = '33333333-3333-3333-3333-333333333333'
    and product_id = '44444444-4444-4444-4444-444444444444';

  if v_snapshot <> 120.00 then
    raise exception 'BASARISIZ: snapshot fiyat degismis, beklenen 120.00, gelen %', v_snapshot;
  end if;
  raise notice 'GECTI: alis fiyati snapshot olarak sabit kaldi (120.00)';
end $$;

\echo '--- TEST 2: complete_job stogu dusuyor mu ---'
select complete_job('33333333-3333-3333-3333-333333333333') as sonuc;

do $$
declare
  v_pieces integer;
  v_kg numeric;
  v_status job_status;
  v_moves integer;
  v_token text;
begin
  select qty_pieces into v_pieces from products where id = '44444444-4444-4444-4444-444444444444';
  select qty_kg into v_kg from products where id = '55555555-5555-5555-5555-555555555555';
  select status into v_status from jobs where id = '33333333-3333-3333-3333-333333333333';
  select count(*) into v_moves from stock_movements where job_id = '33333333-3333-3333-3333-333333333333';
  select token into v_token from qr_codes where job_id = '33333333-3333-3333-3333-333333333333';

  if v_pieces <> 8 then raise exception 'BASARISIZ: adet 8 olmali, gelen %', v_pieces; end if;
  if v_kg <> 21.250 then raise exception 'BASARISIZ: kg 21.250 olmali, gelen %', v_kg; end if;
  if v_status <> 'completed' then raise exception 'BASARISIZ: durum completed olmali'; end if;
  if v_moves <> 2 then raise exception 'BASARISIZ: 2 stok hareketi olmali, gelen %', v_moves; end if;
  if v_token is null or length(v_token) <> 32 then
    raise exception 'BASARISIZ: 32 karakterlik QR token uretilmeliydi, gelen %', v_token;
  end if;

  raise notice 'GECTI: stok 10->8 adet, 25.500->21.250 kg; 2 hareket kaydi; QR token uretildi';
end $$;

\echo '--- TEST 3: ayni is iki kez tamamlanamaz ---'
do $$
begin
  perform complete_job('33333333-3333-3333-3333-333333333333');
  raise exception 'BASARISIZ: ikinci tamamlama hata vermeliydi';
exception
  when invalid_parameter_value then
    raise notice 'GECTI: ikinci tamamlama reddedildi';
end $$;

\echo '--- TEST 4: tamamlanmis ise malzeme eklenemez ---'
do $$
begin
  perform add_job_product(
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444', 1, 0
  );
  raise exception 'BASARISIZ: tamamlanmis ise malzeme eklenebildi';
exception
  when invalid_parameter_value then
    raise notice 'GECTI: tamamlanmis ise malzeme ekleme reddedildi';
end $$;

\echo '--- TEST 5: QR sayfasi ticari bilgi sizdirmiyor mu ---'
do $$
declare
  v_token text;
  v_json jsonb;
  v_text text;
begin
  select token into v_token from qr_codes where job_id = '33333333-3333-3333-3333-333333333333';
  v_json := public_job_by_token(v_token);
  v_text := v_json::text;

  if v_json is null then raise exception 'BASARISIZ: token ile kayit bulunamadi'; end if;
  if jsonb_array_length(v_json -> 'materials') <> 2 then
    raise exception 'BASARISIZ: 2 malzeme donmeliydi';
  end if;
  -- Fiyat/maliyet alanlari kesinlikle olmamali (PRD 5.6)
  if v_text like '%purchase_price%' or v_text like '%unit_cost%'
     or v_text like '%120%' or v_text like '%480%' then
    raise exception 'BASARISIZ: cikti ticari bilgi iceriyor: %', v_text;
  end if;
  if v_text like '%Test Fabrika%' then
    raise exception 'BASARISIZ: cikti musteri kimligi iceriyor';
  end if;

  raise notice 'GECTI: QR ciktisi yalnizca malzeme adi/miktari donuyor';
end $$;

\echo '--- TEST 6: gecersiz token null donuyor ---'
do $$
begin
  if public_job_by_token('gecersiztoken') is not null then
    raise exception 'BASARISIZ: gecersiz token icin null donmeliydi';
  end if;
  raise notice 'GECTI: gecersiz token null';
end $$;

\echo '--- TEST 7: revert stogu iade ediyor mu ---'
select revert_job_completion('33333333-3333-3333-3333-333333333333') as sonuc;

do $$
declare
  v_pieces integer;
  v_kg numeric;
  v_status job_status;
  v_completed timestamptz;
  v_moves integer;
begin
  select qty_pieces into v_pieces from products where id = '44444444-4444-4444-4444-444444444444';
  select qty_kg into v_kg from products where id = '55555555-5555-5555-5555-555555555555';
  select status, completed_at into v_status, v_completed
  from jobs where id = '33333333-3333-3333-3333-333333333333';
  select count(*) into v_moves from stock_movements
  where job_id = '33333333-3333-3333-3333-333333333333' and movement_type = 'job_revert';

  if v_pieces <> 10 then raise exception 'BASARISIZ: adet 10 olmali, gelen %', v_pieces; end if;
  if v_kg <> 25.500 then raise exception 'BASARISIZ: kg 25.500 olmali, gelen %', v_kg; end if;
  if v_status <> 'in_progress' then raise exception 'BASARISIZ: durum in_progress olmali'; end if;
  if v_completed is not null then raise exception 'BASARISIZ: completed_at temizlenmeliydi'; end if;
  if v_moves <> 2 then raise exception 'BASARISIZ: 2 iade hareketi olmali, gelen %', v_moves; end if;

  raise notice 'GECTI: stok iade edildi, durum in_progress, 2 iade hareketi';
end $$;

\echo '--- TEST 8: stok yetersizse tamamlama reddediliyor mu ---'
insert into jobs (id, segment_id, title)
values (
  '66666666-6666-6666-6666-666666666666',
  '22222222-2222-2222-2222-222222222222',
  'Stok testi isi'
);

select add_job_product(
  '66666666-6666-6666-6666-666666666666',
  '44444444-4444-4444-4444-444444444444',
  999, 0
);

do $$
begin
  perform complete_job('66666666-6666-6666-6666-666666666666');
  raise exception 'BASARISIZ: yetersiz stokla tamamlanabildi';
exception
  when check_violation then
    raise notice 'GECTI: yetersiz stok reddedildi';
end $$;

\echo '--- TEST 9: allow_negative ile zorlanabiliyor mu ---'
select complete_job('66666666-6666-6666-6666-666666666666', true) as sonuc;

do $$
declare v_pieces integer;
begin
  select qty_pieces into v_pieces from products where id = '44444444-4444-4444-4444-444444444444';
  if v_pieces <> -989 then
    raise exception 'BASARISIZ: -989 beklenirdi, gelen %', v_pieces;
  end if;
  raise notice 'GECTI: allow_negative ile tamamlandi, stok -989 (bilincli eksi)';
end $$;

\echo '--- TEST 10: jobs durum/completed_at tutarliligi zorunlu mu ---'
do $$
begin
  update jobs set status = 'completed' where id = '33333333-3333-3333-3333-333333333333';
  raise exception 'BASARISIZ: completed_at olmadan completed yapilabildi';
exception
  when check_violation then
    raise notice 'GECTI: completed_at olmadan completed engellendi';
end $$;

\echo '--- TEST 11: miktarsiz malzeme satiri engelleniyor mu ---'
do $$
begin
  insert into job_products (job_id, product_id, qty_pieces_used, qty_kg_used, unit_cost_snapshot)
  values (
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444', 0, 0, 10
  );
  raise exception 'BASARISIZ: miktarsiz satir eklenebildi';
exception
  when check_violation then
    raise notice 'GECTI: miktarsiz malzeme satiri engellendi';
end $$;

\echo '--- TEST 12: apply_stock_movement is hareketi tipini reddediyor mu ---'
do $$
begin
  perform apply_stock_movement(
    '44444444-4444-4444-4444-444444444444', 'job_out', -1, 0, null
  );
  raise exception 'BASARISIZ: job_out elle uygulanabildi';
exception
  when invalid_parameter_value then
    raise notice 'GECTI: job_out elle uygulanamiyor';
end $$;

\echo '--- TEST 13: stok girisi hareket kaydi olusturuyor mu ---'
select apply_stock_movement(
  '55555555-5555-5555-5555-555555555555', 'purchase_in', 0, 10.000, 'Fatura #123'
) as sonuc;

do $$
declare
  v_kg numeric;
  v_note text;
begin
  select qty_kg into v_kg from products where id = '55555555-5555-5555-5555-555555555555';
  /* Acilis stogu trigger'i da bir purchase_in yaziyor ve ayni transaction
     icinde created_at ayni degeri aliyor; bu yuzden notla filtreliyoruz. */
  select note into v_note from stock_movements
  where product_id = '55555555-5555-5555-5555-555555555555'
    and movement_type = 'purchase_in'
    and note = 'Fatura #123';

  if v_kg <> 35.500 then raise exception 'BASARISIZ: 35.500 beklenirdi, gelen %', v_kg; end if;
  if v_note <> 'Fatura #123' then raise exception 'BASARISIZ: not kaydedilmedi'; end if;
  raise notice 'GECTI: stok girisi 25.500->35.500 kg, hareket notu kaydedildi';
end $$;

\echo '--- TEST 14: ayni fatura no iki kez girilemez ---'
insert into invoices (customer_id, invoice_no, gross_amount, net_amount)
values ('11111111-1111-1111-1111-111111111111', 'FTR-001', 1000, 800);

do $$
begin
  insert into invoices (customer_id, invoice_no, gross_amount, net_amount)
  values ('11111111-1111-1111-1111-111111111111', 'FTR-001', 500, 400);
  raise exception 'BASARISIZ: mukerrer fatura no kabul edildi';
exception
  when unique_violation then
    raise notice 'GECTI: mukerrer fatura no engellendi';
end $$;

-- invoice_no bos olan birden fazla fatura olabilmeli (kismi unique index)
insert into invoices (customer_id, gross_amount, net_amount)
values
  ('11111111-1111-1111-1111-111111111111', 100, 90),
  ('11111111-1111-1111-1111-111111111111', 200, 180);
\echo 'GECTI: invoice_no bos olan coklu fatura kabul edildi'

\echo '--- TEST 15: faturasi olan musteri silinemiyor mu ---'
-- invoices.customer_id = on delete restrict. Muhasebe kaydinin musteri
-- silinince sessizce yok olmamasi icin bilincli tercih; arayuz bu durumda
-- silme yerine arsivleme onermeli.
do $$
begin
  delete from customers where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'BASARISIZ: faturasi olan musteri silinebildi';
exception
  when foreign_key_violation then
    raise notice 'GECTI: faturasi olan musteri silinemiyor (kayit korundu)';
end $$;

\echo '--- TEST 16: faturasiz musteride segment/is zincirleme siliniyor mu ---'
do $$
declare
  v_jobs integer;
  v_moves integer;
begin
  delete from invoices where customer_id = '11111111-1111-1111-1111-111111111111';
  delete from customers where id = '11111111-1111-1111-1111-111111111111';

  select count(*) into v_jobs from jobs where segment_id = '22222222-2222-2222-2222-222222222222';
  if v_jobs <> 0 then raise exception 'BASARISIZ: isler silinmedi, kalan %', v_jobs; end if;

  -- stock_movements.job_id = on delete set null: hareket gecmisi korunmali
  select count(*) into v_moves from stock_movements;
  if v_moves = 0 then raise exception 'BASARISIZ: stok hareket gecmisi de silindi'; end if;

  raise notice 'GECTI: musteri -> segment -> is zincirleme silindi, stok hareket gecmisi korundu (% kayit)', v_moves;
end $$;

rollback;

\echo ''
\echo '===================== TUM TESTLER GECTI ====================='
