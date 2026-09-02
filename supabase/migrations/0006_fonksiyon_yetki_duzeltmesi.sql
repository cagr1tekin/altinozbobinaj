-- =============================================================================
-- GÜVENLİK DÜZELTMESİ: fonksiyonların anon rolüne açık kalması
--
-- Sorun
-- -----
-- Supabase, public şemasında oluşturulan TÜM fonksiyonları varsayılan olarak
-- anon ve authenticated rollerine grant ediyor:
--
--   alter default privileges in schema public
--     grant all on functions to anon, authenticated, service_role;
--
-- Önceki migration'lardaki `revoke all on function ... from public` bu grant'ı
-- kaldırmıyor, çünkü yetki `public` grubuna değil doğrudan `anon` rolüne
-- verilmiş. Sonuç olarak giriş yapmamış biri, anon anahtarıyla:
--
--   * refresh_monthly_summary() ve nightly_summary_refresh() — ikisi de
--     SECURITY DEFINER olduğu için RLS'i baypas ederek monthly_summaries
--     tablosuna YAZABİLİYORDU. Ayrıca her çağrı tüm fatura ve iş kayıtlarını
--     taradığı için tekrarlı çağrılar veritabanını yorabilirdi.
--   * complete_job, apply_stock_movement gibi SECURITY INVOKER fonksiyonları
--     çağırabiliyordu. Bunlarda RLS koruduğu için veri sızmıyordu (sorgular
--     boş dönüyor, "kayıt bulunamadı" hatası alınıyordu) ama uçların açıkta
--     olması gereksiz bir saldırı yüzeyi.
--
-- Bu dosya, anon rolünden tüm proje fonksiyonlarının yetkisini açıkça geri
-- alıyor; yalnızca QR sayfasının kullandığı public_job_by_token açık kalıyor.
--
-- Not: pgcrypto gibi uzantı fonksiyonlarına dokunulmuyor — onlar Supabase'in
-- kendi varsayılanı ve saf hesaplama yapıyorlar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) İş akışı fonksiyonları — yalnızca personel
-- -----------------------------------------------------------------------------
revoke all on function complete_job(uuid, boolean) from anon, public;
revoke all on function revert_job_completion(uuid) from anon, public;
revoke all on function apply_stock_movement(uuid, movement_type, integer, numeric, text)
  from anon, public;
revoke all on function add_job_product(uuid, uuid, integer, numeric) from anon, public;

grant execute on function complete_job(uuid, boolean) to authenticated;
grant execute on function revert_job_completion(uuid) to authenticated;
grant execute on function apply_stock_movement(uuid, movement_type, integer, numeric, text)
  to authenticated;
grant execute on function add_job_product(uuid, uuid, integer, numeric) to authenticated;

-- -----------------------------------------------------------------------------
-- 2) Raporlama fonksiyonları — yalnızca personel
-- -----------------------------------------------------------------------------
revoke all on function dashboard_summary(date, date) from anon, public;
revoke all on function dashboard_by_customer(date, date) from anon, public;
revoke all on function stock_reconciliation() from anon, public;

grant execute on function dashboard_summary(date, date) to authenticated;
grant execute on function dashboard_by_customer(date, date) to authenticated;
grant execute on function stock_reconciliation() to authenticated;
/* Bkz. 0004: 0008 sonrasi bu imza yok. */
do $$
begin
  revoke all on function job_product_cost(unit_type, numeric, integer, numeric)
    from anon, public;
  grant execute on function job_product_cost(unit_type, numeric, integer, numeric)
    to authenticated;
exception
  when undefined_function then
    raise notice 'job_product_cost eski imzasi yok (0008 uygulanmis), yetki adimi atlandi.';
end $$;

-- -----------------------------------------------------------------------------
-- 3) SECURITY DEFINER bakım fonksiyonları — hiçbir istemci rolü çağıramaz
--
-- Bunları pg_cron (postgres rolüyle) çalıştırıyor. Panelin bunlara ihtiyacı
-- yok; authenticated'a bile verilmiyor çünkü RLS'i baypas ediyorlar.
-- -----------------------------------------------------------------------------
revoke all on function refresh_monthly_summary(date) from anon, authenticated, public;
revoke all on function nightly_summary_refresh() from anon, authenticated, public;

-- -----------------------------------------------------------------------------
-- 4) Trigger fonksiyonları — doğrudan çağrılmamalı
-- -----------------------------------------------------------------------------
revoke all on function record_opening_stock() from anon, authenticated, public;
revoke all on function set_updated_at() from anon, authenticated, public;

-- -----------------------------------------------------------------------------
-- 5) QR sayfası — bilinçli olarak anon'a açık
--
-- Girişsiz açılan tek uç. security definer ve sabit search_path ile çalışıyor,
-- yalnızca iş başlığı / tarih / malzeme adı-miktarı döndürüyor; alış fiyatı,
-- maliyet ve müşteri kimliği çıktıda yok (PRD 5.6).
-- -----------------------------------------------------------------------------
revoke all on function public_job_by_token(text) from public;
grant execute on function public_job_by_token(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6) Bundan sonra oluşturulacak fonksiyonlar
--
-- Varsayılan yetki kuralı değiştirilmiyor: Supabase'in kendi kurulumu buna
-- bağlı olabilir. Bunun yerine kural şu — public şemasına eklenen her yeni
-- fonksiyon için anon yetkisi AÇIKÇA geri alınmalı. Aşağıdaki sorgu, gözden
-- kaçan bir fonksiyon olup olmadığını gösterir:
--
--   select p.proname, p.prosecdef as security_definer
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and has_function_privilege('anon', p.oid, 'EXECUTE')
--     and p.proname not in ('public_job_by_token')
--     and p.oid not in (
--       select objid from pg_depend d
--       join pg_extension e on e.oid = d.refobjid where d.deptype = 'e'
--     );
--
-- Bu sorgu boş dönmeli. e2e/guvenlik.spec.ts aynı kontrolü HTTP üzerinden
-- yapıyor.
-- -----------------------------------------------------------------------------
