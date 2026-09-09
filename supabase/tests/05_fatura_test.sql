-- =============================================================================
-- Fatura dosyası ve segment eşleşmesi testleri (0007).
-- Çalıştırma:
--   docker cp supabase/tests/05_fatura_test.sql altinoz-pg:/tmp/t5.sql
--   docker exec altinoz-pg psql -U postgres -d altinoz -v ON_ERROR_STOP=1 -f /tmp/t5.sql
-- Test verisi sonunda rollback ile geri alınır.
-- =============================================================================

begin;
\set ON_ERROR_STOP on

insert into customers (id, name)
  values ('5f7cf10e-6c49-48e9-a144-4ecbb1106ddc', 'Fatura Test A.S.');
insert into segments (id, customer_id, segment_date)
  values ('6dbb15c7-afd3-4608-b32c-d118e9c44784',
          '5f7cf10e-6c49-48e9-a144-4ecbb1106ddc', current_date);

\echo '--- TEST 1: fatura segmente baglaniyor ---'
insert into invoices (customer_id, segment_id, invoice_no, ettn,
                      gross_amount, net_amount, tax_amount, issue_date,
                      supplier_name, file_path, parsed_at)
values ('5f7cf10e-6c49-48e9-a144-4ecbb1106ddc',
        '6dbb15c7-afd3-4608-b32c-d118e9c44784',
        'SLD2026000000090', '99d3a6054a904824880a167337a9ab69',
        94326.00, 78605.00, 15721.00, current_date,
        'YERSA SENTETIK DOKUMA', 'musteri/segment/SLD2026000000090.pdf', now());

do $$
declare v record;
begin
  select * into v from segment_invoice_totals
  where segment_id = '6dbb15c7-afd3-4608-b32c-d118e9c44784';

  if v.fatura_sayisi <> 1 then raise exception 'KALDI: fatura sayisi %', v.fatura_sayisi; end if;
  if v.brut_toplam <> 94326.00 then raise exception 'KALDI: brut %', v.brut_toplam; end if;
  if v.net_toplam <> 78605.00 then raise exception 'KALDI: net %', v.net_toplam; end if;
  raise notice 'GECTI: fatura segmente baglandi (brut 94.326, net 78.605)';
end $$;

\echo '--- TEST 2: ayni ETTN iki kez eklenemiyor ---'
do $$
begin
  insert into invoices (customer_id, segment_id, ettn,
                        gross_amount, net_amount, tax_amount, issue_date)
  values ('5f7cf10e-6c49-48e9-a144-4ecbb1106ddc',
          '6dbb15c7-afd3-4608-b32c-d118e9c44784',
          '99d3a6054a904824880a167337a9ab69',
          100, 100, 0, current_date);
  raise exception 'KALDI: mukerrer ETTN kabul edildi';
exception
  when unique_violation then
    raise notice 'GECTI: mukerrer ETTN engellendi';
end $$;

\echo '--- TEST 3: ETTN''siz birden fazla fatura eklenebiliyor ---'
insert into invoices (customer_id, segment_id, gross_amount, net_amount, tax_amount, issue_date)
values ('5f7cf10e-6c49-48e9-a144-4ecbb1106ddc',
        '6dbb15c7-afd3-4608-b32c-d118e9c44784', 120, 100, 20, current_date),
       ('5f7cf10e-6c49-48e9-a144-4ecbb1106ddc',
        '6dbb15c7-afd3-4608-b32c-d118e9c44784', 240, 200, 40, current_date);

do $$
declare v record;
begin
  select * into v from segment_invoice_totals
  where segment_id = '6dbb15c7-afd3-4608-b32c-d118e9c44784';
  -- Kullanici tercihi: bir segmente birden fazla fatura eklenebilir
  if v.fatura_sayisi <> 3 then raise exception 'KALDI: 3 fatura bekleniyordu, gelen %', v.fatura_sayisi; end if;
  if v.brut_toplam <> 94686.00 then raise exception 'KALDI: brut toplam %', v.brut_toplam; end if;
  raise notice 'GECTI: segmente birden fazla fatura eklenebiliyor (3 fatura, 94.686 toplam)';
end $$;

\echo '--- TEST 4: tutarsiz fatura reddediliyor (net > brut) ---'
do $$
begin
  insert into invoices (customer_id, segment_id, gross_amount, net_amount, tax_amount, issue_date)
  values ('5f7cf10e-6c49-48e9-a144-4ecbb1106ddc',
          '6dbb15c7-afd3-4608-b32c-d118e9c44784', -5, 100, 0, current_date);
  raise exception 'KALDI: negatif brut kabul edildi';
exception
  when check_violation then
    raise notice 'GECTI: negatif tutar engellendi';
end $$;

\echo '--- TEST 5: aylik trend bos aylari sifirla dolduruyor ---'
do $$
declare v integer;
begin
  select count(*) into v from monthly_trend(12);
  if v <> 12 then raise exception 'KALDI: 12 ay bekleniyordu, gelen %', v; end if;
  raise notice 'GECTI: monthly_trend 12 ay kesintisiz donuyor';
end $$;

\echo '--- TEST 6: trend TAHSILATI gelir sayiyor, faturayi degil ---'
/* 0015 oncesi bu test faturalarin netini gelir sayiyordu. Artik gelirin
   olcutu odeme tarihi: 3 fatura duruyor ama para alinmadigi surece
   trend sifir. */
do $$
declare v numeric;
begin
  select tahsilat into v from monthly_trend(12)
  where donem = date_trunc('month', current_date)::date;
  if coalesce(v, 0) <> 0 then
    raise exception 'KALDI: fatura tahsilat sayildi, gelen %', v;
  end if;
  raise notice 'GECTI: tahsil edilmeyen fatura trende girmiyor';
end $$;

do $$
declare v numeric;
begin
  perform tahsilat_ekle('6dbb15c7-afd3-4608-b32c-d118e9c44784', 1000);
  select tahsilat into v from monthly_trend(12)
  where donem = date_trunc('month', current_date)::date;
  if v <> 1000.00 then raise exception 'KALDI: tahsilat sonrasi trend %', v; end if;
  raise notice 'GECTI: tahsilat trende odeme ayina yaziliyor (1.000)';
end $$;

\echo '--- TEST 7: segment silinince faturalar segmentsiz kaliyor (kayit korunuyor) ---'
do $$
declare v integer;
begin
  delete from segments where id = '6dbb15c7-afd3-4608-b32c-d118e9c44784';
  -- invoices.segment_id on delete set null: muhasebe kaydi yok olmamali
  select count(*) into v from invoices
  where customer_id = '5f7cf10e-6c49-48e9-a144-4ecbb1106ddc';
  if v <> 3 then raise exception 'KALDI: faturalar silindi, kalan %', v; end if;
  raise notice 'GECTI: segment silindi ama fatura kayitlari korundu';
end $$;

\echo '--- TEST 8: anon fatura ozetini okuyamiyor ---'
do $$
begin
  if has_table_privilege('anon', 'segment_invoice_totals', 'SELECT') then
    raise exception 'KALDI: anon fatura ozetini okuyabiliyor';
  end if;
  if has_function_privilege('anon', 'monthly_trend(integer)', 'EXECUTE') then
    raise exception 'KALDI: anon monthly_trend cagirabiliyor';
  end if;
  raise notice 'GECTI: fatura ozeti ve trend anon''a kapali';
end $$;

rollback;

\echo ''
\echo '===== FATURA TESTLERI TAMAM ====='
