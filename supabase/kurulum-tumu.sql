-- =============================================================================
-- Altınöz Bobinaj — Yönetim Paneli, tüm kurulum SQL'i
--
-- Bu dosya supabase/migrations/ altındaki dosyaların SIRAYLA birleştirilmiş
-- hâlidir. Supabase panelinde SQL Editor'e tek seferde yapıştırıp
-- çalıştırabilirsiniz.
--
-- Tekrar çalıştırmak güvenlidir: yerel Postgres'te üç kez üst üste
-- çalıştırılıp doğrulandı (0 hata) ve sonrasında 64 SQL testi geçiyor.
--
-- Buna dikkat: 0008 gram dönüşümü enum'dan 'kg' değerini ve qty_kg
-- kolonlarını kaldırıyor. Bu yüzden 0004/0005/0006'daki eski tanımlar
-- kolon/imza varlığına bağlı çalışıyor — yoksa ikinci koşuda
-- "invalid input value for enum" ve "column does not exist" hataları
-- veriyorlardı. Yeni migration eklerken supabase/README.md içindeki
-- "Kurulum dosyası tekrar çalıştırılabilir mi?" kontrolünü yapın.
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
  /* Enum degeri text'e cevrilip karsilastiriliyor. Sebebi: 0008 unit_type'tan
     'kg' ve 'both' degerlerini kaldiriyor; kurulum SQL'i bastan tekrar
     calistirildiginda bu govde "invalid input value for enum unit_type: kg"
     hatasi veriyordu. Text karsilastirmasi enum'un her iki surumunde de
     gecerli. Bu fonksiyon zaten 0008 tarafindan yeniden tanimlaniyor. */
  select case
    when p_unit_type::text = 'piece' then p_unit_cost * p_qty_pieces
    when p_unit_type::text = 'kg'    then p_unit_cost * p_qty_kg
    else p_unit_cost * (p_qty_pieces + p_qty_kg)
  end;
$$;

/* Gorunum qty_kg_used kolonuna bagli; 0008 o kolonu qty_grams_used yapiyor.
   Gorunum govdesi olusturulurken dogrulandigi icin kurulum SQL'i bastan
   tekrar calistirildiginda "column jp.qty_kg_used does not exist" hatasi
   veriyordu. Kolon hala varsa olusturuluyor; yoksa 0008 kendi surumunu
   asagida zaten olusturuyor. */
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_products'
      and column_name = 'qty_kg_used'
  ) then
    execute $gorunum$
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
    $gorunum$;
  else
    raise notice 'job_costs 0008 surumuyle olusturulacak, eski surum atlandi.';
  end if;
end $$;

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

grant execute on function dashboard_summary(date, date) to authenticated;
grant execute on function dashboard_by_customer(date, date) to authenticated;
/* 0008 bu imzayi dusurup integer'li yenisini olusturuyor. Kurulum SQL'i
   tekrar calistirildiginda imza mevcut olmadigi icin yetki satirlari
   "function does not exist" hatasi veriyordu. */
do $$
begin
  revoke all on function job_product_cost(unit_type, numeric, integer, numeric) from public;
  grant execute on function job_product_cost(unit_type, numeric, integer, numeric) to authenticated;
exception
  when undefined_function then
    raise notice 'job_product_cost eski imzasi yok (0008 uygulanmis), yetki adimi atlandi.';
end $$;
grant select on job_costs to authenticated;

-- #############################################################################
-- # 0005_faz5_periyodik_ozet.sql
-- # FAZ 5: aylik ozet, pg_cron, stok mutabakati
-- #############################################################################

-- =============================================================================
-- Faz 5: Periyodik özetleme ve stok mutabakatı
--
-- PRD Bölüm 6: "sürekli açık backend" ihtiyacı pg_cron ile karşılanıyor.
-- Ayrı bir sunucu gerekmiyor; işler veritabanının içinde çalışıyor.
--
-- Bu dosya pg_cron olmadan da uygulanabilir: uzantı yoksa zamanlama
-- kısmı atlanıyor, fonksiyonlar yine elle çağrılabiliyor. Supabase'de
-- pg_cron'u Database → Extensions bölümünden açmak gerekiyor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Aylık özet tablosu
--
-- Dashboard sorgusu her açılışta faturaları ve iş maliyetlerini yeniden
-- topluyor. Veri büyüdükçe bu yavaşlar; kapanmış aylar için sonuç zaten
-- değişmiyor. Gecelik iş bunları önceden hesaplayıp saklıyor.
-- -----------------------------------------------------------------------------
create table if not exists monthly_summaries (
  donem            date primary key,   -- ayın ilk günü
  brut_gelir       numeric(14,2) not null default 0,
  net_gelir        numeric(14,2) not null default 0,
  vergi            numeric(14,2) not null default 0,
  fatura_sayisi    integer not null default 0,
  malzeme_maliyeti numeric(14,2) not null default 0,
  kar_zarar        numeric(14,2) not null default 0,
  tamamlanan_is    integer not null default 0,
  hesaplanma       timestamptz not null default now()
);

alter table monthly_summaries enable row level security;

drop policy if exists monthly_summaries_staff_select on monthly_summaries;
create policy monthly_summaries_staff_select
  on monthly_summaries for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- 2) Bir ayı hesaplayıp yazan fonksiyon
--
-- security definer: pg_cron işi postgres rolüyle çalışıyor ve RLS'e
-- takılmamalı. Fonksiyon yalnızca toplu sayı üretiyor, satır döndürmüyor.
-- -----------------------------------------------------------------------------
create or replace function refresh_monthly_summary(p_donem date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bas date := date_trunc('month', p_donem)::date;
  v_bit date := (date_trunc('month', p_donem) + interval '1 month - 1 day')::date;
  v_ozet jsonb;
begin
  select jsonb_build_object(
    'brut', coalesce(sum(gross_amount), 0),
    'net', coalesce(sum(net_amount), 0),
    'vergi', coalesce(sum(tax_amount), 0),
    'adet', count(*)
  )
  into v_ozet
  from invoices
  where issue_date between v_bas and v_bit;

  insert into monthly_summaries as ms (
    donem, brut_gelir, net_gelir, vergi, fatura_sayisi,
    malzeme_maliyeti, kar_zarar, tamamlanan_is, hesaplanma
  )
  select
    v_bas,
    (v_ozet->>'brut')::numeric,
    (v_ozet->>'net')::numeric,
    (v_ozet->>'vergi')::numeric,
    (v_ozet->>'adet')::integer,
    coalesce(m.maliyet, 0),
    ((v_ozet->>'net')::numeric - coalesce(m.maliyet, 0)),
    coalesce(m.is_sayisi, 0),
    now()
  from (
    select
      coalesce(sum(jc.material_cost), 0) as maliyet,
      count(*) as is_sayisi
    from jobs j
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed'
      and j.completed_at::date between v_bas and v_bit
  ) m
  on conflict (donem) do update set
    brut_gelir       = excluded.brut_gelir,
    net_gelir        = excluded.net_gelir,
    vergi            = excluded.vergi,
    fatura_sayisi    = excluded.fatura_sayisi,
    malzeme_maliyeti = excluded.malzeme_maliyeti,
    kar_zarar        = excluded.kar_zarar,
    tamamlanan_is    = excluded.tamamlanan_is,
    hesaplanma       = excluded.hesaplanma;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Gecelik iş: içinde bulunulan ve bir önceki ayı tazele
--
-- Yalnızca son iki ay hesaplanıyor: daha eski aylar değişmiyor, hepsini
-- her gece yeniden hesaplamak gereksiz yük.
-- -----------------------------------------------------------------------------
create or replace function nightly_summary_refresh()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform refresh_monthly_summary(current_date);
  perform refresh_monthly_summary((current_date - interval '1 month')::date);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Stok tutarlılık kontrolü
--
-- products.qty_* alanları hızlı okuma için tutuluyor; doğru kaynak
-- stock_movements. İkisi ayrışırsa (elle UPDATE, yarım kalan işlem)
-- maliyet ve stok raporları sessizce yanlış olur. Bu fonksiyon farkı
-- listeliyor — otomatik düzeltmiyor, çünkü hangisinin doğru olduğu
-- duruma göre değişir ve sessiz düzeltme sorunun kaynağını gizler.
-- -----------------------------------------------------------------------------
/* Bu surum products.qty_kg kolonuna bagli ve donus tipi 0008'de degisiyor
   (birim kolonu eklendi). Iki ayri sorun cikariyordu:
     - `create or replace` donus tipini degistiremiyor
     - govde `language sql` oldugu icin olusturulurken dogrulaniyor, kolon
       yeniden adlandirilmissa hata veriyor
   Bu yuzden tumu kolon varligina bagli. 0008 uygulanmissa atlaniyor ve
   asagida 0008 kendi surumunu olusturuyor. Drop da blogun icinde: disarida
   olsa, calisan surumu dusurup yerine yenisini koyamiyordu. */
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name = 'qty_kg'
  ) then
    drop function if exists stock_reconciliation();
    execute $fn$
      create function stock_reconciliation()
      returns table (
        product_id uuid,
        product_name text,
        kayitli_adet integer,
        hareketlerden_adet bigint,
        kayitli_kg numeric,
        hareketlerden_kg numeric
      )
      language sql
      stable
      security invoker
      set search_path = public, pg_temp
      as $body$
        select
          p.id,
          p.name,
          p.qty_pieces,
          coalesce(sum(sm.qty_pieces_delta), 0),
          p.qty_kg,
          coalesce(sum(sm.qty_kg_delta), 0)::numeric(12,3)
        from products p
        left join stock_movements sm on sm.product_id = p.id
        group by p.id, p.name, p.qty_pieces, p.qty_kg
        having p.qty_pieces <> coalesce(sum(sm.qty_pieces_delta), 0)
            or p.qty_kg <> coalesce(sum(sm.qty_kg_delta), 0)::numeric(12,3);
      $body$;
    $fn$;
  else
    raise notice 'stock_reconciliation 0008 surumuyle olusturulacak, eski surum atlandi.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4b) Açılış stoğu için otomatik hareket kaydı
--
-- products.qty_* alanları doğrudan INSERT ile doldurulabiliyordu ve bu,
-- stock_movements ile kalıcı bir fark bırakıyordu: stok mutabakatı her
-- zaman "tutarsız" gösteriyordu. Uygulama ürünü 0 stokla açıp girişi
-- apply_stock_movement ile yapıyor, ama şema bunu garanti etmiyordu.
--
-- Trigger, sıfırdan farklı bir açılış stoğuyla oluşturulan üründe
-- karşılık gelen 'purchase_in' hareketini kendisi yazıyor. Böylece
-- denetim izi hangi yoldan girilirse girilsin eksiksiz kalıyor.
-- -----------------------------------------------------------------------------
create or replace function record_opening_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.qty_pieces, 0) <> 0 or coalesce(new.qty_kg, 0) <> 0 then
    insert into stock_movements (
      product_id, movement_type, qty_pieces_delta, qty_kg_delta, note
    )
    values (
      new.id, 'purchase_in',
      coalesce(new.qty_pieces, 0), coalesce(new.qty_kg, 0),
      'Açılış stoğu'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists products_opening_stock on products;
create trigger products_opening_stock
  after insert on products
  for each row execute function record_opening_stock();

-- -----------------------------------------------------------------------------
-- 5) Yetkiler
-- -----------------------------------------------------------------------------
revoke all on function refresh_monthly_summary(date) from public;
revoke all on function nightly_summary_refresh() from public;
revoke all on function stock_reconciliation() from public;

grant execute on function refresh_monthly_summary(date) to authenticated;
grant execute on function stock_reconciliation() to authenticated;
grant select on monthly_summaries to authenticated;

-- -----------------------------------------------------------------------------
-- 6) Zamanlama (pg_cron varsa)
--
-- Supabase'de pg_cron: Database → Extensions → pg_cron etkinleştirilmeli.
-- Uzantı yoksa bu blok sessizce atlanıyor ve migration hata vermiyor;
-- fonksiyonlar elle veya bir Vercel Cron ucundan da çağrılabilir.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Aynı isimli iş varsa önce kaldır (migration tekrar çalıştırılabilir olmalı)
    perform cron.unschedule('altinoz-gecelik-ozet')
    where exists (
      select 1 from cron.job where jobname = 'altinoz-gecelik-ozet'
    );

    -- Her gece 02:15 UTC (Türkiye saatiyle 05:15) — mesai dışı
    perform cron.schedule(
      'altinoz-gecelik-ozet',
      '15 2 * * *',
      $cron$ select nightly_summary_refresh(); $cron$
    );

    raise notice 'pg_cron isi kuruldu: altinoz-gecelik-ozet (her gece 02:15 UTC)';
  else
    raise notice 'pg_cron uzantisi yok; gecelik ozet zamanlanmadi. Supabase panelinde Database -> Extensions -> pg_cron etkinlestirilebilir.';
  end if;
end $$;

-- İlk değerleri hemen üret ki tablo boş kalmasın
select refresh_monthly_summary(current_date);
select refresh_monthly_summary((current_date - interval '1 month')::date);

-- #############################################################################
-- # 0006_fonksiyon_yetki_duzeltmesi.sql
-- # GUVENLIK DUZELTMESI: anon fonksiyon yetkileri
-- #############################################################################

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

-- #############################################################################
-- # 0007_fatura_dosyasi.sql
-- # FATURA: PDF yukleme, storage, segment eslesmesi, aylik trend
-- #############################################################################

-- =============================================================================
-- Fatura dosyası yükleme ve otomatik okuma
--
-- Faturalar artık elle girilmiyor: kullanıcı e-Fatura PDF'ini segmente
-- yüklüyor, sistem tutarları PDF'in metin katmanından okuyup kaydediyor.
--
-- Neden segment altında? Müşteri bir ziyarette birden fazla iş bırakıyor
-- (segment) ve bunların tamamına tek fatura kesiliyor. Fatura bu yüzden
-- işin değil segmentin karşılığı.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) invoices tablosuna dosya ve okuma alanları
-- -----------------------------------------------------------------------------
alter table invoices
  add column if not exists file_path text,
  add column if not exists ettn text,
  add column if not exists supplier_name text,
  add column if not exists parsed_at timestamptz;

comment on column invoices.file_path is
  'Supabase Storage yolu (faturalar bucket''i). Dosya silinirse kayıt kalır.';
comment on column invoices.ettn is
  'e-Fatura ETTN''i — GİB tarafından üretilen benzersiz belge kimliği. '
  'Aynı faturanın iki kez yüklenmesini engellemek için kullanılıyor.';
comment on column invoices.supplier_name is
  'PDF''ten okunan alıcı ünvanı. Doğrulama/karşılaştırma için saklanıyor; '
  'faturanın hangi müşteriye ait olduğu customer_id ile belirlenir.';

/* ETTN benzersiz: aynı fatura iki kez yüklenirse ikincisi reddedilir.
   Elle girilen faturalarda ETTN olmayacağı için kısmi indeks. */
create unique index if not exists invoices_ettn_key
  on invoices (ettn) where ettn is not null;

create index if not exists invoices_segment_idx
  on invoices (segment_id) where segment_id is not null;

-- -----------------------------------------------------------------------------
-- 2) Fatura dosyaları için Storage bucket'ı
--
-- public = false: dosyalara yalnızca imzalı bağlantıyla erişilir. Fatura
-- ticari belge; tahmin edilebilir bir URL ile açık olmamalı.
-- -----------------------------------------------------------------------------
/* storage şeması yalnızca Supabase'de var; yerel Postgres testlerinde
   bu blok atlanıyor ve migration hata vermiyor. */
do $$
begin
  if to_regnamespace('storage') is not null
     and exists (select 1 from pg_class where relname = 'buckets'
                 and relnamespace = to_regnamespace('storage')) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('faturalar', 'faturalar', false, 10485760, array['application/pdf'])
    on conflict (id) do update set
      public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf'];
  else
    raise notice 'storage semasi yok; faturalar bucket''i olusturulmadi (yerel test ortami)';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3) Storage politikaları — yalnızca personel
--
-- anon rolü hiçbir işlem yapamaz. Silme yetkisi de veriliyor: yanlış
-- yüklenen fatura dosyasıyla birlikte kaldırılabilmeli.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regnamespace('storage') is not null
     and exists (select 1 from pg_class where relname = 'objects'
                 and relnamespace = to_regnamespace('storage')) then

    drop policy if exists faturalar_staff_select on storage.objects;
    create policy faturalar_staff_select on storage.objects
      for select to authenticated
      using (bucket_id = 'faturalar');

    drop policy if exists faturalar_staff_insert on storage.objects;
    create policy faturalar_staff_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'faturalar');

    drop policy if exists faturalar_staff_delete on storage.objects;
    create policy faturalar_staff_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'faturalar');

    raise notice 'Fatura depolama politikalari olusturuldu (3 adet).';
  end if;
exception
  when insufficient_privilege then
    /* Bazi Supabase projelerinde SQL Editor'un rolu storage.objects'in
       sahibi degil. Bu blogun basarisizligi butun kurulumu dusurmemeli:
       kalan tablolar/gorunumler dogru kurulsun, eksik olan tek sey
       raporlansin. Bucket olusur ama POLICIES sutunu 0 kalir ve fatura
       yukleme reddedilir. */
    raise notice '';
    raise notice 'UYARI: storage.objects uzerinde politika olusturulamadi (yetki yok).';
    raise notice 'Fatura yukleme calismayacak. Duzeltmek icin:';
    raise notice '  supabase/depolama-izinleri.sql dosyasini SQL Editor de calistirin.';
end $$;

-- -----------------------------------------------------------------------------
-- 4) Segment bazlı fatura özeti
--
-- Segment sayfası faturaları ve toplamlarını tek sorguda okuyor.
-- -----------------------------------------------------------------------------
create or replace view segment_invoice_totals as
select
  s.id as segment_id,
  count(i.id) as fatura_sayisi,
  coalesce(sum(i.gross_amount), 0)::numeric(14,2) as brut_toplam,
  coalesce(sum(i.net_amount), 0)::numeric(14,2)   as net_toplam,
  coalesce(sum(i.tax_amount), 0)::numeric(14,2)   as vergi_toplam
from segments s
left join invoices i on i.segment_id = s.id
group by s.id;

alter view segment_invoice_totals set (security_invoker = on);
grant select on segment_invoice_totals to authenticated;
revoke all on segment_invoice_totals from anon;

-- -----------------------------------------------------------------------------
-- 5) Aylık gelir/gider trendi — raporlar sayfasındaki grafik için
--
-- monthly_summaries yalnızca hesaplanmış ayları içeriyor. Grafik son 12 ayı
-- kesintisiz göstermeli, veri olmayan aylar sıfır olarak dönmeli; yoksa
-- grafikte boşluk kalıyor ve trend yanlış okunuyor.
-- -----------------------------------------------------------------------------
create or replace function monthly_trend(p_ay_sayisi integer default 12)
returns table (
  donem date,
  net_gelir numeric,
  malzeme_maliyeti numeric,
  kar_zarar numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with aylar as (
    select generate_series(
      date_trunc('month', current_date) - ((greatest(p_ay_sayisi, 1) - 1) || ' months')::interval,
      date_trunc('month', current_date),
      '1 month'
    )::date as donem
  ),
  gelir as (
    select date_trunc('month', issue_date)::date as ay,
           sum(net_amount) as net
    from invoices
    group by 1
  ),
  maliyet as (
    select date_trunc('month', j.completed_at)::date as ay,
           sum(jc.material_cost) as tutar
    from jobs j
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed' and j.completed_at is not null
    group by 1
  )
  select
    a.donem,
    coalesce(g.net, 0)::numeric(14,2),
    coalesce(m.tutar, 0)::numeric(14,2),
    (coalesce(g.net, 0) - coalesce(m.tutar, 0))::numeric(14,2)
  from aylar a
  left join gelir g on g.ay = a.donem
  left join maliyet m on m.ay = a.donem
  order by a.donem;
$$;

revoke all on function monthly_trend(integer) from anon, public;
grant execute on function monthly_trend(integer) to authenticated;

-- =============================================================================
-- Kurulum tamamlandı. Doğrulama sorgusu:
-- =============================================================================
select
  (select count(*) from information_schema.tables
     where table_schema = 'public'
       and table_name in ('customers','segments','jobs','products',
                          'job_products','stock_movements','invoices',
                          'qr_codes','pdf_exports','monthly_summaries'))
    as tablo_beklenen_10,
  (select count(*) from information_schema.routines
     where routine_schema = 'public'
       and routine_name in ('complete_job','revert_job_completion',
                            'apply_stock_movement','add_job_product',
                            'public_job_by_token','dashboard_summary',
                            'dashboard_by_customer','job_product_cost',
                            'refresh_monthly_summary','nightly_summary_refresh',
                            'stock_reconciliation','record_opening_stock',
                            'monthly_trend'))
    as fonksiyon_beklenen_13,
  (select count(*) from information_schema.views
     where table_schema = 'public'
       and table_name in ('job_costs','segment_invoice_totals'))
    as view_beklenen_2,
  -- anon'a acik kalan proje fonksiyonu SIFIR olmali (public_job_by_token haric)
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.proname <> 'public_job_by_token'
     and p.oid not in (select d.objid from pg_depend d
                       join pg_extension e on e.oid = d.refobjid
                       where d.deptype = 'e'))
    as anon_acik_beklenen_0,
  -- fatura bucket'i olustu mu (Supabase'de 1, yerel testte 0)
  (select count(*) from pg_class c
     where c.relname = 'buckets' and c.relnamespace = to_regnamespace('storage'))
    as storage_var_mi;

-- #############################################################################
-- # 0008_gram_birimi.sql
-- # KILOGRAM -> GRAM: tek birim, tam sayi miktar
-- #############################################################################

-- =============================================================================
-- Kilogram → gram, ve ürün başına TEK birim
--
-- Neden?
--   Formlarda "Adet" ve "Kilogram" alanları yan yana duruyordu. Panel
--   atölyede, ayaktayken, aceleyle kullanılıyor; iki miktar alanını aynı
--   anda görmek hangisinin doldurulacağı konusunda tereddüt yaratıyor ve
--   yanlış alana yazma riski taşıyor. Artık her ürünün tek bir birimi var
--   ve formda tek bir miktar alanı görünüyor.
--
--   Kilogram ondalıklıydı (numeric(12,3)); ondalık girişin kendisi de bir
--   hata kaynağıydı. Gram tam sayı olduğu için miktar artık tıpkı adet
--   gibi davranıyor: virgül yok, yuvarlama yok.
--
-- Fiyat neden hâlâ kilogram başına?
--   Bakır tel kiloyla alınıyor ve purchase_price iki ondalıklı. Gram başına
--   fiyat (0,15 ₺) hem alışkanlığa ters hem hassasiyet kaybettirir. Bu
--   yüzden gram izlenen üründe fiyat ₺/kg olarak giriliyor ve maliyet
--   `fiyat * gram / 1000` ile hesaplanıyor. Arayüzde alan etiketi ürünün
--   birimine göre "₺ / kg" ya da "₺ / adet" yazıyor.
--
-- Veri kaybı yok: mevcut kilogram değerleri 1000 ile çarpılarak grama
-- çevriliyor. numeric(12,3) × 1000 tam sayıdır, yuvarlama olmaz.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Birim tipi: 'kg' → 'gram', 'both' kaldırılıyor
--
-- Enum'a değer eklemek/çıkarmak tek işlem içinde yapılamadığı için yeni tip
-- oluşturulup takas ediliyor.
--
-- 'both' olan ürünler tek birime indirilmeli. Karar ürünün geçmişine
-- bakılarak veriliyor: kilogram tarafında herhangi bir stok ya da kullanım
-- varsa 'gram', yoksa 'piece'. Böyle bir ürünün hem adet hem kilogram
-- geçmişi varsa gram seçiliyor; adet bakiyesi kolonunda duruyor, kaybolmuyor.
-- -----------------------------------------------------------------------------
/* Tümü tek bir korumalı blokta: kurulum SQL'i baştan çalıştırılabilir
   olmalı, dönüşüm ikinci kez çalışınca hata vermemeli. Ölçüt basit —
   products.qty_kg kolonu hâlâ duruyorsa dönüşüm yapılmamış demektir. */
do $$
declare v_both integer;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name = 'qty_kg'
  ) then
    raise notice 'Gram donusumu zaten yapilmis, atlandi.';
    return;
  end if;

  -- 1) Birim tipi: 'kg' -> 'gram', 'both' kaldiriliyor
  create type unit_kind as enum ('piece', 'gram');

  -- Karar önceden hesaplanıyor: ALTER ... USING içinde alt sorgu kullanılamaz.
  alter table products add column _birim_gecici text;

  select count(*) into v_both from products
  where unit_type_default::text = 'both';

  update products p set _birim_gecici = case
    when p.unit_type_default::text = 'kg'    then 'gram'
    when p.unit_type_default::text = 'piece' then 'piece'
    else case
      when p.qty_kg <> 0
        or exists (select 1 from job_products jp
                   where jp.product_id = p.id and jp.qty_kg_used <> 0)
        or exists (select 1 from stock_movements sm
                   where sm.product_id = p.id and sm.qty_kg_delta <> 0)
      then 'gram' else 'piece'
    end
  end;

  if v_both > 0 then
    raise notice '% adet "her ikisi" birimli urun tek birime indirildi.', v_both;
  end if;

  /* job_product_cost imzasinda unit_type gectigi icin once kaldirilmali;
     job_costs gorunumu de ona bagli. Ikisi de asagida yeniden olusturuluyor. */
  drop view if exists job_costs;
  drop function if exists job_product_cost(unit_type, numeric, integer, numeric);

  alter table products
    alter column unit_type_default drop default,
    alter column unit_type_default type unit_kind using _birim_gecici::unit_kind,
    alter column unit_type_default set default 'piece';

  alter table products drop column _birim_gecici;

  drop type unit_type;
  alter type unit_kind rename to unit_type;

  -- 2) Miktar kolonlari: kilogram (ondalik) -> gram (tam sayi)
  --
  -- integer ust siniri ~2,1 milyar gram = 2.100 ton; atolye olcegi icin
  -- fazlasiyla yeterli ve tam sayi oldugu icin yuvarlama hatasi olmaz.
  alter table products
    alter column qty_kg drop default,
    alter column qty_kg type integer using round(qty_kg * 1000)::integer,
    alter column qty_kg set default 0;
  alter table products rename column qty_kg to qty_grams;

  alter table job_products
    alter column qty_kg_used drop default,
    alter column qty_kg_used type integer using round(qty_kg_used * 1000)::integer,
    alter column qty_kg_used set default 0;
  alter table job_products rename column qty_kg_used to qty_grams_used;

  alter table stock_movements
    alter column qty_kg_delta drop default,
    alter column qty_kg_delta type integer using round(qty_kg_delta * 1000)::integer,
    alter column qty_kg_delta set default 0;
  alter table stock_movements rename column qty_kg_delta to qty_grams_delta;

  raise notice 'Kilogram degerleri grama cevrildi (x1000).';
end $$;

comment on column products.qty_grams is
  'Gram cinsinden stok. Tam sayi: ondalik giris yok. Urunun birimi piece ise '
  'bu kolon kullanilmaz.';
comment on column products.purchase_price is
  'Birim alis fiyati. unit_type_default=piece ise TL/adet, gram ise '
  'TL/kilogram (gram basina fiyat hassasiyeti yetersiz kaliyor).';

-- -----------------------------------------------------------------------------
-- 3) Malzeme maliyeti
--
-- Gram izlenen üründe fiyat kilogram başına olduğu için 1000'e bölünüyor.
-- -----------------------------------------------------------------------------
/* Tekrar kosularda 0004 eski (numeric'li) imzayi yeniden olusturuyor;
   yukaridaki korumali blok atlandigi icin oradaki drop calismiyor. Burada
   kosulsuz kaldiriliyor ki semada olu bir asiri yukleme kalmasin.
   Gorunum once dusuruluyor: eski imzaya bagimli. */
drop view if exists job_costs;
drop function if exists job_product_cost(unit_type, numeric, integer, numeric);

create or replace function job_product_cost(
  p_unit_type unit_type,
  p_unit_cost numeric,
  p_qty_pieces integer,
  p_qty_grams integer
)
returns numeric
language sql
immutable
as $$
  select case p_unit_type
    when 'piece' then p_unit_cost * p_qty_pieces
    else              p_unit_cost * p_qty_grams / 1000.0
  end;
$$;

create or replace view job_costs as
select
  j.id as job_id,
  j.segment_id,
  coalesce(sum(
    job_product_cost(p.unit_type_default, jp.unit_cost_snapshot,
                     jp.qty_pieces_used, jp.qty_grams_used)
  ), 0)::numeric(14,2) as material_cost
from jobs j
left join job_products jp on jp.job_id = j.id
left join products p on p.id = jp.product_id
group by j.id, j.segment_id;

alter view job_costs set (security_invoker = on);

-- -----------------------------------------------------------------------------
-- 4) Stok hareketi — tek miktar parametresi
--
-- Çağıran hangi birime yazacağını bilmek zorunda değil: ürünün birimi
-- neyse oraya yazılıyor. Yanlış alana miktar girme ihtimali böylece
-- şema düzeyinde ortadan kalkıyor.
-- -----------------------------------------------------------------------------
drop function if exists apply_stock_movement(uuid, movement_type, integer, numeric, text);

create or replace function apply_stock_movement(
  p_product_id uuid,
  p_movement_type movement_type,
  p_miktar integer,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_product   products;
  v_adet      integer := 0;
  v_gram      integer := 0;
  v_yeni      integer;
  v_birim_adi text;
begin
  if p_movement_type in ('job_out', 'job_revert') then
    raise exception 'İş kaynaklı hareketler complete_job/revert_job_completion ile yapılır'
      using errcode = 'invalid_parameter_value';
  end if;

  if coalesce(p_miktar, 0) = 0 then
    raise exception 'Miktar girilmeli' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_product from products where id = p_product_id for update;

  if not found then
    raise exception 'Ürün bulunamadı: %', p_product_id
      using errcode = 'no_data_found';
  end if;

  if v_product.unit_type_default = 'piece' then
    v_adet      := p_miktar;
    v_yeni      := v_product.qty_pieces + p_miktar;
    v_birim_adi := 'adet';
  else
    v_gram      := p_miktar;
    v_yeni      := v_product.qty_grams + p_miktar;
    v_birim_adi := 'gram';
  end if;

  if v_yeni < 0 then
    raise exception 'Hareket stoğu eksiye düşürüyor: % %', v_yeni, v_birim_adi
      using errcode = 'check_violation';
  end if;

  update products
  set qty_pieces = case when v_product.unit_type_default = 'piece'
                        then v_yeni else qty_pieces end,
      qty_grams  = case when v_product.unit_type_default = 'piece'
                        then qty_grams else v_yeni end
  where id = p_product_id;

  insert into stock_movements (
    product_id, movement_type, qty_pieces_delta, qty_grams_delta, note
  )
  values (p_product_id, p_movement_type, v_adet, v_gram, p_note);

  return jsonb_build_object(
    'product_id', p_product_id,
    'birim',      v_birim_adi,
    'miktar',     v_yeni
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) İşe malzeme ekleme — tek miktar parametresi
-- -----------------------------------------------------------------------------
drop function if exists add_job_product(uuid, uuid, integer, numeric);

create or replace function add_job_product(
  p_job_id uuid,
  p_product_id uuid,
  p_miktar integer
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status  job_status;
  v_product products;
  v_id      uuid;
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

  if coalesce(p_miktar, 0) <= 0 then
    raise exception 'Miktar sıfırdan büyük olmalı'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_product from products where id = p_product_id;
  if not found then
    raise exception 'Ürün bulunamadı: %', p_product_id using errcode = 'no_data_found';
  end if;

  insert into job_products (
    job_id, product_id, qty_pieces_used, qty_grams_used, unit_cost_snapshot
  )
  values (
    p_job_id, p_product_id,
    case when v_product.unit_type_default = 'piece' then p_miktar else 0 end,
    case when v_product.unit_type_default = 'piece' then 0 else p_miktar end,
    v_product.purchase_price
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) Tamamlama ve geri alma — gram kolonuna geçiş
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
  v_job        jobs;
  v_line       record;
  v_new_pieces integer;
  v_new_grams  integer;
  v_token      text;
  v_line_count integer := 0;
begin
  -- İşi kilitle: aynı işin iki kez tamamlanmasını engeller
  select * into v_job from jobs where id = p_job_id for update;

  if not found then
    raise exception 'İş bulunamadı: %', p_job_id using errcode = 'no_data_found';
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
           jp.qty_grams_used,
           p.name       as product_name,
           p.qty_pieces as stock_pieces,
           p.qty_grams  as stock_grams
    from job_products jp
    join products p on p.id = jp.product_id
    where jp.job_id = p_job_id
    order by jp.product_id
    for update of p
  loop
    v_line_count := v_line_count + 1;
    v_new_pieces := v_line.stock_pieces - v_line.qty_pieces_used;
    v_new_grams  := v_line.stock_grams  - v_line.qty_grams_used;

    if not p_allow_negative and (v_new_pieces < 0 or v_new_grams < 0) then
      raise exception
        'Stok yetersiz: % (mevcut: % adet / % gram, gereken: % adet / % gram)',
        v_line.product_name,
        v_line.stock_pieces, v_line.stock_grams,
        v_line.qty_pieces_used, v_line.qty_grams_used
        using errcode = 'check_violation';
    end if;

    update products
    set qty_pieces = v_new_pieces,
        qty_grams  = v_new_grams
    where id = v_line.product_id;

    -- Denetim izi: negatif delta = çıkış
    insert into stock_movements (
      product_id, job_id, movement_type, qty_pieces_delta, qty_grams_delta, note
    )
    values (
      v_line.product_id, p_job_id, 'job_out',
      -v_line.qty_pieces_used,
      -v_line.qty_grams_used,
      'İş tamamlandı: ' || v_job.title
    );
  end loop;

  update jobs
  set status = 'completed', completed_at = now()
  where id = p_job_id;

  -- QR kodu: iş tamamlandığında üretilir (PRD 5.2 / 5.5)
  insert into qr_codes (job_id) values (p_job_id)
  on conflict (job_id) do nothing;

  select token into v_token from qr_codes where job_id = p_job_id;

  return jsonb_build_object(
    'job_id', p_job_id,
    'qr_token', v_token,
    'material_lines', v_line_count
  );
end;
$$;

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
    raise exception 'İş bulunamadı: %', p_job_id using errcode = 'no_data_found';
  end if;

  if v_job.status <> 'completed' then
    raise exception 'İş tamamlanmamış, geri alınamaz: %', p_job_id
      using errcode = 'invalid_parameter_value';
  end if;

  for v_line in
    select jp.product_id, jp.qty_pieces_used, jp.qty_grams_used
    from job_products jp
    join products p on p.id = jp.product_id
    where jp.job_id = p_job_id
    order by jp.product_id
    for update of p
  loop
    v_line_count := v_line_count + 1;

    update products
    set qty_pieces = qty_pieces + v_line.qty_pieces_used,
        qty_grams  = qty_grams  + v_line.qty_grams_used
    where id = v_line.product_id;

    insert into stock_movements (
      product_id, job_id, movement_type, qty_pieces_delta, qty_grams_delta, note
    )
    values (
      v_line.product_id, p_job_id, 'job_revert',
      v_line.qty_pieces_used,
      v_line.qty_grams_used,
      'Tamamlama geri alındı: ' || v_job.title
    );
  end loop;

  update jobs
  set status = 'in_progress', completed_at = null
  where id = p_job_id;

  return jsonb_build_object('job_id', p_job_id, 'reverted_lines', v_line_count);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) QR sayfası — müşteri hangi birimi göreceğini bilsin
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
            'unit', p.unit_type_default,
            'qty_pieces', jp.qty_pieces_used,
            'qty_grams', jp.qty_grams_used
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

-- -----------------------------------------------------------------------------
-- 8) Stok mutabakatı ve açılış stoğu
-- -----------------------------------------------------------------------------
drop function if exists stock_reconciliation();

create or replace function stock_reconciliation()
returns table (
  product_id         uuid,
  product_name       text,
  birim              unit_type,
  kayitli_adet       integer,
  hareketlerden_adet bigint,
  kayitli_gram       integer,
  hareketlerden_gram bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.name,
    p.unit_type_default,
    p.qty_pieces,
    coalesce(sum(sm.qty_pieces_delta), 0),
    p.qty_grams,
    coalesce(sum(sm.qty_grams_delta), 0)
  from products p
  left join stock_movements sm on sm.product_id = p.id
  group by p.id, p.name, p.unit_type_default, p.qty_pieces, p.qty_grams
  having p.qty_pieces <> coalesce(sum(sm.qty_pieces_delta), 0)
      or p.qty_grams  <> coalesce(sum(sm.qty_grams_delta), 0);
$$;

create or replace function record_opening_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.qty_pieces, 0) <> 0 or coalesce(new.qty_grams, 0) <> 0 then
    insert into stock_movements (
      product_id, movement_type, qty_pieces_delta, qty_grams_delta, note
    )
    values (
      new.id, 'purchase_in',
      coalesce(new.qty_pieces, 0), coalesce(new.qty_grams, 0),
      'Açılış stoğu'
    );
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9) Yetkiler
--
-- İmzalar değiştiği için yetkiler yeniden veriliyor. Supabase'in varsayılan
-- ayrıcalıkları yeni fonksiyonları anon'a da açıyor; bu yüzden önce
-- anon ve public'ten alınıyor.
-- -----------------------------------------------------------------------------
revoke all on function job_product_cost(unit_type, numeric, integer, integer) from anon, public;
revoke all on function apply_stock_movement(uuid, movement_type, integer, text) from anon, public;
revoke all on function add_job_product(uuid, uuid, integer) from anon, public;
revoke all on function complete_job(uuid, boolean) from anon, public;
revoke all on function revert_job_completion(uuid) from anon, public;
revoke all on function stock_reconciliation() from anon, public;
revoke all on function record_opening_stock() from anon, public;
revoke all on function public_job_by_token(text) from anon, public;

grant execute on function job_product_cost(unit_type, numeric, integer, integer) to authenticated;
grant execute on function apply_stock_movement(uuid, movement_type, integer, text) to authenticated;
grant execute on function add_job_product(uuid, uuid, integer) to authenticated;
grant execute on function complete_job(uuid, boolean) to authenticated;
grant execute on function revert_job_completion(uuid) to authenticated;
grant execute on function stock_reconciliation() to authenticated;
grant select on job_costs to authenticated;
revoke all on job_costs from anon;

-- QR sayfası giriş yapmamış müşteriye açık: tek bilinmesi gereken token.
grant execute on function public_job_by_token(text) to anon, authenticated;
