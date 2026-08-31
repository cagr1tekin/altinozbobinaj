-- =============================================================================
-- Row Level Security
--
-- PRD Bölüm 3: tek bir iç kullanıcı rolü var (Admin/Operatör). Müşteri sisteme
-- giriş yapmıyor, yalnızca QR ile salt-okunur bir sayfa görüyor.
--
-- Bu yüzden model şu şekilde:
--   authenticated  → tüm tablolarda tam yetki (personel)
--   anon           → hiçbir tabloda yetki YOK
--   QR sayfası     → yalnızca public_job_by_token() fonksiyonu üzerinden,
--                    ticari bilgi içermeyen sınırlı bir çıktı
--
-- Supabase'de RLS açıkken politika tanımlanmayan tablo hiç kimseye
-- görünmez; anon için ayrıca "deny" politikası yazmak gerekmiyor.
-- =============================================================================

alter table customers       enable row level security;
alter table segments        enable row level security;
alter table jobs            enable row level security;
alter table products        enable row level security;
alter table job_products    enable row level security;
alter table stock_movements enable row level security;
alter table invoices        enable row level security;
alter table qr_codes        enable row level security;
alter table pdf_exports     enable row level security;

-- -----------------------------------------------------------------------------
-- Personel (authenticated) politikaları
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'customers', 'segments', 'jobs', 'products',
    'job_products', 'invoices', 'qr_codes', 'pdf_exports'
  ]
  loop
    execute format('drop policy if exists %I on %I', t || '_staff_all', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      t || '_staff_all', t
    );
  end loop;
end $$;

-- stock_movements denetim izi: personel okuyabilir ve ekleyebilir ama
-- GÜNCELLEYEMEZ/SİLEMEZ. Geçmişi değiştirilebilen bir kayıt denetim izi olmaz.
drop policy if exists stock_movements_staff_select on stock_movements;
create policy stock_movements_staff_select
  on stock_movements for select to authenticated using (true);

drop policy if exists stock_movements_staff_insert on stock_movements;
create policy stock_movements_staff_insert
  on stock_movements for insert to authenticated with check (true);

-- -----------------------------------------------------------------------------
-- Fonksiyon yetkileri
-- -----------------------------------------------------------------------------
revoke all on function complete_job(uuid, boolean) from public;
revoke all on function revert_job_completion(uuid) from public;
revoke all on function apply_stock_movement(uuid, movement_type, integer, numeric, text) from public;
revoke all on function add_job_product(uuid, uuid, integer, numeric) from public;
revoke all on function public_job_by_token(text) from public;

grant execute on function complete_job(uuid, boolean) to authenticated;
grant execute on function revert_job_completion(uuid) to authenticated;
grant execute on function apply_stock_movement(uuid, movement_type, integer, numeric, text) to authenticated;
grant execute on function add_job_product(uuid, uuid, integer, numeric) to authenticated;

-- QR sayfası girişsiz açılıyor: anon yalnızca bu fonksiyonu çağırabilir
grant execute on function public_job_by_token(text) to anon, authenticated;
