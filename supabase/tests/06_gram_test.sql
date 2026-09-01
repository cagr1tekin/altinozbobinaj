-- =============================================================================
-- Gram birimi ve tek-miktar davranisi (0008).
-- Calistirma:
--   docker cp supabase/tests/06_gram_test.sql altinoz-pg:/tmp/t6.sql
--   docker exec altinoz-pg psql -U postgres -d altinoz -v ON_ERROR_STOP=1 -f /tmp/t6.sql
-- Test verisi sonunda rollback ile geri alinir.
-- =============================================================================

begin;
\set ON_ERROR_STOP on

insert into customers (id, name)
  values ('7a1e4c2b-9d31-4f80-a6c5-2b8e0f4d1a93', 'Gram Test A.S.');
insert into segments (id, customer_id, segment_date)
  values ('8b2f5d3c-ae42-4091-b7d6-3c9f1e5a2b04',
          '7a1e4c2b-9d31-4f80-a6c5-2b8e0f4d1a93', current_date);
insert into jobs (id, segment_id, title)
  values ('9c3a6e4d-bf53-41a2-c8e7-4d0a2f6b3c15',
          '8b2f5d3c-ae42-4091-b7d6-3c9f1e5a2b04', 'Gram testi isi');

-- Gram urunde fiyat KILOGRAM basina: 480 TL/kg
insert into products (id, name, purchase_price, unit_type_default)
  values ('1d4b7f5e-c064-42b3-d9f8-5e1b3a7c4d26', 'Bakir Tel', 480.00, 'gram');
-- Adet urunde fiyat ADET basina: 120 TL/adet
insert into products (id, name, purchase_price, unit_type_default)
  values ('2e5c8a6f-d175-43c4-eaf9-6f2c4b8d5e37', 'Rulman', 120.00, 'piece');

\echo '--- TEST 1: tek miktar dogru kolona yaziliyor ---'
do $$
declare v_p products; v_r products;
begin
  perform apply_stock_movement('1d4b7f5e-c064-42b3-d9f8-5e1b3a7c4d26','purchase_in',25000,'gram girisi');
  perform apply_stock_movement('2e5c8a6f-d175-43c4-eaf9-6f2c4b8d5e37','purchase_in',10,'adet girisi');

  select * into v_p from products where id='1d4b7f5e-c064-42b3-d9f8-5e1b3a7c4d26';
  select * into v_r from products where id='2e5c8a6f-d175-43c4-eaf9-6f2c4b8d5e37';

  if v_p.qty_grams <> 25000 then raise exception 'KALDI: gram %', v_p.qty_grams; end if;
  if v_p.qty_pieces <> 0 then raise exception 'KALDI: gram urunun adedi kirlendi: %', v_p.qty_pieces; end if;
  if v_r.qty_pieces <> 10 then raise exception 'KALDI: adet %', v_r.qty_pieces; end if;
  if v_r.qty_grams <> 0 then raise exception 'KALDI: adet urunun grami kirlendi: %', v_r.qty_grams; end if;
  raise notice 'GECTI: miktar urunun kendi birimine yazildi, diger kolon kirlenmedi';
end $$;

\echo '--- TEST 2: malzeme de dogru birime yaziliyor ---'
do $$
declare v_jp job_products;
begin
  perform add_job_product('9c3a6e4d-bf53-41a2-c8e7-4d0a2f6b3c15',
                          '1d4b7f5e-c064-42b3-d9f8-5e1b3a7c4d26', 4250);
  select * into v_jp from job_products
  where job_id='9c3a6e4d-bf53-41a2-c8e7-4d0a2f6b3c15'
    and product_id='1d4b7f5e-c064-42b3-d9f8-5e1b3a7c4d26';

  if v_jp.qty_grams_used <> 4250 then raise exception 'KALDI: gram %', v_jp.qty_grams_used; end if;
  if v_jp.qty_pieces_used <> 0 then raise exception 'KALDI: adet kirlendi'; end if;
  if v_jp.unit_cost_snapshot <> 480.00 then raise exception 'KALDI: fiyat sabitlenmedi'; end if;
  raise notice 'GECTI: malzeme gram kolonuna yazildi, alis fiyati sabitlendi';
end $$;

\echo '--- TEST 3: maliyet gram urunde 1000e bolunuyor (fiyat TL/kg) ---'
do $$
declare v_maliyet numeric;
begin
  -- 4250 gram x 480 TL/kg = 2040 TL
  select material_cost into v_maliyet from job_costs
  where job_id='9c3a6e4d-bf53-41a2-c8e7-4d0a2f6b3c15';

  if v_maliyet <> 2040.00 then
    raise exception 'KALDI: 2040.00 beklenirdi, gelen %', v_maliyet;
  end if;
  raise notice 'GECTI: 4250 gram x 480 TL/kg = 2040 TL';
end $$;

\echo '--- TEST 4: adet urununde fiyat dogrudan carpiliyor ---'
do $$
declare v_maliyet numeric;
begin
  perform add_job_product('9c3a6e4d-bf53-41a2-c8e7-4d0a2f6b3c15',
                          '2e5c8a6f-d175-43c4-eaf9-6f2c4b8d5e37', 3);
  -- 2040 + (3 x 120) = 2400
  select material_cost into v_maliyet from job_costs
  where job_id='9c3a6e4d-bf53-41a2-c8e7-4d0a2f6b3c15';

  if v_maliyet <> 2400.00 then
    raise exception 'KALDI: 2400.00 beklenirdi, gelen %', v_maliyet;
  end if;
  raise notice 'GECTI: adet maliyeti bolunmeden ekleniyor (2400 TL)';
end $$;

\echo '--- TEST 5: tamamlama stogu kendi biriminden dusuyor ---'
do $$
declare v_p products; v_r products;
begin
  perform complete_job('9c3a6e4d-bf53-41a2-c8e7-4d0a2f6b3c15');
  select * into v_p from products where id='1d4b7f5e-c064-42b3-d9f8-5e1b3a7c4d26';
  select * into v_r from products where id='2e5c8a6f-d175-43c4-eaf9-6f2c4b8d5e37';

  if v_p.qty_grams <> 20750 then raise exception 'KALDI: gram %, 20750 bekleniyordu', v_p.qty_grams; end if;
  if v_r.qty_pieces <> 7 then raise exception 'KALDI: adet %, 7 bekleniyordu', v_r.qty_pieces; end if;
  raise notice 'GECTI: 25000-4250=20750 gram, 10-3=7 adet';
end $$;

\echo '--- TEST 6: geri alma stogu iade ediyor ---'
do $$
declare v_p products;
begin
  perform revert_job_completion('9c3a6e4d-bf53-41a2-c8e7-4d0a2f6b3c15');
  select * into v_p from products where id='1d4b7f5e-c064-42b3-d9f8-5e1b3a7c4d26';
  if v_p.qty_grams <> 25000 then raise exception 'KALDI: iade sonrasi %', v_p.qty_grams; end if;
  raise notice 'GECTI: gram stogu iade edildi';
end $$;

\echo '--- TEST 7: mutabakat tutuyor (gram tam sayi, yuvarlama yok) ---'
do $$
declare v integer;
begin
  select count(*) into v from stock_reconciliation();
  if v <> 0 then raise exception 'KALDI: % urunde fark var', v; end if;
  raise notice 'GECTI: stok ile hareket gecmisi birebir tutuyor';
end $$;

\echo '--- TEST 8: sifir miktar reddediliyor ---'
do $$
begin
  perform apply_stock_movement('1d4b7f5e-c064-42b3-d9f8-5e1b3a7c4d26','purchase_in',0,null);
  raise exception 'KALDI: sifir miktar kabul edildi';
exception
  when invalid_parameter_value then
    raise notice 'GECTI: sifir miktar reddedildi';
end $$;

\echo '--- TEST 9: stogu eksiye dusuren hareket reddediliyor ---'
do $$
begin
  perform apply_stock_movement('1d4b7f5e-c064-42b3-d9f8-5e1b3a7c4d26','adjustment',-99999,null);
  raise exception 'KALDI: eksi stok kabul edildi';
exception
  when check_violation then
    raise notice 'GECTI: stogu eksiye dusuren hareket reddedildi';
end $$;

\echo '--- TEST 10: birim enum sadece piece ve gram ---'
do $$
declare v text;
begin
  select string_agg(enumlabel, ',' order by enumsortorder) into v
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'unit_type';

  if v <> 'piece,gram' then raise exception 'KALDI: enum %', v; end if;
  raise notice 'GECTI: birim enum ''piece,gram'' (kg ve both kaldirildi)';
end $$;

\echo '--- TEST 11: gram kolonlari tam sayi (ondalik saklanamaz) ---'
do $$
declare v text;
begin
  select string_agg(column_name || ':' || data_type, ', ' order by column_name) into v
  from information_schema.columns
  where table_schema = 'public'
    and column_name in ('qty_grams', 'qty_grams_used', 'qty_grams_delta');

  if v <> 'qty_grams:integer, qty_grams_delta:integer, qty_grams_used:integer' then
    raise exception 'KALDI: %', v;
  end if;
  raise notice 'GECTI: uc gram kolonu da integer';
end $$;

\echo '--- TEST 12: anon yeni imzalari cagiramiyor ---'
do $$
begin
  if has_function_privilege('anon', 'apply_stock_movement(uuid, movement_type, integer, text)', 'EXECUTE') then
    raise exception 'KALDI: anon stok hareketi uygulayabiliyor';
  end if;
  if has_function_privilege('anon', 'add_job_product(uuid, uuid, integer)', 'EXECUTE') then
    raise exception 'KALDI: anon malzeme ekleyebiliyor';
  end if;
  if has_table_privilege('anon', 'job_costs', 'SELECT') then
    raise exception 'KALDI: anon maliyet gorunumunu okuyabiliyor';
  end if;
  raise notice 'GECTI: yeni imzalar anon''a kapali';
end $$;

rollback;

\echo ''
\echo '===== GRAM TESTLERI TAMAM ====='
