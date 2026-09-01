-- =============================================================================
-- Faz 5 davranış testleri: aylık özet, stok mutabakatı.
-- Çalıştırma:
--   docker cp supabase/tests/03_faz5_test.sql altinoz-pg:/tmp/t3.sql
--   docker exec altinoz-pg psql -U postgres -d altinoz -v ON_ERROR_STOP=1 -f /tmp/t3.sql
-- Test verisi sonunda rollback ile geri alınır.
-- =============================================================================

begin;
\set ON_ERROR_STOP on

insert into customers (id, name)
  values ('5f7cf10e-6c49-48e9-a144-4ecbb1106ddc', 'Ozet Test A.S.');
insert into segments (id, customer_id)
  values ('6dbb15c7-afd3-4608-b32c-d118e9c44784', '5f7cf10e-6c49-48e9-a144-4ecbb1106ddc');
insert into jobs (id, segment_id, title)
  values ('379e8a09-f025-4484-9ae3-3a4b78f9de36', '6dbb15c7-afd3-4608-b32c-d118e9c44784', 'Ozet testi isi');
insert into products (id, name, purchase_price, unit_type_default, qty_pieces)
  values ('a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d', 'Test rulman', 200, 'piece', 20);

select add_job_product('379e8a09-f025-4484-9ae3-3a4b78f9de36',
                       'a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d', 2);
select complete_job('379e8a09-f025-4484-9ae3-3a4b78f9de36');

insert into invoices (customer_id, invoice_no, gross_amount, net_amount, tax_amount)
  values ('5f7cf10e-6c49-48e9-a144-4ecbb1106ddc', 'FTR-OZET-1', 2360, 2000, 360);

\echo '--- TEST 1: aylik ozet hesaplaniyor mu ---'
select refresh_monthly_summary(current_date);

do $$
declare v record;
begin
  select * into v from monthly_summaries
  where donem = date_trunc('month', current_date)::date;

  if v is null then raise exception 'KALDI: ozet satiri olusmadi'; end if;
  -- 2 adet x 200 TL = 400 maliyet ; 2000 net gelir ; kar 1600
  if v.net_gelir <> 2000.00 then raise exception 'KALDI: net gelir %', v.net_gelir; end if;
  if v.malzeme_maliyeti <> 400.00 then raise exception 'KALDI: maliyet %', v.malzeme_maliyeti; end if;
  if v.kar_zarar <> 1600.00 then raise exception 'KALDI: kar/zarar %', v.kar_zarar; end if;
  if v.fatura_sayisi <> 1 then raise exception 'KALDI: fatura sayisi %', v.fatura_sayisi; end if;
  if v.tamamlanan_is <> 1 then raise exception 'KALDI: tamamlanan is %', v.tamamlanan_is; end if;
  raise notice 'GECTI: aylik ozet dogru (net 2000, maliyet 400, kar 1600)';
end $$;

\echo '--- TEST 2: tekrar hesaplama mukerrer satir olusturmuyor mu ---'
select refresh_monthly_summary(current_date);
select refresh_monthly_summary(current_date);

do $$
declare v integer;
begin
  select count(*) into v from monthly_summaries
  where donem = date_trunc('month', current_date)::date;
  if v <> 1 then raise exception 'KALDI: % satir olustu, 1 olmali', v; end if;
  raise notice 'GECTI: tekrar hesaplama tek satir tutuyor (upsert)';
end $$;

\echo '--- TEST 3: yeni fatura sonrasi ozet guncelleniyor mu ---'
insert into invoices (customer_id, invoice_no, gross_amount, net_amount, tax_amount)
  values ('5f7cf10e-6c49-48e9-a144-4ecbb1106ddc', 'FTR-OZET-2', 1180, 1000, 180);
select refresh_monthly_summary(current_date);

do $$
declare v numeric;
begin
  select net_gelir into v from monthly_summaries
  where donem = date_trunc('month', current_date)::date;
  if v <> 3000.00 then raise exception 'KALDI: net gelir 3000 olmali, gelen %', v; end if;
  raise notice 'GECTI: yeni fatura ozete yansidi (3000)';
end $$;

\echo '--- TEST 4: gecelik is iki ayi da tazeliyor mu ---'
select nightly_summary_refresh();

do $$
declare v integer;
begin
  select count(*) into v from monthly_summaries
  where donem in (
    date_trunc('month', current_date)::date,
    date_trunc('month', current_date - interval '1 month')::date
  );
  if v <> 2 then raise exception 'KALDI: 2 ay bekleniyordu, gelen %', v; end if;
  raise notice 'GECTI: gecelik is icinde bulunulan ve onceki ayi tazeledi';
end $$;

\echo '--- TEST 5: tutarli stokta mutabakat bos donuyor mu ---'
do $$
declare v integer;
begin
  select count(*) into v from stock_reconciliation();
  if v <> 0 then
    raise exception 'KALDI: tutarli stokta % fark bulundu', v;
  end if;
  raise notice 'GECTI: fonksiyonlarla yonetilen stokta fark yok';
end $$;

\echo '--- TEST 6: elle UPDATE sonrasi mutabakat farki yakaliyor mu ---'
-- products.qty_* dogrudan degistirilirse hareket gecmisi ile ayrisiyor
update products set qty_pieces = 999
where id = 'a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d';

do $$
declare v record;
begin
  select * into v from stock_reconciliation()
  where product_id = 'a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d';

  if v is null then raise exception 'KALDI: elle degisiklik yakalanmadi'; end if;
  if v.kayitli_adet <> 999 then raise exception 'KALDI: kayitli adet %', v.kayitli_adet; end if;
  -- Hareketlerden gelen: +20 acilis stogu (trigger) - 2 job_out = 18
  if v.hareketlerden_adet <> 18 then
    raise exception 'KALDI: hareketlerden gelen %, 18 bekleniyordu', v.hareketlerden_adet;
  end if;
  raise notice 'GECTI: mutabakat farki yakalandi (kayitli 999, hareketlerden 18)';
end $$;

\echo '--- TEST 7: acilis stogu otomatik hareket olusturuyor mu ---'
do $$
declare v record;
begin
  select movement_type, qty_pieces_delta, note into v
  from stock_movements
  where product_id = 'a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d'
    and note = 'Açılış stoğu';

  if v is null then raise exception 'KALDI: acilis stogu hareketi olusmadi'; end if;
  if v.qty_pieces_delta <> 20 then
    raise exception 'KALDI: acilis miktari %, 20 bekleniyordu', v.qty_pieces_delta;
  end if;
  if v.movement_type <> 'purchase_in' then
    raise exception 'KALDI: hareket tipi %', v.movement_type;
  end if;
  raise notice 'GECTI: acilis stogu otomatik hareket olarak kaydedildi (20 adet)';
end $$;

\echo '--- TEST 8: monthly_summaries denetim alani doluyor mu ---'
do $$
declare v timestamptz;
begin
  select hesaplanma into v from monthly_summaries
  where donem = date_trunc('month', current_date)::date;
  if v is null then raise exception 'KALDI: hesaplanma zamani bos'; end if;
  raise notice 'GECTI: hesaplanma zamani kaydedildi';
end $$;

rollback;

\echo ''
\echo '===== FAZ 5 TESTLERI TAMAM ====='
