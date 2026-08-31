-- =============================================================================
-- Altınöz Bobinaj — Yönetim Paneli, tüm kurulum SQL'i
--
-- Bu dosya supabase/migrations/ altındaki dosyaların SIRAYLA birleştirilmiş
-- hâlidir. Supabase panelinde SQL Editor'e tek seferde yapıştırıp
-- çalıştırabilirsiniz.
--
-- Tekrar çalıştırmak güvenlidir (if not exists / or replace kullanılıyor).
--
-- NOT: supabase/tests/00_supabase_shim.sql dosyasını BURAYA DAHİL ETMEYİN ve
-- Supabase'de çalıştırmayın — o yalnızca yerel Postgres testleri içindir;
-- anon/authenticated rolleri Supabase'de zaten mevcuttur.
-- =============================================================================

-- #############################################################################
-- # 0001_initial_schema.sql
-- # SEMA: tablolar, enum'lar, indeksler, kisitlar
-- #############################################################################

-- =============================================================================
-- Altınöz Bobinaj — Yönetim Paneli, ilk şema
-- PRD Bölüm 4 (veri modeli) ve Bölüm 5 (fonksiyonel detaylar) temel alındı.
--
-- PRD'den bilinçli sapmalar:
--  1) stock_movements tablosu PRD'de Faz 5 olarak işaretli ama baştan
--     eklendi. Maliyet/kâr hesabının doğruluğu stok hareketlerinin
--     izlenebilirliğine bağlı; sonradan eklemek geçmiş veriyi yeniden
--     üretmeyi gerektirir ki bu mümkün olmuyor.
--  2) Stok miktarı hem products üzerinde (hızlı okuma) hem stock_movements
--     içinde (denetim) tutuluyor. products.qty_* alanları yalnızca
--     fonksiyonlar üzerinden değişir, doğrudan UPDATE beklenmiyor.
--  3) qty_pieces integer: "adet" sayılabilir bir birim, kesirli olması
--     veri hatası. Kesirli ölçüm gereken malzeme kg tarafında izlenir.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enum tipleri
-- -----------------------------------------------------------------------------
do $$ begin
  create type job_status as enum ('pending', 'in_progress', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type segment_status as enum ('open', 'closed');
exception when duplicate_object then null; end $$;

-- Ürünün varsayılan takip birimi. 'both' = hem adet hem kg izlenir.
do $$ begin
  create type unit_type as enum ('piece', 'kg', 'both');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_type as enum (
    'purchase_in',   -- satın alma / stok girişi
    'job_out',       -- işe harcandı
    'adjustment',    -- sayım düzeltmesi
    'job_revert'     -- iş tamamlaması geri alındı
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- updated_at tetikleyicisi
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  phone       text,
  email       text,
  address     text,
  tax_number  text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists customers_name_idx on customers (lower(name));
create index if not exists customers_created_at_idx on customers (created_at desc);

drop trigger if exists customers_set_updated_at on customers;
create trigger customers_set_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- segments — bir müşterinin tek bir ziyaret/teslim gününde bıraktığı iş grubu
-- -----------------------------------------------------------------------------
create table if not exists segments (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers (id) on delete cascade,
  segment_date date not null default current_date,
  note         text,
  status       segment_status not null default 'open',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists segments_customer_idx on segments (customer_id, segment_date desc);

drop trigger if exists segments_set_updated_at on segments;
create trigger segments_set_updated_at
  before update on segments
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- jobs — segment içindeki tekil iş kalemi
-- -----------------------------------------------------------------------------
create table if not exists jobs (
  id           uuid primary key default gen_random_uuid(),
  segment_id   uuid not null references segments (id) on delete cascade,
  title        text not null check (length(btrim(title)) > 0),
  description  text,
  status       job_status not null default 'pending',
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- completed_at ile status'un tutarsız kalmasını engeller
  constraint jobs_completed_at_consistency check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create index if not exists jobs_segment_idx on jobs (segment_id);
create index if not exists jobs_status_idx on jobs (status) where status <> 'completed';

drop trigger if exists jobs_set_updated_at on jobs;
create trigger jobs_set_updated_at
  before update on jobs
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- products — ürün/malzeme tanımı + anlık stok
--
-- PRD 5.3: adet ve kilogram BİRBİRİNDEN BAĞIMSIZ iki sayaç. Adet başına
-- ağırlık sabit olmadığı için otomatik birim dönüşümü YAPILMAZ; dönüşüm
-- hatalı stok verisine yol açar.
-- -----------------------------------------------------------------------------
create table if not exists products (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(btrim(name)) > 0),
  sku               text unique,
  purchase_price    numeric(12, 2) not null default 0 check (purchase_price >= 0),
  unit_type_default unit_type not null default 'piece',
  qty_pieces        integer not null default 0,
  qty_kg            numeric(12, 3) not null default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists products_name_idx on products (lower(name));

drop trigger if exists products_set_updated_at on products;
create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- job_products — bir işte harcanan ürünler
--
-- unit_cost_snapshot: PRD Bölüm 11 / Soru 3'ün önerdiği çözüm. Ürün alış
-- fiyatı sonradan değişse bile geçmiş işin maliyeti sabit kalır.
-- -----------------------------------------------------------------------------
create table if not exists job_products (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null references jobs (id) on delete cascade,
  product_id         uuid not null references products (id) on delete restrict,
  qty_pieces_used    integer not null default 0 check (qty_pieces_used >= 0),
  qty_kg_used        numeric(12, 3) not null default 0 check (qty_kg_used >= 0),
  unit_cost_snapshot numeric(12, 2) not null default 0 check (unit_cost_snapshot >= 0),
  created_at         timestamptz not null default now(),
  -- Miktarsız satır anlamsız: en az bir birimde tüketim olmalı
  constraint job_products_qty_not_empty check (qty_pieces_used > 0 or qty_kg_used > 0)
);

create index if not exists job_products_job_idx on job_products (job_id);
create index if not exists job_products_product_idx on job_products (product_id);

-- -----------------------------------------------------------------------------
-- stock_movements — stok hareket geçmişi (denetim izi)
-- -----------------------------------------------------------------------------
create table if not exists stock_movements (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references products (id) on delete cascade,
  job_id           uuid references jobs (id) on delete set null,
  movement_type    movement_type not null,
  qty_pieces_delta integer not null default 0,
  qty_kg_delta     numeric(12, 3) not null default 0,
  note             text,
  created_at       timestamptz not null default now(),
  constraint stock_movements_delta_not_empty check (
    qty_pieces_delta <> 0 or qty_kg_delta <> 0
  )
);

create index if not exists stock_movements_product_idx
  on stock_movements (product_id, created_at desc);
create index if not exists stock_movements_job_idx on stock_movements (job_id);

-- -----------------------------------------------------------------------------
-- invoices — fatura kaydı (brüt/net)
-- PRD 2.1: tahsilat/ödeme takibi kapsam dışı, yalnızca fatura kaydı.
-- -----------------------------------------------------------------------------
create table if not exists invoices (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers (id) on delete restrict,
  segment_id   uuid references segments (id) on delete set null,
  invoice_no   text,
  gross_amount numeric(14, 2) not null default 0 check (gross_amount >= 0),
  net_amount   numeric(14, 2) not null default 0 check (net_amount >= 0),
  tax_amount   numeric(14, 2) not null default 0 check (tax_amount >= 0),
  issue_date   date not null default current_date,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists invoices_invoice_no_key
  on invoices (invoice_no) where invoice_no is not null;
create index if not exists invoices_customer_idx on invoices (customer_id, issue_date desc);
create index if not exists invoices_issue_date_idx on invoices (issue_date desc);

drop trigger if exists invoices_set_updated_at on invoices;
create trigger invoices_set_updated_at
  before update on invoices
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- qr_codes — iş bazlı malzeme şeffaflığı
--
-- PRD 5.6 güvenlik notu: token sıralı/tahmin edilebilir OLMAMALI. Bu yüzden
-- job id yerine 128 bitlik rastgele değer kullanılıyor.
-- -----------------------------------------------------------------------------
create table if not exists qr_codes (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null unique references jobs (id) on delete cascade,
  token      text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now()
);

create index if not exists qr_codes_token_idx on qr_codes (token);

-- -----------------------------------------------------------------------------
-- pdf_exports — üretilen PDF'lerin logu (opsiyonel, denetim amaçlı)
-- -----------------------------------------------------------------------------
create table if not exists pdf_exports (
  id           uuid primary key default gen_random_uuid(),
  export_type  text not null check (
    export_type in ('customer', 'segment', 'job', 'period_report')
  ),
  reference_id uuid,
  file_path    text,
  generated_by uuid,
  generated_at timestamptz not null default now()
);

create index if not exists pdf_exports_type_idx on pdf_exports (export_type, generated_at desc);

-- #############################################################################
-- # 0002_functions.sql
-- # FONKSIYONLAR: is akisi, stok dusumu, QR
-- #############################################################################

-- =============================================================================
-- İş akışı fonksiyonları
--
-- Stok düşümü neden uygulama katmanında değil burada?
-- "Oku → hesapla → yaz" akışı iki eşzamanlı istekte yarış koşuluna giriyor ve
-- stok sessizce yanlış kalıyor. Fonksiyon içinde satırlar FOR UPDATE ile
-- kilitleniyor, tüm işlem tek transaction'da atomik ilerliyor.
--
-- Kilitleme sırası: ürünler her zaman product_id sırasına göre kilitleniyor.
-- Sabit bir sıra olmadan iki iş aynı iki ürüne ters sırada eriştiğinde
-- deadlock oluşur.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- complete_job — işi tamamla, malzemeleri stoktan düş, QR üret
--
-- p_allow_negative: normalde stok yetersizse hata verilir, çünkü eksi stok
-- maliyet/kâr hesabını sessizce bozar (genellikle girilmemiş bir alım kaydı
-- anlamına gelir). Sahada işi kapatmak gerçekten gerekiyorsa arayüz bu
-- bayrağı açıkça göndererek devam edebilir.
--
-- PRD Bölüm 11 / Soru: "tamamlandı" için malzeme girişi zorunlu mu?
-- Zorunlu tutulmadı — yalnızca işçilik içeren işler gerçek bir senaryo ve
-- bunları bloklamak sahada kilitlenmeye yol açar.
-- -----------------------------------------------------------------------------
create or replace function complete_job(
  p_job_id uuid,
  p_allow_negative boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_job          jobs;
  v_line         record;
  v_new_pieces   integer;
  v_new_kg       numeric(12, 3);
  v_token        text;
  v_line_count   integer := 0;
begin
  -- İşi kilitle: aynı işin iki kez tamamlanmasını engeller
  select * into v_job
  from jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'İş bulunamadı: %', p_job_id
      using errcode = 'no_data_found';
  end if;

  if v_job.status = 'completed' then
    raise exception 'İş zaten tamamlanmış: %', p_job_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- Malzeme satırlarını ürün kilidiyle birlikte, sabit sırada işle
  for v_line in
    select jp.id,
           jp.product_id,
           jp.qty_pieces_used,
           jp.qty_kg_used,
           p.name       as product_name,
           p.qty_pieces as stock_pieces,
           p.qty_kg     as stock_kg
    from job_products jp
    join products p on p.id = jp.product_id
    where jp.job_id = p_job_id
    order by jp.product_id
    for update of p
  loop
    v_line_count := v_line_count + 1;
    v_new_pieces := v_line.stock_pieces - v_line.qty_pieces_used;
    v_new_kg     := v_line.stock_kg - v_line.qty_kg_used;

    if not p_allow_negative and (v_new_pieces < 0 or v_new_kg < 0) then
      raise exception
        'Stok yetersiz: % (mevcut: % adet / % kg, gereken: % adet / % kg)',
        v_line.product_name,
        v_line.stock_pieces, v_line.stock_kg,
        v_line.qty_pieces_used, v_line.qty_kg_used
        using errcode = 'check_violation';
    end if;

    update products
    set qty_pieces = v_new_pieces,
        qty_kg     = v_new_kg
    where id = v_line.product_id;

    -- Denetim izi: negatif delta = çıkış
    insert into stock_movements (
      product_id, job_id, movement_type, qty_pieces_delta, qty_kg_delta, note
    )
    values (
      v_line.product_id,
      p_job_id,
      'job_out',
      -v_line.qty_pieces_used,
      -v_line.qty_kg_used,
      'İş tamamlandı: ' || v_job.title
    );
  end loop;

  update jobs
  set status = 'completed',
      completed_at = now()
  where id = p_job_id;

  -- QR kodu: iş tamamlandığında üretilir (PRD 5.2 / 5.5)
  insert into qr_codes (job_id)
  values (p_job_id)
  on conflict (job_id) do nothing;

  select token into v_token from qr_codes where job_id = p_job_id;

  return jsonb_build_object(
    'job_id', p_job_id,
    'qr_token', v_token,
    'material_lines', v_line_count
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- revert_job_completion — hatalı tamamlamayı geri al, stoğu iade et
--
-- Elle düzeltme yapılırsa stok ile hareket geçmişi birbirinden kopuyor;
-- bu yüzden geri alma da fonksiyon üzerinden yapılıyor. QR kaydı korunuyor:
-- basılmış etiketin tekrar geçerli olması gerekir.
-- -----------------------------------------------------------------------------
create or replace function revert_job_completion(p_job_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_job        jobs;
  v_line       record;
  v_line_count integer := 0;
begin
  select * into v_job from jobs where id = p_job_id for update;

  if not found then
    raise exception 'İş bulunamadı: %', p_job_id
      using errcode = 'no_data_found';
  end if;

  if v_job.status <> 'completed' then
    raise exception 'İş tamamlanmamış, geri alınamaz: %', p_job_id
      using errcode = 'invalid_parameter_value';
  end if;

  for v_line in
    select jp.product_id, jp.qty_pieces_used, jp.qty_kg_used
    from job_products jp
    join products p on p.id = jp.product_id
    where jp.job_id = p_job_id
    order by jp.product_id
    for update of p
  loop
    v_line_count := v_line_count + 1;

    update products
    set qty_pieces = qty_pieces + v_line.qty_pieces_used,
        qty_kg     = qty_kg + v_line.qty_kg_used
    where id = v_line.product_id;

    insert into stock_movements (
      product_id, job_id, movement_type, qty_pieces_delta, qty_kg_delta, note
    )
    values (
      v_line.product_id,
      p_job_id,
      'job_revert',
      v_line.qty_pieces_used,
      v_line.qty_kg_used,
      'Tamamlama geri alındı: ' || v_job.title
    );
  end loop;

  update jobs
  set status = 'in_progress',
      completed_at = null
  where id = p_job_id;

  return jsonb_build_object('job_id', p_job_id, 'reverted_lines', v_line_count);
end;
$$;

-- -----------------------------------------------------------------------------
-- apply_stock_movement — stok girişi ve sayım düzeltmesi
--
-- products.qty_* alanlarına doğrudan UPDATE atmak yerine bu fonksiyon
-- kullanılır; böylece her değişikliğin bir hareket kaydı oluyor.
-- -----------------------------------------------------------------------------
create or replace function apply_stock_movement(
  p_product_id uuid,
  p_movement_type movement_type,
  p_qty_pieces_delta integer default 0,
  p_qty_kg_delta numeric default 0,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_product products;
  v_new_pieces integer;
  v_new_kg numeric(12, 3);
begin
  if p_movement_type in ('job_out', 'job_revert') then
    raise exception 'İş kaynaklı hareketler complete_job/revert_job_completion ile yapılır'
      using errcode = 'invalid_parameter_value';
  end if;

  if coalesce(p_qty_pieces_delta, 0) = 0 and coalesce(p_qty_kg_delta, 0) = 0 then
    raise exception 'En az bir birimde miktar girilmeli'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_product from products where id = p_product_id for update;

  if not found then
    raise exception 'Ürün bulunamadı: %', p_product_id
      using errcode = 'no_data_found';
  end if;

  v_new_pieces := v_product.qty_pieces + coalesce(p_qty_pieces_delta, 0);
  v_new_kg     := v_product.qty_kg + coalesce(p_qty_kg_delta, 0);

  if v_new_pieces < 0 or v_new_kg < 0 then
    raise exception 'Hareket stoğu eksiye düşürüyor: % adet / % kg', v_new_pieces, v_new_kg
      using errcode = 'check_violation';
  end if;

  update products
  set qty_pieces = v_new_pieces,
      qty_kg     = v_new_kg
  where id = p_product_id;

  insert into stock_movements (
    product_id, movement_type, qty_pieces_delta, qty_kg_delta, note
  )
  values (
    p_product_id, p_movement_type,
    coalesce(p_qty_pieces_delta, 0), coalesce(p_qty_kg_delta, 0), p_note
  );

  return jsonb_build_object(
    'product_id', p_product_id,
    'qty_pieces', v_new_pieces,
    'qty_kg', v_new_kg
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- add_job_product — işe malzeme ekle, alış fiyatını o anki hâliyle sabitle
-- -----------------------------------------------------------------------------
create or replace function add_job_product(
  p_job_id uuid,
  p_product_id uuid,
  p_qty_pieces integer default 0,
  p_qty_kg numeric default 0
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status job_status;
  v_price  numeric(12, 2);
  v_id     uuid;
begin
  select status into v_status from jobs where id = p_job_id;
  if not found then
    raise exception 'İş bulunamadı: %', p_job_id using errcode = 'no_data_found';
  end if;

  -- Tamamlanmış işin malzemesi değişirse stok düşümü ile kayıt tutarsız kalır
  if v_status = 'completed' then
    raise exception 'Tamamlanmış işe malzeme eklenemez; önce tamamlamayı geri alın'
      using errcode = 'invalid_parameter_value';
  end if;

  select purchase_price into v_price from products where id = p_product_id;
  if not found then
    raise exception 'Ürün bulunamadı: %', p_product_id using errcode = 'no_data_found';
  end if;

  insert into job_products (
    job_id, product_id, qty_pieces_used, qty_kg_used, unit_cost_snapshot
  )
  values (
    p_job_id, p_product_id,
    coalesce(p_qty_pieces, 0), coalesce(p_qty_kg, 0), v_price
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- public_job_by_token — QR ile açılan, giriş gerektirmeyen malzeme listesi
--
-- PRD 5.6: bu çıktı ticari bilgi İÇERMEMELİ. Alış fiyatı (purchase_price),
-- maliyet anlık görüntüsü (unit_cost_snapshot), kâr marjı ve müşteri kimliği
-- bilinçli olarak dışarıda bırakıldı — QR etiketi fotoğraflanabilir.
--
-- security definer: anon rolünün tablolara hiç erişimi yok, veri yalnızca
-- bu fonksiyonun döndürdüğü alanlar kadar görünür. search_path sabitlenmiş.
-- -----------------------------------------------------------------------------
create or replace function public_job_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'job_title', j.title,
    'completed_at', j.completed_at,
    'materials', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'name', p.name,
            'qty_pieces', jp.qty_pieces_used,
            'qty_kg', jp.qty_kg_used
          )
          order by p.name
        )
        from job_products jp
        join products p on p.id = jp.product_id
        where jp.job_id = j.id
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from qr_codes q
  join jobs j on j.id = q.job_id
  where q.token = p_token
    and j.status = 'completed';

  return v_result;  -- eşleşme yoksa null
end;
$$;

-- #############################################################################
-- # 0003_rls_policies.sql
-- # GUVENLIK: Row Level Security politikalari
-- #############################################################################

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

-- #############################################################################
-- # 0004_faz2_fatura_dashboard.sql
-- # FAZ 2: maliyet hesabi, dashboard, is akisi revizyonu
-- #############################################################################

-- =============================================================================
-- Faz 2: Fatura ve dashboard + iş akışı revizyonu
--
-- 1) Yeni iş doğrudan "devam ediyor" başlar (kullanıcı isteği): sahada işin
--    ayrıca "başlat" denmesi gereksiz bir adımdı. "Bekliyor" durumu
--    kaldırılmadı; iş sonradan beklemeye alınabiliyor.
-- 2) Maliyet hesabı: adet ve kilogram aynı birim fiyatla toplanıyordu
--    (geçici çözüm). Artık ürünün takip birimine göre hesaplanıyor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Yeni işler doğrudan "devam ediyor"
-- -----------------------------------------------------------------------------
alter table jobs alter column status set default 'in_progress';

-- -----------------------------------------------------------------------------
-- 2) Maliyet hesabı
--
-- products.purchase_price tek bir alan ama ürün hem adet hem kg ile
-- izlenebiliyor. Fiyatın hangi birime ait olduğu unit_type_default ile
-- belirleniyor:
--   piece -> fiyat adet başına
--   kg    -> fiyat kilogram başına
--   both  -> fiyat her iki birim için de geçerli sayılıyor (ikisi toplanır)
--
-- 'both' varsayımı matematiksel olarak zayıf; adet ve kg için farklı fiyat
-- gerekiyorsa products'a ayrı bir fiyat alanı eklenmeli. Şu an ürünlerin
-- büyük çoğunluğu tek birimle izlendiği için bu varsayımla ilerleniyor ve
-- arayüzde de belirtiliyor.
-- -----------------------------------------------------------------------------
create or replace function job_product_cost(
  p_unit_type unit_type,
  p_unit_cost numeric,
  p_qty_pieces integer,
  p_qty_kg numeric
)
returns numeric
language sql
immutable
as $$
  select case p_unit_type
    when 'piece' then p_unit_cost * p_qty_pieces
    when 'kg'    then p_unit_cost * p_qty_kg
    else              p_unit_cost * (p_qty_pieces + p_qty_kg)
  end;
$$;

-- İş başına toplam malzeme maliyeti
create or replace view job_costs as
select
  j.id as job_id,
  j.segment_id,
  coalesce(sum(
    job_product_cost(p.unit_type_default, jp.unit_cost_snapshot,
                     jp.qty_pieces_used, jp.qty_kg_used)
  ), 0)::numeric(14,2) as material_cost
from jobs j
left join job_products jp on jp.job_id = j.id
left join products p on p.id = jp.product_id
group by j.id, j.segment_id;

-- -----------------------------------------------------------------------------
-- 3) Dönemsel özet (dashboard)
--
-- Gelir faturalardan, maliyet tamamlanmış işlerin malzemelerinden geliyor.
-- Tamamlanmamış işlerin maliyeti sayılmıyor: malzemesi henüz stoktan
-- düşmediği için gerçekleşmiş bir gider değil.
-- -----------------------------------------------------------------------------
create or replace function dashboard_summary(
  p_start date,
  p_end date
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with gelir as (
    select
      coalesce(sum(gross_amount), 0)::numeric(14,2) as brut,
      coalesce(sum(net_amount), 0)::numeric(14,2)   as net,
      coalesce(sum(tax_amount), 0)::numeric(14,2)   as vergi,
      count(*)                                       as fatura_sayisi
    from invoices
    where issue_date between p_start and p_end
  ),
  maliyet as (
    select coalesce(sum(jc.material_cost), 0)::numeric(14,2) as toplam
    from jobs j
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed'
      and j.completed_at::date between p_start and p_end
  ),
  isler as (
    select
      count(*) filter (where status = 'completed'
                         and completed_at::date between p_start and p_end) as tamamlanan,
      count(*) filter (where status <> 'completed')                        as acik
    from jobs
  )
  select jsonb_build_object(
    'baslangic', p_start,
    'bitis', p_end,
    'brut_gelir', gelir.brut,
    'net_gelir', gelir.net,
    'vergi', gelir.vergi,
    'fatura_sayisi', gelir.fatura_sayisi,
    'malzeme_maliyeti', maliyet.toplam,
    'kar_zarar', (gelir.net - maliyet.toplam)::numeric(14,2),
    'tamamlanan_is', isler.tamamlanan,
    'acik_is', isler.acik
  )
  from gelir, maliyet, isler;
$$;

-- -----------------------------------------------------------------------------
-- 4) Müşteri bazlı kırılım (dashboard)
-- -----------------------------------------------------------------------------
create or replace function dashboard_by_customer(
  p_start date,
  p_end date
)
returns table (
  customer_id uuid,
  customer_name text,
  net_gelir numeric,
  malzeme_maliyeti numeric,
  kar_zarar numeric,
  tamamlanan_is bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with gelir as (
    select customer_id, sum(net_amount) as net
    from invoices
    where issue_date between p_start and p_end
    group by customer_id
  ),
  maliyet as (
    select s.customer_id, sum(jc.material_cost) as tutar, count(*) as is_sayisi
    from jobs j
    join segments s on s.id = j.segment_id
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed'
      and j.completed_at::date between p_start and p_end
    group by s.customer_id
  )
  select
    c.id,
    c.name,
    coalesce(g.net, 0)::numeric(14,2),
    coalesce(m.tutar, 0)::numeric(14,2),
    (coalesce(g.net, 0) - coalesce(m.tutar, 0))::numeric(14,2),
    coalesce(m.is_sayisi, 0)
  from customers c
  left join gelir g on g.customer_id = c.id
  left join maliyet m on m.customer_id = c.id
  where g.net is not null or m.tutar is not null
  order by (coalesce(g.net, 0) - coalesce(m.tutar, 0)) desc;
$$;

-- -----------------------------------------------------------------------------
-- 5) Yetkiler
--
-- View'ler security_invoker ile çalışıyor: sorgu, çağıran kullanıcının
-- yetkisiyle ve dolayısıyla RLS politikalarıyla değerlendiriliyor.
-- Bu olmadan view sahibinin yetkisiyle çalışır ve RLS baypas edilir.
-- -----------------------------------------------------------------------------
alter view job_costs set (security_invoker = on);

revoke all on function dashboard_summary(date, date) from public;
revoke all on function dashboard_by_customer(date, date) from public;
revoke all on function job_product_cost(unit_type, numeric, integer, numeric) from public;

grant execute on function dashboard_summary(date, date) to authenticated;
grant execute on function dashboard_by_customer(date, date) to authenticated;
grant execute on function job_product_cost(unit_type, numeric, integer, numeric) to authenticated;
grant select on job_costs to authenticated;

-- =============================================================================
-- Kurulum tamamlandı. Doğrulama sorgusu:
-- =============================================================================
select
  (select count(*) from information_schema.tables
     where table_schema = 'public'
       and table_name in ('customers','segments','jobs','products',
                          'job_products','stock_movements','invoices',
                          'qr_codes','pdf_exports')) as tablo_beklenen_9,
  (select count(*) from information_schema.routines
     where routine_schema = 'public'
       and routine_name in ('complete_job','revert_job_completion',
                            'apply_stock_movement','add_job_product',
                            'public_job_by_token','dashboard_summary',
                            'dashboard_by_customer','job_product_cost'))
    as fonksiyon_beklenen_8,
  (select count(*) from pg_policies where schemaname = 'public')
    as politika_beklenen_10,
  (select count(*) from information_schema.views
     where table_schema = 'public' and table_name = 'job_costs')
    as view_beklenen_1;
