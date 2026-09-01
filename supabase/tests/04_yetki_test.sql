-- =============================================================================
-- Fonksiyon yetki testleri.
--
-- Supabase, public şemasındaki her yeni fonksiyonu otomatik olarak anon
-- rolüne grant ediyor. Bu test, gözden kaçan bir fonksiyon olup olmadığını
-- yakalar — yeni fonksiyon eklendiğinde yetkisi açıkça geri alınmalı.
--
-- Çalıştırma:
--   docker cp supabase/tests/04_yetki_test.sql altinoz-pg:/tmp/t4.sql
--   docker exec altinoz-pg psql -U postgres -d altinoz -v ON_ERROR_STOP=1 -f /tmp/t4.sql
-- =============================================================================

\set ON_ERROR_STOP on

\echo '--- TEST 1: anon yalnizca public_job_by_token calistirabilmeli ---'
do $$
declare
  v_liste text;
  v_sayi integer;
begin
  select count(*), string_agg(p.proname, ', ' order by p.proname)
  into v_sayi, v_liste
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.proname <> 'public_job_by_token'
    -- Uzanti fonksiyonlari (pgcrypto vb.) Supabase varsayilani, kapsam disi
    and p.oid not in (
      select d.objid from pg_depend d
      join pg_extension e on e.oid = d.refobjid
      where d.deptype = 'e'
    );

  if v_sayi > 0 then
    raise exception 'KALDI: anon % fonksiyonu calistirabiliyor: %', v_sayi, v_liste;
  end if;
  raise notice 'GECTI: anon yalnizca public_job_by_token calistirabiliyor';
end $$;

\echo '--- TEST 2: QR fonksiyonu anon icin acik kalmali ---'
do $$
begin
  if not has_function_privilege('anon', 'public_job_by_token(text)', 'EXECUTE') then
    raise exception 'KALDI: QR sayfasi calismaz, anon public_job_by_token cagiramiyor';
  end if;
  raise notice 'GECTI: QR fonksiyonu anon icin acik';
end $$;

\echo '--- TEST 3: SECURITY DEFINER bakim fonksiyonlari hicbir istemci rolune acik olmamali ---'
do $$
declare
  v_rol text;
  v_fn text;
begin
  foreach v_fn in array array[
    'refresh_monthly_summary(date)',
    'nightly_summary_refresh()',
    'record_opening_stock()',
    'set_updated_at()'
  ]
  loop
    foreach v_rol in array array['anon', 'authenticated']
    loop
      if has_function_privilege(v_rol, v_fn, 'EXECUTE') then
        raise exception 'KALDI: % rolu % fonksiyonunu cagirabiliyor', v_rol, v_fn;
      end if;
    end loop;
  end loop;
  raise notice 'GECTI: bakim ve trigger fonksiyonlari istemci rollerine kapali';
end $$;

\echo '--- TEST 4: personel fonksiyonlari authenticated icin acik olmali ---'
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'complete_job(uuid, boolean)',
    'revert_job_completion(uuid)',
    'apply_stock_movement(uuid, movement_type, integer, numeric, text)',
    'add_job_product(uuid, uuid, integer, numeric)',
    'dashboard_summary(date, date)',
    'dashboard_by_customer(date, date)',
    'stock_reconciliation()'
  ]
  loop
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'KALDI: personel % fonksiyonunu cagiramiyor', v_fn;
    end if;
  end loop;
  raise notice 'GECTI: personel fonksiyonlari authenticated icin acik';
end $$;

\echo '--- TEST 5: anon tablolara dogrudan yazamamali ---'
do $$
declare
  v_tablo text;
begin
  foreach v_tablo in array array[
    'customers', 'segments', 'jobs', 'products',
    'job_products', 'stock_movements', 'invoices', 'monthly_summaries'
  ]
  loop
    if has_table_privilege('anon', v_tablo, 'INSERT')
       or has_table_privilege('anon', v_tablo, 'UPDATE')
       or has_table_privilege('anon', v_tablo, 'DELETE') then
      raise exception 'KALDI: anon % tablosuna yazabiliyor', v_tablo;
    end if;
  end loop;
  raise notice 'GECTI: anon hicbir tabloya yazamiyor';
end $$;

\echo '--- TEST 6: stock_movements denetim izi guncellenemez/silinemez ---'
do $$
begin
  -- RLS politikalari yalnizca SELECT ve INSERT veriyor
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stock_movements'
      and cmd in ('UPDATE', 'DELETE')
  ) then
    raise exception 'KALDI: stock_movements icin UPDATE/DELETE politikasi var';
  end if;
  raise notice 'GECTI: denetim izi degistirilemez (UPDATE/DELETE politikasi yok)';
end $$;

\echo '--- TEST 7: tum is tablolarinda RLS acik ---'
do $$
declare
  v_liste text;
begin
  select string_agg(c.relname, ', ')
  into v_liste
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity
    and c.relname in (
      'customers','segments','jobs','products','job_products',
      'stock_movements','invoices','qr_codes','pdf_exports','monthly_summaries'
    );

  if v_liste is not null then
    raise exception 'KALDI: RLS kapali tablolar: %', v_liste;
  end if;
  raise notice 'GECTI: tum is tablolarinda RLS acik';
end $$;

\echo ''
\echo '===== YETKI TESTLERI TAMAM ====='
