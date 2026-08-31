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
