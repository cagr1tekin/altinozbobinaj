-- =============================================================================
-- Faz 2 davranış testleri: maliyet hesabı, dashboard, iş akışı revizyonu.
-- Çalıştırma:
--   docker cp supabase/tests/02_faz2_test.sql altinoz-pg:/tmp/t2.sql
--   docker exec altinoz-pg psql -U postgres -d altinoz -v ON_ERROR_STOP=1 -f /tmp/t2.sql
-- Test verisi sonunda rollback ile geri alınır.
-- =============================================================================

begin;
\set ON_ERROR_STOP on

insert into customers (id, name) values
  ('5f7cf10e-6c49-48e9-a144-4ecbb1106ddc','Fabrika A'),
  ('6dbb15c7-afd3-4608-b32c-d118e9c44784','Fabrika B');
insert into segments (id, customer_id) values
  ('379e8a09-f025-4484-9ae3-3a4b78f9de36','5f7cf10e-6c49-48e9-a144-4ecbb1106ddc');

-- REVIZYON 2: yeni is otomatik "devam ediyor" mu?
insert into jobs (id, segment_id, title)
  values ('a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d','379e8a09-f025-4484-9ae3-3a4b78f9de36','Motor sarimi');
do $$
declare v text;
begin
  select status into v from jobs where id='a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
  if v = 'in_progress' then raise notice 'GECTI: yeni is otomatik "devam ediyor" (% )', v;
  else raise exception 'KALDI: beklenen in_progress, gelen %', v; end if;
end $$;

-- MALIYET: adet bazli urun (100 TL/adet, 3 adet = 300)
insert into products (id, name, purchase_price, unit_type_default, qty_pieces, qty_grams)
  values ('b2c3d4e5-6f7a-4b9c-8d0e-2f3a4b5c6d7e','Rulman',100,'piece',10,0);
-- kg bazli urun (50 TL/kg, 2.5 kg = 125)
insert into products (id, name, purchase_price, unit_type_default, qty_pieces, qty_grams)
  values ('c3d4e5f6-7a8b-4c0d-9e1f-3a4b5c6d7e8f','Bakir tel',50,'gram',0,10000);

select add_job_product('a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d','b2c3d4e5-6f7a-4b9c-8d0e-2f3a4b5c6d7e',3);
select add_job_product('a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d','c3d4e5f6-7a8b-4c0d-9e1f-3a4b5c6d7e8f',2500);

do $$
declare v numeric;
begin
  select material_cost into v from job_costs where job_id='a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
  -- 3 adet x 100 = 300 ; 2.5 kg x 50 = 125 ; toplam 425
  if v = 425.00 then raise notice 'GECTI: maliyet birim tipine gore hesaplandi (425.00 TL)';
  else raise exception 'KALDI: beklenen 425.00, gelen %', v; end if;
end $$;

-- Tamamlanmamis is maliyeti dashboard'a girmemeli
select jsonb_pretty(dashboard_summary(current_date - 30, current_date)) as tamamlanmadan;
do $$
declare v jsonb;
begin
  v := dashboard_summary(current_date - 30, current_date);
  if (v->>'malzeme_maliyeti')::numeric = 0 then
    raise notice 'GECTI: tamamlanmamis is maliyeti sayilmiyor';
  else raise exception 'KALDI: tamamlanmamis is maliyeti sayildi: %', v->>'malzeme_maliyeti'; end if;
  if (v->>'acik_is')::int = 1 then raise notice 'GECTI: acik is sayisi 1';
  else raise exception 'KALDI: acik is %', v->>'acik_is'; end if;
end $$;

select complete_job('a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d');

insert into invoices (customer_id, invoice_no, gross_amount, net_amount, tax_amount)
  values ('5f7cf10e-6c49-48e9-a144-4ecbb1106ddc','FTR-100',1180,1000,180);

\echo ''
\echo 'DASHBOARD OZETI:'
select jsonb_pretty(dashboard_summary(current_date - 30, current_date));

do $$
declare v jsonb;
begin
  v := dashboard_summary(current_date - 30, current_date);
  if (v->>'malzeme_maliyeti')::numeric = 425.00 then raise notice 'GECTI: tamamlanan is maliyeti sayildi (425.00)';
  else raise exception 'KALDI: maliyet %', v->>'malzeme_maliyeti'; end if;
  if (v->>'net_gelir')::numeric = 1000.00 then raise notice 'GECTI: net gelir 1000.00';
  else raise exception 'KALDI: net gelir %', v->>'net_gelir'; end if;
  if (v->>'kar_zarar')::numeric = 575.00 then raise notice 'GECTI: kar/zarar 1000 - 425 = 575.00';
  else raise exception 'KALDI: kar/zarar %', v->>'kar_zarar'; end if;
  if (v->>'tamamlanan_is')::int = 1 then raise notice 'GECTI: tamamlanan is 1';
  else raise exception 'KALDI: tamamlanan is %', v->>'tamamlanan_is'; end if;
end $$;

\echo ''
\echo 'MUSTERI KIRILIMI:'
select customer_name, net_gelir, malzeme_maliyeti, kar_zarar, tamamlanan_is
from dashboard_by_customer(current_date - 30, current_date);

do $$
declare v record;
begin
  select * into v from dashboard_by_customer(current_date - 30, current_date) limit 1;
  if v.customer_name = 'Fabrika A' and v.kar_zarar = 575.00 then
    raise notice 'GECTI: musteri kirilimi dogru (Fabrika A, 575.00)';
  else raise exception 'KALDI: %', v; end if;
  -- Faturasi/isi olmayan musteri listede olmamali
  if (select count(*) from dashboard_by_customer(current_date - 30, current_date)) = 1 then
    raise notice 'GECTI: hareketsiz musteri listede yok';
  else raise exception 'KALDI: hareketsiz musteri listeye girdi'; end if;
end $$;

-- Donem disi fatura sayilmamali
insert into invoices (customer_id, invoice_no, gross_amount, net_amount)
  values ('5f7cf10e-6c49-48e9-a144-4ecbb1106ddc','FTR-ESKI',5000,5000);
update invoices set issue_date = current_date - 400 where invoice_no = 'FTR-ESKI';
do $$
declare v jsonb;
begin
  v := dashboard_summary(current_date - 30, current_date);
  if (v->>'net_gelir')::numeric = 1000.00 then raise notice 'GECTI: donem disi fatura sayilmadi';
  else raise exception 'KALDI: donem disi fatura sayildi, net %', v->>'net_gelir'; end if;
end $$;

rollback;
\echo ''
\echo '===== FAZ 2 TESTLERI TAMAM ====='
