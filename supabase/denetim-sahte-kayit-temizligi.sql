-- =============================================================================
-- Sahte "Rapor PDF alındı" kayıtlarını temizleme  —  TEK SEFERLİK, İSTEĞE BAĞLI
--
-- NE OLDU?
--   Raporlar sayfasındaki "Dönem raporunu indir" butonu next/link ile
--   bağlanmıştı. next/link, görüş alanına giren bağlantıyı önceden getiriyor
--   (prefetch) ve hedef bir API rotası olduğunda rota GERÇEKTEN çalışıyor.
--   Yani sayfa her açıldığında, kullanıcı butona hiç dokunmamışken bir
--   "PDF alındı" kaydı yazılıyordu.
--
--   Ölçüldü: 1 sayfa açılışı + 3 yenileme = 4 çalıştırma. Düzeltmeden sonra 0.
--
-- HATA GİDERİLDİ:
--   1) API rotalarına giden butonlar artık düz <a> (prefetch yok)
--   2) İkinci katman: ön yükleme başlığı taşıyan istek günlüğe yazmıyor
--   3) Kalıcı test: scripts/bilesen-testi.tsx
--
-- BU DOSYA NE YAPAR?
--   Sahte kayıtları SİLER. Denetim günlüğü normalde salt-eklenirdir ve bu
--   bilinçli bir tasarım: sonradan değiştirilebilen bir günlüğün denetim
--   değeri kalmaz. Bu yüzden dosya otomatik kurulumun parçası DEĞİL ve
--   kendiliğinden çalışmaz — silme kararı sizin.
--
--   Silmemek de geçerli bir seçim: kayıtlar yanlış ama zararsız, yalnızca
--   listeyi kalabalıklaştırıyor.
--
-- NASIL ÇALIŞTIRILIR?
--   1. ADIM: Dosyayı olduğu gibi çalıştırın — hiçbir şey SİLMEZ, yalnızca
--            ne silineceğini raporlar.
--   2. ADIM: Rapor mantıklıysa en alttaki bloğun yorumunu kaldırıp tekrar
--            çalıştırın.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Şüpheli kayıtlar: yalnızca dönem raporu PDF kayıtları
--
-- Neden yalnızca bunlar? Diğer PDF butonları (iş, segment, müşteri) zaten
-- düz <a> kullanıyordu, prefetch'ten etkilenmediler. Onlara dokunulmuyor.
-- -----------------------------------------------------------------------------
do $$
declare
  v_toplam   integer;
  v_ilk      timestamptz;
  v_son      timestamptz;
  v_gun      integer;
begin
  select count(*), min(occurred_at), max(occurred_at),
         count(distinct date_trunc('day', occurred_at))
    into v_toplam, v_ilk, v_son, v_gun
  from audit_log
  where action = 'pdf' and entity = 'report';

  raise notice '--- SUPHELI KAYITLAR ---';
  raise notice 'Rapor PDF kaydi     : % adet', v_toplam;
  raise notice 'En eski             : %', coalesce(v_ilk::text, 'yok');
  raise notice 'En yeni             : %', coalesce(v_son::text, 'yok');
  raise notice 'Kac ayri gun        : %', v_gun;
  raise notice '';
  raise notice 'NOT: Bunlarin arasinda GERCEKTEN indirdiginiz raporlar da';
  raise notice '     olabilir. Prefetch ile gercek indirme ayni kaydi';
  raise notice '     yaziyordu, birbirinden ayirt edilemiyor.';
end $$;

-- -----------------------------------------------------------------------------
-- 2) Aynı dakika içinde tekrarlayanlar — prefetch'in imzası
--
-- Bir insan aynı raporu aynı dakikada 15 kez indirmez. Bu gruplar neredeyse
-- kesin prefetch kaynaklı.
-- -----------------------------------------------------------------------------
select
  date_trunc('minute', occurred_at) as dakika,
  actor_email,
  label,
  count(*)                          as kayit_sayisi
from audit_log
where action = 'pdf' and entity = 'report'
group by 1, 2, 3
having count(*) > 1
order by 1 desc
limit 50;

-- -----------------------------------------------------------------------------
-- 3) SİLME — yorumu kaldırarak çalıştırın
--
-- İki seçenek var; birini seçip yorumunu kaldırın.
-- -----------------------------------------------------------------------------

/* SEÇENEK A — Yalnızca aynı dakikada tekrarlayanların ilkini bırak, gerisini sil.
   Daha korumacı: gerçekten indirdiğiniz raporların kaybolma ihtimali düşük,
   çünkü her gruptan bir kayıt kalıyor.

delete from audit_log
where id in (
  select id from (
    select id,
           row_number() over (
             partition by date_trunc('minute', occurred_at), actor_email, label
             order by id
           ) as sira
    from audit_log
    where action = 'pdf' and entity = 'report'
  ) t
  where t.sira > 1
);
*/

/* SEÇENEK B — Belirli bir tarihten önceki TÜM rapor PDF kayıtlarını sil.
   Tarihi düzeltmenin canlıya çıktığı güne ayarlayın. Bu seçenek o tarihten
   önce gerçekten indirdiğiniz raporların kaydını da siler.

delete from audit_log
where action = 'pdf'
  and entity = 'report'
  and occurred_at < '2026-09-03'::date;   -- <-- kendi tarihinizi yazın
*/

-- -----------------------------------------------------------------------------
-- 4) Silme sonrası kontrol
-- -----------------------------------------------------------------------------
do $$
declare v integer;
begin
  select count(*) into v from audit_log where action = 'pdf' and entity = 'report';
  raise notice '';
  raise notice 'Kalan rapor PDF kaydi: %', v;
  raise notice 'Bundan sonra bu kayitlar yalnizca gercek indirmede olusur.';
end $$;
