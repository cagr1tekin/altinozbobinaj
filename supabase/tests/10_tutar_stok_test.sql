-- =============================================================================
-- Faturasiz ciro, stok girisinde fiyat, guncel fiyattan maliyet (0014)
-- Calistirma:
--   docker cp supabase/tests/10_tutar_stok_test.sql altinoz-pg:/tmp/t10.sql
--   docker exec altinoz-pg psql -U postgres -d altinoz -v ON_ERROR_STOP=1 -f /tmp/t10.sql
-- Test verisi sonunda rollback ile geri alinir.
-- =============================================================================

begin;
\set ON_ERROR_STOP on

set local "request.jwt.claims" =
  '{"sub":"3f8d1c2a-4b56-4789-9abc-1d2e3f4a5b6c","email":"usta@altinozbobinaj.com"}';

insert into customers (id, name)
  values ('10111111-1111-4111-8111-111111111111', 'Tutar Test A.S.');

-- Ay basi: donem testleri current_date'e bagimli olmasin
insert into segments (id, customer_id, segment_date)
  values ('10222222-2222-4222-8222-222222222222',
          '10111111-1111-4111-8111-111111111111', current_date),
         ('10333333-3333-4333-8333-333333333333',
          '10111111-1111-4111-8111-111111111111', current_date);

-- #############################################################################
-- A) SEGMENT CIROSU: ya fatura ya tutar
-- #############################################################################

\echo '--- TEST 1: segmente elle tutar girilebiliyor ---'
do $$
declare v numeric;
begin
  perform segment_tutar_yaz('10222222-2222-4222-8222-222222222222', 1500);
  select charged_amount into v from segments
  where id = '10222222-2222-4222-8222-222222222222';
  if v <> 1500 then raise exception 'KALDI: tutar yazilmadi, gelen %', v; end if;
  raise notice 'GECTI: elden alinan tutar segmente yazildi';
end $$;

\echo '--- TEST 2: tutar varken ayni segmente fatura girilemiyor ---'
do $$
begin
  insert into invoices (customer_id, segment_id, gross_amount, net_amount)
  values ('10111111-1111-4111-8111-111111111111',
          '10222222-2222-4222-8222-222222222222', 1500, 1500);
  raise exception 'KALDI: tutar varken fatura eklendi (ciro iki kez sayilir)';
exception
  when check_violation then
    raise notice 'GECTI: tutarli segmente fatura eklenemiyor';
end $$;

\echo '--- TEST 3: fatura varken ayni segmente tutar girilemiyor ---'
do $$
begin
  insert into invoices (id, customer_id, segment_id, gross_amount, net_amount)
  values ('10aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '10111111-1111-4111-8111-111111111111',
          '10333333-3333-4333-8333-333333333333', 2000, 2000);

  perform segment_tutar_yaz('10333333-3333-4333-8333-333333333333', 2000);
  raise exception 'KALDI: fatura varken tutar girildi';
exception
  when check_violation then
    raise notice 'GECTI: faturali segmente tutar girilemiyor';
end $$;

\echo '--- TEST 4: kural iki yonlu — hangi taraftan gelinirse gelinsin ---'
do $$
declare v_yon integer := 0;
begin
  /* Tek yonlu korunsaydi diger kapi acik kalirdi: bu test iki triggerin
     de var oldugunu dogruluyor. */
  select count(*) into v_yon from pg_trigger
  where tgname in ('segments_ciro_cakismasi', 'invoices_ciro_cakismasi')
    and not tgisinternal;
  if v_yon <> 2 then
    raise exception 'KALDI: iki yonlu koruma eksik, % trigger var', v_yon;
  end if;
  raise notice 'GECTI: cakisma hem segment hem fatura tarafinda engelli';
end $$;

\echo '--- TEST 5: tutar bosaltilinca fatura girilebiliyor ---'
do $$
begin
  perform segment_tutar_yaz('10222222-2222-4222-8222-222222222222', null);
  insert into invoices (id, customer_id, segment_id, gross_amount, net_amount)
  values ('10bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          '10111111-1111-4111-8111-111111111111',
          '10222222-2222-4222-8222-222222222222', 1500, 1500);
  raise notice 'GECTI: tutar bosalinca fatura yolu aciliyor';
end $$;

\echo '--- TEST 6: negatif tutar reddediliyor ---'
do $$
begin
  perform segment_tutar_yaz('10222222-2222-4222-8222-222222222222', -5);
  raise exception 'KALDI: negatif tutar kabul edildi';
exception
  when invalid_parameter_value then
    raise notice 'GECTI: negatif tutar reddedildi';
end $$;

\echo '--- TEST 7: silinmis segmente tutar yazilamiyor ---'
do $$
begin
  update segments set deleted_at = now()
  where id = '10333333-3333-4333-8333-333333333333';
  begin
    perform segment_tutar_yaz('10333333-3333-4333-8333-333333333333', 100);
    raise exception 'KALDI: silinmis segmente tutar yazildi';
  exception
    when no_data_found then
      raise notice 'GECTI: silinmis segment tutar kabul etmiyor';
  end;
  update segments set deleted_at = null
  where id = '10333333-3333-4333-8333-333333333333';
end $$;

-- Fatura yolunu bosaltip elden ciro senaryosuna geciyoruz
delete from invoices where id in ('10aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                                  '10bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- #############################################################################
-- B) STOK: isaret + fiyat
-- #############################################################################

insert into products (id, name, unit_type_default, purchase_price)
  values ('10444444-4444-4444-8444-444444444444', 'Bakir Tel', 'gram', 100);

\echo '--- TEST 8: stok girisinde fiyat urunun fiyatini guncelliyor ---'
do $$
declare v numeric;
begin
  perform apply_stock_movement('10444444-4444-4444-8444-444444444444',
                               20000, 120, '120 TL/kg alim');
  select purchase_price into v from products
  where id = '10444444-4444-4444-8444-444444444444';
  if v <> 120 then raise exception 'KALDI: 120 beklenirdi, gelen %', v; end if;
  raise notice 'GECTI: alim fiyati urune islendi (100 -> 120)';
end $$;

\echo '--- TEST 9: fiyat harekete de yaziliyor ---'
do $$
declare v numeric;
begin
  select unit_price into v from stock_movements
  where product_id = '10444444-4444-4444-8444-444444444444'
    and note = '120 TL/kg alim';
  if v is distinct from 120 then
    raise exception 'KALDI: harekette fiyat yok, gelen %', v;
  end if;
  raise notice 'GECTI: alim fiyati stok hareketinde saklandi';
end $$;

\echo '--- TEST 10: fiyat verilmezse eski fiyat korunuyor ---'
do $$
declare v numeric;
begin
  perform apply_stock_movement('10444444-4444-4444-8444-444444444444',
                               1000, null, 'fiyatsiz giris');
  select purchase_price into v from products
  where id = '10444444-4444-4444-8444-444444444444';
  if v <> 120 then raise exception 'KALDI: fiyat degisti, gelen %', v; end if;
  raise notice 'GECTI: fiyat verilmeyince mevcut fiyat korundu';
end $$;

\echo '--- TEST 11: eksi miktar cikis hareketi uretiyor ---'
do $$
declare v movement_type;
begin
  perform apply_stock_movement('10444444-4444-4444-8444-444444444444',
                               -500, null, 'zayi');
  select movement_type into v from stock_movements
  where product_id = '10444444-4444-4444-8444-444444444444' and note = 'zayi';
  if v <> 'manual_out' then
    raise exception 'KALDI: manual_out beklenirdi, gelen %', v;
  end if;
  raise notice 'GECTI: miktarin isareti hareket tipini belirliyor';
end $$;

\echo '--- TEST 12: cikista fiyat reddediliyor ---'
do $$
begin
  perform apply_stock_movement('10444444-4444-4444-8444-444444444444',
                               -100, 50, null);
  raise exception 'KALDI: cikisa fiyat girildi';
exception
  when invalid_parameter_value then
    raise notice 'GECTI: cikis bir alim degil, fiyat kabul etmiyor';
end $$;

\echo '--- TEST 13: sayim duzeltmesi artik uretilmiyor ---'
do $$
declare v integer;
begin
  /* 'adjustment' enum'dan SILINMEDI (gecmis hareketler onu tasiyor) ama
     yeni hareketlerde uretilmemeli. */
  select count(*) into v from stock_movements
  where movement_type = 'adjustment'
    and created_at > now() - interval '1 minute';
  if v <> 0 then
    raise exception 'KALDI: % adet sayim duzeltmesi uretildi', v;
  end if;
  raise notice 'GECTI: sayim duzeltmesi uretilmiyor';
end $$;

\echo '--- TEST 14: eksiye dusuren cikis reddediliyor ---'
do $$
begin
  perform apply_stock_movement('10444444-4444-4444-8444-444444444444',
                               -9999999, null, null);
  raise exception 'KALDI: stok eksiye dustu';
exception
  when check_violation then
    raise notice 'GECTI: stogu eksiye dusuren cikis reddedildi';
end $$;

\echo '--- TEST 15: urun stok girisiyle birlikte tanimlanabiliyor ---'
do $$
declare v_id uuid; v_fiyat numeric; v_adet integer; v_hareket integer;
begin
  select (urun_ve_stok_ekle('Rulman 6205', 'piece', 40, 85, 'RLM-6205',
                            'ilk alim')->>'product_id')::uuid into v_id;
  select purchase_price, qty_pieces into v_fiyat, v_adet
  from products where id = v_id;
  select count(*) into v_hareket from stock_movements where product_id = v_id;

  if v_fiyat <> 85 then raise exception 'KALDI: fiyat %', v_fiyat; end if;
  if v_adet <> 40 then raise exception 'KALDI: adet %', v_adet; end if;
  /* Acilis stogu trigger'i qty 0 ile insert edildigi icin devreye
     girmemeli: tek hareket olmali, mukerrer degil. */
  if v_hareket <> 1 then
    raise exception 'KALDI: % hareket yazildi, 1 olmaliydi', v_hareket;
  end if;
  raise notice 'GECTI: urun + stok + fiyat tek adimda, mukerrer hareket yok';
end $$;

\echo '--- TEST 16: urun eklerken miktar zorunlu ---'
do $$
begin
  perform urun_ve_stok_ekle('Miktarsiz Urun', 'piece', 0, 10);
  raise exception 'KALDI: miktarsiz urun eklendi';
exception
  when invalid_parameter_value then
    raise notice 'GECTI: urun eklerken miktar zorunlu';
end $$;

\echo '--- TEST 17: urun stok gecmisi yuruyen bakiye veriyor ---'
do $$
declare v record; v_sayi integer;
begin
  select count(*) into v_sayi from urun_stok_gecmisi(
    '10444444-4444-4444-8444-444444444444', 100);
  if v_sayi < 3 then raise exception 'KALDI: gecmis eksik, % satir', v_sayi; end if;

  -- En yeni satir en ustte olmali
  select * into v from urun_stok_gecmisi(
    '10444444-4444-4444-8444-444444444444', 100) limit 1;
  if v.not_ <> 'zayi' then
    raise exception 'KALDI: en yeni satir ustte degil, gelen %', v.not_;
  end if;
  -- 20000 + 1000 - 500 = 20500
  if v.bakiye <> 20500 then
    raise exception 'KALDI: bakiye 20500 olmaliydi, gelen %', v.bakiye;
  end if;
  raise notice 'GECTI: stok gecmisi en yeniden basliyor, bakiye yuruyor';
end $$;

\echo '--- TEST 18: gecmis birim fiyati da gosteriyor ---'
do $$
declare v numeric;
begin
  select birim_fiyat into v from urun_stok_gecmisi(
    '10444444-4444-4444-8444-444444444444', 100)
  where not_ = '120 TL/kg alim';
  if v is distinct from 120 then
    raise exception 'KALDI: gecmiste fiyat gorunmuyor, gelen %', v;
  end if;
  raise notice 'GECTI: hangi hareketin kaca alindigi gecmisten okunuyor';
end $$;

-- #############################################################################
-- C) MALIYET: tamamlama anindaki fiyat
-- #############################################################################

\echo '--- TEST 19: KULLANICI SENARYOSU — 100 al, is ac, 120 al, tamamla ---'
do $$
declare v_urun uuid; v_is uuid := '10555555-5555-4555-8555-555555555555';
        v_maliyet numeric;
begin
  /* Kullanicinin tarif ettigi tam senaryo:
       100 TL'ye mal alindi -> is alindi, malzeme eklendi
       -> 120 TL'ye mal alindi -> is tamamlandi
     Beklenen maliyet 120'den. Eski davranis 100 doner. */
  select (urun_ve_stok_ekle('Senaryo Teli', 'gram', 50000, 100)
          ->>'product_id')::uuid into v_urun;

  insert into jobs (id, segment_id, title)
  values (v_is, '10222222-2222-4222-8222-222222222222', 'Senaryo isi');

  perform add_job_product(v_is, v_urun, 10000);   -- 10 kg, o an 100 TL/kg

  perform apply_stock_movement(v_urun, 20000, 120, 'zam sonrasi alim');

  perform complete_job(v_is, array['winding']::service_type[]);

  select material_cost into v_maliyet from job_costs where job_id = v_is;
  if v_maliyet <> 1200 then
    raise exception 'KALDI: 10 kg x 120 = 1200 beklenirdi, gelen %', v_maliyet;
  end if;
  raise notice 'GECTI: maliyet tamamlama anindaki fiyattan (1200 TL)';
end $$;

\echo '--- TEST 20: tamamlandiktan sonra fiyat degisse maliyet donmus kaliyor ---'
do $$
declare v_maliyet numeric;
begin
  /* Gecen ayin kari, bugun fiyat degistirdiginiz icin degismemeli. */
  perform apply_stock_movement(
    (select product_id from job_products
     where job_id = '10555555-5555-4555-8555-555555555555' limit 1),
    1000, 300, 'tamamlama sonrasi zam');

  select material_cost into v_maliyet from job_costs
  where job_id = '10555555-5555-4555-8555-555555555555';
  if v_maliyet <> 1200 then
    raise exception 'KALDI: donmus maliyet 1200 olmaliydi, gelen %', v_maliyet;
  end if;
  raise notice 'GECTI: tamamlanmis isin maliyeti sonradan degismiyor';
end $$;

\echo '--- TEST 21: devam eden isin maliyeti canli fiyattan ---'
do $$
declare v_urun uuid; v_is uuid := '10666666-6666-4666-8666-666666666666';
        v_once numeric; v_sonra numeric;
begin
  select (urun_ve_stok_ekle('Canli Fiyat Teli', 'gram', 50000, 200)
          ->>'product_id')::uuid into v_urun;

  insert into jobs (id, segment_id, title)
  values (v_is, '10222222-2222-4222-8222-222222222222', 'Devam eden is');
  perform add_job_product(v_is, v_urun, 10000);   -- 10 kg x 200 = 2000

  select material_cost into v_once from job_costs where job_id = v_is;
  perform apply_stock_movement(v_urun, 1000, 250, 'zam');
  select material_cost into v_sonra from job_costs where job_id = v_is;

  if v_once <> 2000 then raise exception 'KALDI: baslangic %', v_once; end if;
  if v_sonra <> 2500 then
    raise exception 'KALDI: canli tahmin 2500 olmaliydi, gelen %', v_sonra;
  end if;
  raise notice 'GECTI: devam eden isin maliyeti guncel fiyati izliyor';
end $$;

\echo '--- TEST 22: geri al + tekrar tamamla yeni fiyattan donduruyor ---'
do $$
declare v_maliyet numeric;
begin
  perform revert_job_completion('10555555-5555-4555-8555-555555555555');
  perform complete_job('10555555-5555-4555-8555-555555555555',
                       array['winding']::service_type[]);
  select material_cost into v_maliyet from job_costs
  where job_id = '10555555-5555-4555-8555-555555555555';
  -- Fiyat 300'e cikmisti (TEST 20): 10 kg x 300 = 3000
  if v_maliyet <> 3000 then
    raise exception 'KALDI: yeniden tamamlamada 3000 beklenirdi, gelen %', v_maliyet;
  end if;
  raise notice 'GECTI: yeniden tamamlama guncel fiyattan donduruyor';
end $$;

-- #############################################################################
-- D) IS TUTARI: yalnizca not
-- #############################################################################

\echo '--- TEST 23: is tamamlanirken tutar girilebiliyor ---'
do $$
declare v numeric;
begin
  perform complete_job('10666666-6666-4666-8666-666666666666',
                       array['revision']::service_type[], 3500);
  select charged_amount into v from jobs
  where id = '10666666-6666-4666-8666-666666666666';
  if v <> 3500 then raise exception 'KALDI: is tutari %', v; end if;
  raise notice 'GECTI: is tutari tamamlama sirasinda girildi';
end $$;

\echo '--- TEST 24: IS TUTARI HESABA GIRMIYOR ---'
do $$
declare v_gelir numeric;
begin
  /* Kullanicinin acik talebi: "is basina para girilsin ama bu hesaplamaya
     degmesin, sadece not gibi olsun". Toplam 3500 TL is tutari var ama
     ciroya yansimamali. */
  select (dashboard_summary(current_date, current_date)->>'net_gelir')::numeric
  into v_gelir;
  if v_gelir <> 0 then
    raise exception 'KALDI: is tutari ciroya karisti, gelir %', v_gelir;
  end if;
  raise notice 'GECTI: is tutari not niteliginde, ciroya girmiyor';
end $$;

\echo '--- TEST 25: negatif is tutari reddediliyor ---'
do $$
begin
  insert into jobs (id, segment_id, title)
  values ('10777777-7777-4777-8777-777777777777',
          '10222222-2222-4222-8222-222222222222', 'Negatif tutar isi');
  perform complete_job('10777777-7777-4777-8777-777777777777',
                       array['winding']::service_type[], -1);
  raise exception 'KALDI: negatif is tutari kabul edildi';
exception
  when invalid_parameter_value then
    raise notice 'GECTI: negatif is tutari reddedildi';
end $$;

\echo '--- TEST 26: geri alip tekrar tamamlarken tutar kaybolmuyor ---'
do $$
declare v numeric;
begin
  perform revert_job_completion('10666666-6666-4666-8666-666666666666');
  perform complete_job('10666666-6666-4666-8666-666666666666',
                       array['revision']::service_type[]);   -- tutar verilmedi
  select charged_amount into v from jobs
  where id = '10666666-6666-4666-8666-666666666666';
  if v <> 3500 then
    raise exception 'KALDI: tutar kayboldu, gelen %', v;
  end if;
  raise notice 'GECTI: tutar verilmeyince mevcut deger korunuyor';
end $$;

-- #############################################################################
-- E) CIRO HESABI
-- #############################################################################

\echo '--- TEST 27: elden alinan tutar ciroya giriyor ---'
do $$
declare v_net numeric; v_elden numeric;
begin
  perform segment_tutar_yaz('10222222-2222-4222-8222-222222222222', 4000);
  select (dashboard_summary(current_date, current_date)->>'net_gelir')::numeric,
         (dashboard_summary(current_date, current_date)->>'elden_gelir')::numeric
  into v_net, v_elden;
  if v_elden <> 4000 then raise exception 'KALDI: elden %', v_elden; end if;
  if v_net <> 4000 then raise exception 'KALDI: net %', v_net; end if;
  raise notice 'GECTI: faturasiz ciro raporda gorunuyor';
end $$;

\echo '--- TEST 28: fatura + elden birlikte toplaniyor, cifte saymiyor ---'
do $$
declare v_net numeric; v_faturali numeric; v_elden numeric;
begin
  insert into invoices (customer_id, segment_id, gross_amount, net_amount, issue_date)
  values ('10111111-1111-4111-8111-111111111111',
          '10333333-3333-4333-8333-333333333333', 6000, 6000, current_date);

  select (dashboard_summary(current_date, current_date)->>'net_gelir')::numeric,
         (dashboard_summary(current_date, current_date)->>'faturali_gelir')::numeric,
         (dashboard_summary(current_date, current_date)->>'elden_gelir')::numeric
  into v_net, v_faturali, v_elden;

  if v_faturali <> 6000 then raise exception 'KALDI: faturali %', v_faturali; end if;
  if v_elden <> 4000 then raise exception 'KALDI: elden %', v_elden; end if;
  if v_net <> 10000 then
    raise exception 'KALDI: 10000 beklenirdi (cifte sayim?), gelen %', v_net;
  end if;
  raise notice 'GECTI: iki gelir kalemi ayri ayri ve toplam dogru';
end $$;

\echo '--- TEST 29: kar/zarar iki gelir kalemini de kullaniyor ---'
do $$
declare v_kar numeric; v_gelir numeric; v_maliyet numeric;
begin
  select (dashboard_summary(current_date, current_date)->>'kar_zarar')::numeric,
         (dashboard_summary(current_date, current_date)->>'net_gelir')::numeric,
         (dashboard_summary(current_date, current_date)->>'malzeme_maliyeti')::numeric
  into v_kar, v_gelir, v_maliyet;
  if v_kar <> v_gelir - v_maliyet then
    raise exception 'KALDI: kar % <> % - %', v_kar, v_gelir, v_maliyet;
  end if;
  if v_maliyet <= 0 then raise exception 'KALDI: maliyet sifir cikti'; end if;
  raise notice 'GECTI: kar = (fatura + elden) - maliyet';
end $$;

\echo '--- TEST 30: aylik trend faturasiz ciroyu iceriyor ---'
do $$
declare v numeric;
begin
  select net_gelir into v from monthly_trend(1)
  where donem = date_trunc('month', current_date)::date;
  if v <> 10000 then
    raise exception 'KALDI: trendde 10000 beklenirdi, gelen %', v;
  end if;
  raise notice 'GECTI: aylik trend iki gelir kalemini topluyor';
end $$;

\echo '--- TEST 31: musteri bazli rapor faturasiz ciroyu iceriyor ---'
do $$
declare v numeric;
begin
  select net_gelir into v from dashboard_by_customer(current_date, current_date)
  where customer_id = '10111111-1111-4111-8111-111111111111';
  if v <> 10000 then
    raise exception 'KALDI: musteri cirosu 10000 olmaliydi, gelen %', v;
  end if;
  raise notice 'GECTI: musteri bazli rapor elden ciroyu de sayiyor';
end $$;

\echo '--- TEST 32: silinen segmentin tutari ciroya girmiyor ---'
do $$
declare v numeric;
begin
  update segments set deleted_at = now()
  where id = '10222222-2222-4222-8222-222222222222';
  select (dashboard_summary(current_date, current_date)->>'elden_gelir')::numeric
  into v;
  if v <> 0 then
    raise exception 'KALDI: silinen segment ciroda, gelen %', v;
  end if;
  update segments set deleted_at = null
  where id = '10222222-2222-4222-8222-222222222222';
  raise notice 'GECTI: silinen segmentin tutari ciroda gorunmuyor';
end $$;

-- #############################################################################
-- F) YETKI
-- #############################################################################

\echo '--- TEST 33: yeni fonksiyonlar anon a kapali ---'
do $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'apply_stock_movement(uuid, integer, numeric, text)',
    'urun_ve_stok_ekle(text, unit_type, integer, numeric, text, text)',
    'urun_stok_gecmisi(uuid, integer)',
    'segment_tutar_yaz(uuid, numeric)',
    'complete_job(uuid, service_type[], numeric, boolean)',
    'dashboard_summary(date, date)',
    'monthly_trend(integer)'
  ]
  loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception 'KALDI: anon % cagirabiliyor', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'KALDI: personel % cagiramiyor', v_fn;
    end if;
  end loop;
  raise notice 'GECTI: yeni fonksiyonlar anon a kapali, personele acik';
end $$;

\echo '--- TEST 34: cakisma trigger fonksiyonu istemci rollerine kapali ---'
do $$
begin
  if has_function_privilege('anon', 'segment_ciro_cakismasi()', 'EXECUTE')
     or has_function_privilege('authenticated', 'segment_ciro_cakismasi()', 'EXECUTE') then
    raise exception 'KALDI: trigger fonksiyonu dogrudan cagirilabiliyor';
  end if;
  raise notice 'GECTI: trigger fonksiyonu yalnizca trigger uzerinden calisiyor';
end $$;

\echo '--- TEST 35: eski imzalar kaldirildi ---'
do $$
declare v integer;
begin
  /* Eski imza kalirsa PostgREST adlandirilmis cagrida yanlis fonksiyonu
     secebilir; iki surumun bir arada durmamasi gerekiyor. */
  select count(*) into v from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'apply_stock_movement';
  if v <> 1 then raise exception 'KALDI: % apply_stock_movement var', v; end if;

  select count(*) into v from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'complete_job';
  if v <> 1 then raise exception 'KALDI: % complete_job var', v; end if;
  raise notice 'GECTI: her fonksiyonun tek imzasi var';
end $$;

\echo ''
\echo '=== 10_tutar_stok_test.sql: 35 dogrulama gecti ==='

rollback;
