-- =============================================================================
-- Faturasiz ciro, stok girisinde fiyat, guncel fiyattan maliyet (0014)
-- + anlasilan tutar / tahsilat ayrimi ve cok vade (0015)
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
-- A) ANLASILAN TUTAR: ya fatura ya elle giris
--
-- 0015: bu kolonun anlami degisti. Eskiden "elden ALINAN tutar"di,
-- artik "musteriyle ANLASILAN toplam". Alinan para payments'ta.
-- #############################################################################

\echo '--- TEST 1: segmente elle tutar girilebiliyor ---'
do $$
declare v numeric;
begin
  perform segment_anlasilan_yaz('10222222-2222-4222-8222-222222222222', 1500);
  select agreed_amount into v from segments
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

  perform segment_anlasilan_yaz('10333333-3333-4333-8333-333333333333', 2000);
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
  perform segment_anlasilan_yaz('10222222-2222-4222-8222-222222222222', null);
  insert into invoices (id, customer_id, segment_id, gross_amount, net_amount)
  values ('10bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          '10111111-1111-4111-8111-111111111111',
          '10222222-2222-4222-8222-222222222222', 1500, 1500);
  raise notice 'GECTI: tutar bosalinca fatura yolu aciliyor';
end $$;

\echo '--- TEST 6: negatif tutar reddediliyor ---'
do $$
begin
  perform segment_anlasilan_yaz('10222222-2222-4222-8222-222222222222', -5);
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
    perform segment_anlasilan_yaz('10333333-3333-4333-8333-333333333333', 100);
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
-- D) IS TUTARI: yalnizca not, isin durumundan bagimsiz
--
-- 0015: complete_job() artik tutar parametresi ALMIYOR. Para ile isin
-- tamamlanmasi arasinda bag yok; tutar iste her zaman duzenlenebilen bir
-- not alani.
-- #############################################################################

\echo '--- TEST 23: is tutari tamamlanmadan once yazilabiliyor ---'
do $$
declare v numeric;
begin
  update jobs set agreed_amount = 3500
  where id = '10666666-6666-4666-8666-666666666666';
  select agreed_amount into v from jobs
  where id = '10666666-6666-4666-8666-666666666666';
  if v <> 3500 then raise exception 'KALDI: is tutari %', v; end if;
  raise notice 'GECTI: acik ise tutar yazildi';
end $$;

\echo '--- TEST 24: tamamlama tutara DOKUNMUYOR ---'
do $$
declare v numeric;
begin
  perform complete_job('10666666-6666-4666-8666-666666666666',
                       array['revision']::service_type[]);
  select agreed_amount into v from jobs
  where id = '10666666-6666-4666-8666-666666666666';
  if v <> 3500 then
    raise exception 'KALDI: tamamlama tutari degistirdi, gelen %', v;
  end if;
  raise notice 'GECTI: complete_job is tutarina dokunmuyor';
end $$;

\echo '--- TEST 25: TAMAMLANMIS isin tutari duzenlenebiliyor ---'
do $$
declare v numeric;
begin
  /* Kullanicinin acik istegi: "bu notu isi tamamladiktan sonra da
     gorebilmeli ve duzenleyebilmeliyiz". Eskiden tutar yalnizca
     tamamlama formundan giriliyordu ve is kapandiktan sonra
     degistirmenin yolu yoktu. */
  update jobs set agreed_amount = 4100
  where id = '10666666-6666-4666-8666-666666666666'
    and status = 'completed';
  select agreed_amount into v from jobs
  where id = '10666666-6666-4666-8666-666666666666';
  if v <> 4100 then
    raise exception 'KALDI: tamamlanmis isin tutari degismedi, gelen %', v;
  end if;
  raise notice 'GECTI: tamamlanmis isin tutari duzenlenebiliyor';
end $$;

\echo '--- TEST 26: IS TUTARI HESABA GIRMIYOR ---'
do $$
declare v_tahsilat numeric; v_anlasilan numeric;
begin
  /* Kullanicinin acik talebi: "is basina para girilsin ama bu hesaplamaya
     degmesin, sadece not gibi olsun". 4100 TL is tutari var ama ne
     tahsilata ne anlasilan tutara girmeli. */
  select (dashboard_summary(current_date, current_date)->>'tahsilat')::numeric,
         (dashboard_summary(current_date, current_date)->>'anlasilan_tutar')::numeric
  into v_tahsilat, v_anlasilan;
  if v_tahsilat <> 0 then
    raise exception 'KALDI: is tutari tahsilata karisti: %', v_tahsilat;
  end if;
  if v_anlasilan <> 0 then
    raise exception 'KALDI: is tutari anlasilan tutara karisti: %', v_anlasilan;
  end if;
  raise notice 'GECTI: is tutari not niteliginde, hicbir hesaba girmiyor';
end $$;

\echo '--- TEST 27: negatif is tutari reddediliyor ---'
do $$
begin
  insert into jobs (id, segment_id, title, agreed_amount)
  values ('10777777-7777-4777-8777-777777777777',
          '10222222-2222-4222-8222-222222222222', 'Negatif tutar isi', -1);
  raise exception 'KALDI: negatif is tutari kabul edildi';
exception
  when check_violation then
    raise notice 'GECTI: negatif is tutari sema kisitiyla reddedildi';
end $$;

\echo '--- TEST 28: geri alip tekrar tamamlarken tutar kaybolmuyor ---'
do $$
declare v numeric;
begin
  perform revert_job_completion('10666666-6666-4666-8666-666666666666');
  perform complete_job('10666666-6666-4666-8666-666666666666',
                       array['revision']::service_type[]);
  select agreed_amount into v from jobs
  where id = '10666666-6666-4666-8666-666666666666';
  if v <> 4100 then
    raise exception 'KALDI: tutar kayboldu, gelen %', v;
  end if;
  raise notice 'GECTI: geri al + tamamla tutari koruyor';
end $$;

-- #############################################################################
-- E) ANLASILAN TUTAR vs TAHSILAT
-- #############################################################################

\echo '--- TEST 29: elle girilen tutar ANLASILAN, tahsilat degil ---'
do $$
declare v_anlasilan numeric; v_elden numeric; v_tahsilat numeric; v_kalan numeric;
begin
  perform segment_anlasilan_yaz('10222222-2222-4222-8222-222222222222', 4000);
  select (dashboard_summary(current_date, current_date)->>'anlasilan_tutar')::numeric,
         (dashboard_summary(current_date, current_date)->>'elden_anlasilan')::numeric,
         (dashboard_summary(current_date, current_date)->>'tahsilat')::numeric,
         (dashboard_summary(current_date, current_date)->>'kalan_alacak')::numeric
  into v_anlasilan, v_elden, v_tahsilat, v_kalan;
  if v_elden <> 4000 then raise exception 'KALDI: elden anlasilan %', v_elden; end if;
  if v_anlasilan <> 4000 then raise exception 'KALDI: anlasilan %', v_anlasilan; end if;
  /* Kritik ayrim: tutar girildi ama para alinmadi. */
  if v_tahsilat <> 0 then
    raise exception 'KALDI: anlasilan tutar tahsilat sayildi: %', v_tahsilat;
  end if;
  if v_kalan <> 4000 then raise exception 'KALDI: kalan alacak %', v_kalan; end if;
  raise notice 'GECTI: anlasilan tutar tahsilat sayilmiyor, alacaga yaziliyor';
end $$;

\echo '--- TEST 30: fatura + elden anlasilan birlikte, cifte saymadan ---'
do $$
declare v_top numeric; v_faturali numeric; v_elden numeric;
begin
  insert into invoices (customer_id, segment_id, gross_amount, net_amount, issue_date)
  values ('10111111-1111-4111-8111-111111111111',
          '10333333-3333-4333-8333-333333333333', 6000, 6000, current_date);

  select (dashboard_summary(current_date, current_date)->>'anlasilan_tutar')::numeric,
         (dashboard_summary(current_date, current_date)->>'faturali_anlasilan')::numeric,
         (dashboard_summary(current_date, current_date)->>'elden_anlasilan')::numeric
  into v_top, v_faturali, v_elden;

  if v_faturali <> 6000 then raise exception 'KALDI: faturali %', v_faturali; end if;
  if v_elden <> 4000 then raise exception 'KALDI: elden %', v_elden; end if;
  if v_top <> 10000 then
    raise exception 'KALDI: 10000 beklenirdi (cifte sayim?), gelen %', v_top;
  end if;
  raise notice 'GECTI: iki anlasma kalemi ayri ayri ve toplam dogru';
end $$;

\echo '--- TEST 31: COK VADE — parca parca tahsilat toplaniyor ---'
do $$
declare v_tahsilat numeric; v_sayi integer; v_kalan numeric;
begin
  /* Kullanicinin asil istegi: anlasilan para tek seferde odenmiyor. */
  perform tahsilat_ekle('10333333-3333-4333-8333-333333333333', 2000,
                        current_date, '1. vade');
  perform tahsilat_ekle('10333333-3333-4333-8333-333333333333', 1500,
                        current_date, '2. vade');

  select (dashboard_summary(current_date, current_date)->>'tahsilat')::numeric,
         (dashboard_summary(current_date, current_date)->>'tahsilat_sayisi')::integer,
         (dashboard_summary(current_date, current_date)->>'kalan_alacak')::numeric
  into v_tahsilat, v_sayi, v_kalan;

  if v_tahsilat <> 3500 then raise exception 'KALDI: tahsilat %', v_tahsilat; end if;
  if v_sayi <> 2 then raise exception 'KALDI: vade sayisi %', v_sayi; end if;
  -- 4000 (odenmemis) + 6000 - 3500 = 6500
  if v_kalan <> 6500 then raise exception 'KALDI: kalan alacak %', v_kalan; end if;
  raise notice 'GECTI: iki vade toplandi, kalan alacak dogru (6.500)';
end $$;

\echo '--- TEST 32: segment bakiyesi tek satirda dogru ---'
do $$
declare v record;
begin
  select * into v from segment_balances
  where segment_id = '10333333-3333-4333-8333-333333333333';
  if v.anlasilan <> 6000 then raise exception 'KALDI: anlasilan %', v.anlasilan; end if;
  if v.tahsil_edilen <> 3500 then raise exception 'KALDI: tahsil %', v.tahsil_edilen; end if;
  if v.vade_sayisi <> 2 then raise exception 'KALDI: vade %', v.vade_sayisi; end if;
  if v.kalan <> 2500 then raise exception 'KALDI: kalan %', v.kalan; end if;
  raise notice 'GECTI: segment_balances anlasilan/tahsilat/kalan dogru';
end $$;

\echo '--- TEST 33: anlasilan girilmemisse kalan SIFIR degil BILINMIYOR ---'
do $$
declare v_kalan numeric; v_seg uuid := '10888888-8888-4888-8888-888888888888';
begin
  /* Sifir yazmak "borc yok" demek olurdu; dogrusu "borc bilinmiyor". */
  insert into segments (id, customer_id, segment_date)
  values (v_seg, '10111111-1111-4111-8111-111111111111', current_date);
  select kalan into v_kalan from segment_balances where segment_id = v_seg;
  if v_kalan is not null then
    raise exception 'KALDI: anlasilansiz segmentin kalani % (null olmaliydi)', v_kalan;
  end if;
  raise notice 'GECTI: anlasilan yoksa kalan null';
end $$;

\echo '--- TEST 34: anlasma olmadan da tahsilat girilebiliyor ---'
do $$
declare v_tahsil numeric; v_kalan numeric;
begin
  /* Para kagittan once gelebiliyor; kullaniciyi "once sunu gir" diye
     durdurmak sahada isi tikiyor. */
  perform tahsilat_ekle('10888888-8888-4888-8888-888888888888', 250);
  select tahsil_edilen, kalan into v_tahsil, v_kalan
  from segment_balances where segment_id = '10888888-8888-4888-8888-888888888888';
  if v_tahsil <> 250 then raise exception 'KALDI: tahsilat %', v_tahsil; end if;
  if v_kalan is not null then raise exception 'KALDI: kalan %', v_kalan; end if;
  raise notice 'GECTI: anlasilan tutar olmadan tahsilat kabul ediliyor';
end $$;

\echo '--- TEST 35: kar/zarar NAKIT esasli (tahsilat - maliyet) ---'
do $$
declare v_kar numeric; v_tahsilat numeric; v_maliyet numeric;
begin
  select (dashboard_summary(current_date, current_date)->>'kar_zarar')::numeric,
         (dashboard_summary(current_date, current_date)->>'tahsilat')::numeric,
         (dashboard_summary(current_date, current_date)->>'malzeme_maliyeti')::numeric
  into v_kar, v_tahsilat, v_maliyet;
  if v_kar <> v_tahsilat - v_maliyet then
    raise exception 'KALDI: kar % <> % - %', v_kar, v_tahsilat, v_maliyet;
  end if;
  if v_maliyet <= 0 then raise exception 'KALDI: maliyet sifir cikti'; end if;
  raise notice 'GECTI: kar = tahsilat - maliyet';
end $$;

\echo '--- TEST 36: aylik trend tahsilati ODEME AYINA yaziyor ---'
do $$
declare v_bu numeric;
begin
  select tahsilat into v_bu from monthly_trend(1)
  where donem = date_trunc('month', current_date)::date;
  -- 2000 + 1500 + 250 = 3750
  if v_bu <> 3750 then
    raise exception 'KALDI: trendde 3750 beklenirdi, gelen %', v_bu;
  end if;
  raise notice 'GECTI: aylik trend tahsilati topluyor (3.750)';
end $$;

\echo '--- TEST 37: musteri bazli rapor tahsilat ve alacagi ayri gosteriyor ---'
do $$
declare v record;
begin
  select * into v from dashboard_by_customer(current_date, current_date)
  where customer_id = '10111111-1111-4111-8111-111111111111';
  if v.tahsilat <> 3750 then
    raise exception 'KALDI: musteri tahsilati %', v.tahsilat;
  end if;
  -- 4000 (elden, odenmemis) + 2500 (fatura kalani) = 6500
  if v.kalan_alacak <> 6500 then
    raise exception 'KALDI: musteri alacagi %', v.kalan_alacak;
  end if;
  raise notice 'GECTI: musteri bazli rapor tahsilat 3.750 / alacak 6.500';
end $$;

\echo '--- TEST 38: silinen segmentin tutari da tahsilati da dusuyor ---'
do $$
declare v_elden numeric; v_tahsilat numeric;
begin
  update segments set deleted_at = now()
  where id = '10333333-3333-4333-8333-333333333333';
  select (dashboard_summary(current_date, current_date)->>'faturali_anlasilan')::numeric,
         (dashboard_summary(current_date, current_date)->>'tahsilat')::numeric
  into v_elden, v_tahsilat;
  if v_elden <> 0 then
    raise exception 'KALDI: silinen segmentin faturasi anlasilanda: %', v_elden;
  end if;
  -- Geriye yalnizca 10888888'in 250'si kaliyor
  if v_tahsilat <> 250 then
    raise exception 'KALDI: silinen segmentin tahsilati sayildi: %', v_tahsilat;
  end if;
  update segments set deleted_at = null
  where id = '10333333-3333-4333-8333-333333333333';
  raise notice 'GECTI: silinen segment ne anlasilanda ne tahsilatta';
end $$;

\echo '--- TEST 39: yumusak silinen tahsilat bakiyeden dusuyor ---'
do $$
declare v_id uuid; v_once numeric; v_sonra numeric;
begin
  select tahsil_edilen into v_once from segment_balances
  where segment_id = '10333333-3333-4333-8333-333333333333';

  select tahsilat_id into v_id from segment_tahsilatlari(
    '10333333-3333-4333-8333-333333333333') limit 1;
  perform kayit_sil('payments', v_id);

  select tahsil_edilen into v_sonra from segment_balances
  where segment_id = '10333333-3333-4333-8333-333333333333';
  if v_sonra <> v_once - 2000 then
    raise exception 'KALDI: silinen tahsilat bakiyede, % -> %', v_once, v_sonra;
  end if;
  raise notice 'GECTI: silinen tahsilat bakiyeden dusuyor';
end $$;

\echo '--- TEST 40: sifir ve negatif tahsilat reddediliyor ---'
do $$
begin
  perform tahsilat_ekle('10333333-3333-4333-8333-333333333333', 0);
  raise exception 'KALDI: sifir tahsilat kabul edildi';
exception
  when invalid_parameter_value then
    raise notice 'GECTI: sifir tahsilat reddedildi';
end $$;

do $$
begin
  perform tahsilat_ekle('10333333-3333-4333-8333-333333333333', -100);
  raise exception 'KALDI: negatif tahsilat kabul edildi';
exception
  when invalid_parameter_value then
    raise notice 'GECTI: negatif tahsilat reddedildi';
end $$;

\echo '--- TEST 41: tahsilat tarihi duzeltilebiliyor ---'
do $$
declare v_id uuid; v date;
begin
  v_id := tahsilat_ekle('10333333-3333-4333-8333-333333333333', 400);
  /* Yanlis aya yazilmis bir tahsilat duzeltilebilmeli; yoksa gelir
     yanlis ayda kaliyor ve tek care kaydi silip yeniden girmek olurdu. */
  perform tahsilat_guncelle(v_id, 450, current_date - 40, 'duzeltildi');
  select tarih into v from segment_tahsilatlari(
    '10333333-3333-4333-8333-333333333333')
  where tahsilat_id = v_id;
  if v <> current_date - 40 then
    raise exception 'KALDI: tarih guncellenmedi, gelen %', v;
  end if;
  perform kayit_sil('payments', v_id);
  raise notice 'GECTI: tahsilat tutari ve tarihi duzeltilebiliyor';
end $$;

\echo '--- TEST 42: silinmis segmente tahsilat girilemiyor ---'
do $$
begin
  update segments set deleted_at = now()
  where id = '10888888-8888-4888-8888-888888888888';
  begin
    perform tahsilat_ekle('10888888-8888-4888-8888-888888888888', 100);
    raise exception 'KALDI: silinmis segmente tahsilat girildi';
  exception
    when no_data_found then
      raise notice 'GECTI: silinmis segment tahsilat kabul etmiyor';
  end;
  update segments set deleted_at = null
  where id = '10888888-8888-4888-8888-888888888888';
end $$;

-- #############################################################################
-- F) YETKI
-- #############################################################################

\echo '--- TEST 43: yeni fonksiyonlar anon a kapali ---'
do $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'apply_stock_movement(uuid, integer, numeric, text)',
    'urun_ve_stok_ekle(text, unit_type, integer, numeric, text, text)',
    'urun_stok_gecmisi(uuid, integer)',
    'segment_anlasilan_yaz(uuid, numeric)',
    'tahsilat_ekle(uuid, numeric, date, text)',
    'tahsilat_guncelle(uuid, numeric, date, text)',
    'segment_tahsilatlari(uuid)',
    'complete_job(uuid, service_type[], boolean)',
    'dashboard_summary(date, date)',
    'monthly_trend(integer)',
    'dashboard_by_customer(date, date)'
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

\echo '--- TEST 44: cakisma trigger fonksiyonu istemci rollerine kapali ---'
do $$
begin
  if has_function_privilege('anon', 'segment_ciro_cakismasi()', 'EXECUTE')
     or has_function_privilege('authenticated', 'segment_ciro_cakismasi()', 'EXECUTE') then
    raise exception 'KALDI: trigger fonksiyonu dogrudan cagirilabiliyor';
  end if;
  raise notice 'GECTI: trigger fonksiyonu yalnizca trigger uzerinden calisiyor';
end $$;

\echo '--- TEST 45: eski imzalar kaldirildi ---'
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
\echo '=== 10_tutar_stok_test.sql: 46 dogrulama gecti ==='

rollback;
