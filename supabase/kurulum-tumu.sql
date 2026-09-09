-- =============================================================================
-- Altınöz Bobinaj — Yönetim Paneli, tüm kurulum SQL'i
--
-- Bu dosya supabase/migrations/ altındaki dosyaların SIRAYLA birleştirilmiş
-- hâlidir. Supabase panelinde SQL Editor'e tek seferde yapıştırıp
-- çalıştırabilirsiniz.
--
-- Tekrar çalıştırmak güvenlidir: yerel Postgres'te üç kez üst üste
-- çalıştırılıp doğrulandı (0 hata) ve sonrasında 177 SQL testi geçiyor.
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
/* 0015 monthly_trend / dashboard_by_customer'in DONUS KOLONLARINI
   degistiriyor (net_gelir -> tahsilat, kalan_alacak eklendi).
   `create or replace function` donus tipini degistiremiyor: kurulum
   dosyasi ikinci kez calistirildiginda bu satir "cannot change return
   type of existing function" hatasi veriyordu. Once dusuruluyor. */
drop function if exists dashboard_by_customer(date, date);

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
/* 0015 monthly_trend / dashboard_by_customer'in DONUS KOLONLARINI
   degistiriyor (net_gelir -> tahsilat, kalan_alacak eklendi).
   `create or replace function` donus tipini degistiremiyor: kurulum
   dosyasi ikinci kez calistirildiginda bu satir "cannot change return
   type of existing function" hatasi veriyordu. Once dusuruluyor. */
drop function if exists monthly_trend(integer);

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
  /* anon'a acik kalan proje fonksiyonu SIFIR olmali.
     Iki bilincli istisna disarida:
       public_job_by_token — QR sayfasi, ticari bilgi dondurmuyor
       giris_kaydet        — giris denemesi henuz oturum acilmadan
                             kaydediliyor; yalnizca INSERT yapiyor
     Ikisi de supabase/GUVENLIK.md'de gerekcesiyle yaziyor. Bu satir
     dosya TEKRAR calistirildiginda giris_kaydet zaten kurulu oldugu
     icin onemli: istisna olmasa 1 goruntulenip yanlis alarm verirdi. */
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.proname not in ('public_job_by_token', 'giris_kaydet')
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

-- #############################################################################
-- # 0009_arama_ve_denetim.sql
-- # ARAMA (musteri + motor) ve DENETIM GUNLUGU (audit_log)
-- #############################################################################

-- =============================================================================
-- Panel araması ve denetim (audit) günlüğü
--
-- İki ayrı ihtiyaç, tek migration:
--
--  1) ARAMA — Özet sayfasındaki tek arama kutusu müşteri adı ve motor
--     (iş) adında arıyor. Sonuçlar tek biçimde dönüyor: her satır
--     müşteri > segment > motor kırılımını taşıyor, böylece "hangi
--     müşterinin hangi ziyaretindeki motor" sorusu listeye bakarak
--     cevaplanıyor.
--
--  2) DENETİM — Kim ne zaman ne yaptı. Trigger ile yazılıyor, yani
--     uygulamadan geçmeyen bir değişiklik de (SQL Editor'den elle yapılan
--     bir düzeltme dahil) günlüğe düşüyor. Uygulama katmanından yazılan
--     tek şey veri değişikliği olmayan eylemler: PDF alma gibi.
-- =============================================================================

-- #############################################################################
-- 1) ARAMA
-- #############################################################################

-- -----------------------------------------------------------------------------
-- Türkçe duyarlı normalleştirme
--
-- Postgres'in ilike'ı veritabanı collation'ına göre çalışıyor ve Supabase
-- varsayılanı (en_US) Türkçe'nin İ/ı ayrımını bilmiyor: "ismail" yazan
-- kullanıcı "İSMAİL" kaydını bulamıyordu. Atölyede kimse büyük/küçük harfe
-- ya da şapkalı harfe dikkat ederek arama yapmaz.
--
-- Çözüm: her iki tarafı da ASCII karşılığına indirip karşılaştırmak.
-- Böylece "sahin" → "Şahin", "ismail" → "İSMAİL" eşleşiyor.
-- -----------------------------------------------------------------------------
create or replace function tr_normalize(p_metin text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
  select lower(translate(
    p_metin,
    'İIŞĞÜÖÇışğüöçÂÎÛâîû',
    'IISGUOCisguocAIUaiu'
  ));
$$;

comment on function tr_normalize(text) is
  'Aramada kullanilan Turkce duyarli normalleştirme: buyuk/kucuk harf ve '
  'Turkce karakterler ASCII karsiligina indiriliyor.';

-- -----------------------------------------------------------------------------
-- panel_arama — tek kutu, tek sorgu
--
-- Neden tek fonksiyon? Fonksiyon ile veritabanı arasındaki her gidiş-dönüş
-- sayfa süresine ekleniyor. İki ayrı sorgu yerine tek çağrı yapılıyor.
--
-- Sonuç şekli her tür için AYNI: müşteri satırında segment ve motor alanları
-- null kalıyor, arayüz aynı bileşenle çiziyor.
-- -----------------------------------------------------------------------------
create or replace function panel_arama(
  p_terim text,
  p_limit integer default 30
)
returns table (
  tur            text,        -- 'musteri' | 'is'
  kayit_id       uuid,        -- bağlantının hedefi
  musteri_id     uuid,
  musteri_adi    text,
  segment_id     uuid,
  segment_tarihi date,
  is_id          uuid,
  is_basligi     text,
  is_durumu      job_status,
  siralama       timestamptz  -- en yeni önce
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_desen text;
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if p_terim is null or length(btrim(p_terim)) < 2 then
    return;  -- tek harfle arama tüm listeyi döndürür, anlamsız
  end if;

  /* % ve _ joker karakterleri kullanıcı girdisinde arama operatörü olarak
     yorumlanmamalı; ters bölü de kaçırılıyor çünkü LIKE'ın kaçış karakteri. */
  v_desen := '%' || replace(replace(replace(
      tr_normalize(btrim(p_terim)),
      '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  -- Müşteriler
  select
    'musteri'::text,
    c.id,
    c.id,
    c.name,
    null::uuid,
    null::date,
    null::uuid,
    null::text,
    null::job_status,
    c.created_at
  from customers c
  where tr_normalize(c.name) like v_desen

  union all

  -- Motorlar (işler) — müşteri ve segment bilgisiyle birlikte
  select
    'is'::text,
    j.id,
    cu.id,
    cu.name,
    s.id,
    s.segment_date,
    j.id,
    j.title,
    j.status,
    j.created_at
  from jobs j
  join segments s  on s.id = j.segment_id
  join customers cu on cu.id = s.customer_id
  where tr_normalize(j.title) like v_desen

  order by 10 desc
  limit v_limit;
end;
$$;

revoke all on function panel_arama(text, integer) from anon, public;
revoke all on function tr_normalize(text) from anon, public;
grant execute on function panel_arama(text, integer) to authenticated;
grant execute on function tr_normalize(text) to authenticated;

-- #############################################################################
-- 2) DENETİM GÜNLÜĞÜ
-- #############################################################################

do $$
begin
  if not exists (select 1 from pg_type where typname = 'audit_action') then
    create type audit_action as enum ('insert', 'update', 'delete', 'pdf');
  end if;
end $$;

create table if not exists audit_log (
  id          bigserial primary key,
  occurred_at timestamptz  not null default now(),
  /* Kullanıcı silinse bile günlük okunabilir kalmalı: e-posta kaydın
     içine kopyalanıyor, auth.users'a foreign key verilmiyor. */
  actor_id    uuid,
  actor_email text,
  action      audit_action not null,
  entity      text         not null,
  entity_id   uuid,
  label       text,
  details     jsonb,
  constraint audit_log_entity_gecerli check (entity in (
    'customer', 'segment', 'job', 'job_product',
    'product', 'stock_movement', 'invoice', 'report'
  ))
);

comment on table audit_log is
  'Salt-eklenen denetim gunlugu. Guncelleme ve silme YETKISI YOK: bir '
  'denetim kaydi sonradan degistirilebiliyorsa denetim degeri kalmaz.';

create index if not exists audit_log_zaman_idx
  on audit_log (occurred_at desc);
create index if not exists audit_log_varlik_idx
  on audit_log (entity, entity_id);

-- -----------------------------------------------------------------------------
-- Genel trigger
--
-- Varlık adı trigger argümanı olarak geliyor; böylece tek fonksiyon bütün
-- tablolara bağlanıyor. Satır to_jsonb ile okunuyor: her tablonun farklı
-- kolonları var ama etiket ve kimlik böyle tek yerden çıkarılabiliyor.
--
-- SECURITY DEFINER: günlüğe yazmak, yazan kullanıcının audit_log üzerindeki
-- yetkisine bağlı olmamalı. Kullanıcı kendi izini silemez, yazmayı da
-- atlayamaz.
-- -----------------------------------------------------------------------------
create or replace function audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_varlik  text := TG_ARGV[0];
  v_eylem   audit_action;
  v_yeni    jsonb;
  v_eski    jsonb;
  v_satir   jsonb;
  v_etiket  text;
  v_ayrinti jsonb;
  v_kim     uuid;
  v_eposta  text;
begin
  if TG_OP = 'DELETE' then
    v_eylem := 'delete';
    v_eski  := to_jsonb(OLD);
    v_satir := v_eski;
  elsif TG_OP = 'UPDATE' then
    v_eylem := 'update';
    v_eski  := to_jsonb(OLD);
    v_yeni  := to_jsonb(NEW);
    v_satir := v_yeni;
  else
    v_eylem := 'insert';
    v_yeni  := to_jsonb(NEW);
    v_satir := v_yeni;
  end if;

  /* Etiket insan tarafından okunacak; her tablonun kendi "adı" farklı
     kolonda. Bulunamazsa null kalıyor, günlük yine yazılıyor. */
  v_etiket := case v_varlik
    when 'customer'       then v_satir->>'name'
    when 'product'        then v_satir->>'name'
    when 'job'            then v_satir->>'title'
    when 'segment'        then to_char((v_satir->>'segment_date')::date, 'DD.MM.YYYY')
    when 'invoice'        then coalesce(v_satir->>'invoice_no', v_satir->>'ettn')
    when 'stock_movement' then v_satir->>'movement_type'
    when 'job_product'    then (
      select p.name from products p where p.id = (v_satir->>'product_id')::uuid
    )
    else null
  end;

  /* Güncellemede yalnızca gerçekten değişen alanlar saklanıyor. Tüm satırı
     saklamak günlüğü okunamaz hâle getiriyor ve gereksiz veri tutuyor.
     updated_at her güncellemede değişiyor, gürültü olduğu için atlanıyor. */
  if TG_OP = 'UPDATE' then
    select jsonb_object_agg(
             k, jsonb_build_object('eski', v_eski->k, 'yeni', v_yeni->k)
           )
      into v_ayrinti
      from jsonb_object_keys(v_yeni) as k
     where (v_eski->k) is distinct from (v_yeni->k)
       and k <> 'updated_at';

    -- Yalnızca updated_at değiştiyse kayda değer bir şey olmamış
    if v_ayrinti is null then
      return NEW;
    end if;
  end if;

  /* auth.uid()/auth.jwt() Supabase'de var; başka bir Postgres'te yoksa
     denetim yazmak yüzünden asıl işlem başarısız OLMAMALI. */
  begin
    v_kim    := auth.uid();
    v_eposta := auth.jwt() ->> 'email';
  exception
    when others then
      v_kim := null; v_eposta := null;
  end;

  insert into audit_log (
    actor_id, actor_email, action, entity, entity_id, label, details
  )
  values (
    v_kim, v_eposta, v_eylem, v_varlik,
    (v_satir->>'id')::uuid, v_etiket, v_ayrinti
  );

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

-- -----------------------------------------------------------------------------
-- Trigger'lar
-- -----------------------------------------------------------------------------
drop trigger if exists customers_audit on customers;
create trigger customers_audit after insert or update or delete on customers
  for each row execute function audit_trigger('customer');

drop trigger if exists segments_audit on segments;
create trigger segments_audit after insert or update or delete on segments
  for each row execute function audit_trigger('segment');

drop trigger if exists jobs_audit on jobs;
create trigger jobs_audit after insert or update or delete on jobs
  for each row execute function audit_trigger('job');

drop trigger if exists job_products_audit on job_products;
create trigger job_products_audit after insert or update or delete on job_products
  for each row execute function audit_trigger('job_product');

drop trigger if exists products_audit on products;
create trigger products_audit after insert or update or delete on products
  for each row execute function audit_trigger('product');

drop trigger if exists stock_movements_audit on stock_movements;
create trigger stock_movements_audit after insert or update or delete on stock_movements
  for each row execute function audit_trigger('stock_movement');

drop trigger if exists invoices_audit on invoices;
create trigger invoices_audit after insert or update or delete on invoices
  for each row execute function audit_trigger('invoice');

-- -----------------------------------------------------------------------------
-- Uygulama katmanından yazım — veri değişikliği olmayan eylemler
--
-- PDF alma bir tabloyu değiştirmiyor, o yüzden trigger göremiyor. Uygulama
-- bunu açıkça bildiriyor. Yalnızca 'pdf' eylemi kabul ediliyor: veri
-- değişiklikleri tek kaynaktan, trigger'dan gelmeli — yoksa aynı olay iki
-- kez düşer ya da uygulama günlüğü yanlış yazabilir.
-- -----------------------------------------------------------------------------
create or replace function audit_kaydet(
  p_entity text,
  p_entity_id uuid,
  p_label text,
  p_details jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kim    uuid;
  v_eposta text;
begin
  begin
    v_kim    := auth.uid();
    v_eposta := auth.jwt() ->> 'email';
  exception
    when others then
      v_kim := null; v_eposta := null;
  end;

  /* Oturumsuz çağrı günlüğü kirletmesin. */
  if v_kim is null then
    raise exception 'Denetim kaydi icin oturum gerekli'
      using errcode = 'insufficient_privilege';
  end if;

  insert into audit_log (
    actor_id, actor_email, action, entity, entity_id, label, details
  )
  values (v_kim, v_eposta, 'pdf', p_entity, p_entity_id, p_label, p_details);
end;
$$;

-- -----------------------------------------------------------------------------
-- Yetkiler
--
-- Günlük salt-eklenir: authenticated okuyabilir, ama UPDATE/DELETE hiçbir
-- role verilmiyor ve o işlemler için politika da yazılmıyor. Yazma yalnızca
-- SECURITY DEFINER fonksiyonlar üzerinden oluyor.
-- -----------------------------------------------------------------------------
alter table audit_log enable row level security;

drop policy if exists audit_log_staff_select on audit_log;
create policy audit_log_staff_select on audit_log
  for select to authenticated using (true);

revoke all on audit_log from anon, public;
revoke all on audit_log from authenticated;
grant select on audit_log to authenticated;

revoke all on function audit_trigger() from anon, public, authenticated;
revoke all on function audit_kaydet(text, uuid, text, jsonb) from anon, public;
grant execute on function audit_kaydet(text, uuid, text, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Ölü tabloyu kaldır: pdf_exports
--
-- 0001'de PRD'ye göre açılmıştı ama uygulama hiçbir zaman ona yazmadı.
-- Artık PDF eylemleri audit_log'a düşüyor. İki ayrı günlük bırakmak
-- "hangisi doğru" sorusunu doğurur ve biri hep eksik kalır.
--
-- Yalnızca BOŞSA düşürülüyor: içinde kayıt varsa dokunulmuyor ve durum
-- bildiriliyor — veri silmek bu migration'ın işi değil.
-- -----------------------------------------------------------------------------
do $$
declare v_sayi integer;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'pdf_exports'
  ) then
    return;
  end if;

  execute 'select count(*) from pdf_exports' into v_sayi;

  if v_sayi = 0 then
    drop table pdf_exports;
    raise notice 'Kullanilmayan pdf_exports tablosu kaldirildi (PDF eylemleri artik audit_log''da).';
  else
    raise notice 'pdf_exports icinde % kayit var; DOKUNULMADI. Inceleyip elle karar verin.', v_sayi;
  end if;
end $$;

-- #############################################################################
-- # 0010_qr_miktar_gizli.sql
-- # QR SAYFASINDAN MIKTAR KALDIRILDI (musteriye maliyet ipucu vermesin)
-- #############################################################################

-- =============================================================================
-- QR sayfasından miktar kaldırıldı
--
-- Müşteri QR'ı okuttuğunda hangi malzemelerin kullanıldığını görüyor ama
-- artık ne kadar kullanıldığını görmüyor.
--
-- Neden fonksiyondan da kaldırılıyor, sadece arayüzden değil?
--   Fonksiyon anon rolüne açık (QR sayfası girişsiz açılıyor). Veriyi
--   döndürüp arayüzde göstermemek gizlemek değil: müşteri tarayıcının ağ
--   sekmesinden ya da doğrudan uca istek atarak miktarı görebilir.
--   Gösterilmeyecek veri hiç gönderilmemeli.
--
-- Miktar neden hassas?
--   Kullanılan bakır telin gramı, işin maliyetini yaklaşık olarak ele
--   veriyor. Alış fiyatı zaten hiç dönmüyordu; miktarla birlikte piyasa
--   fiyatı çarpılarak maliyet tahmin edilebiliyordu.
-- =============================================================================

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
          /* YALNIZCA malzeme adı. Miktar (qty_pieces / qty_grams) ve birim
             bilinçli olarak DÖNDÜRÜLMÜYOR — bkz. dosya başlığı. */
          jsonb_build_object('name', p.name)
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

-- QR sayfası giriş yapmamış müşteriye açık: tek bilinmesi gereken token.
revoke all on function public_job_by_token(text) from anon, public;
grant execute on function public_job_by_token(text) to anon, authenticated;

-- #############################################################################
-- # 0011_islem_turu.sql
-- # ISLEM TURU: motor sarimi / revizyon (tamamlamada zorunlu)
-- #############################################################################

-- =============================================================================
-- İşlem türü: motor sarımı / revizyon
--
-- İş tamamlanırken hangi işlemin yapıldığı seçiliyor ve seçim ZORUNLU.
-- Müşteri QR'ı okuttuğunda ne yapıldığını okuyabiliyor.
--
-- Neden tamamlama anında sorulmuyor da kolonda saklanıyor?
--   Müşteriye gösterilecek belgenin metni buna bağlı; QR sayfası işi
--   tamamlanmış bulup okuyor. Yani değer kalıcı olmak zorunda.
--
-- Neden zorunluluk veritabanında da var?
--   Formda "seçmeden gönderilemez" demek yeterli değil: eylem doğrudan
--   çağrılabilir. Boş bırakılmış bir işlem türü, müşteriye gösterilecek
--   belgeyi eksik bırakır ve bunu sonradan hangi işin ne olduğunu
--   hatırlayarak düzeltmek gerekir. Kural tek yerde, en altta.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'service_type') then
    create type service_type as enum ('winding', 'revision');
  end if;
end $$;

alter table jobs
  add column if not exists service_type service_type;

comment on column jobs.service_type is
  'Yapilan islem: winding = motor sarimi, revizyon = revision. Is '
  'tamamlanirken zorunlu olarak seciliyor; tamamlanmamis iste null.';

/* Tamamlanmış bir işin işlem türü olmak ZORUNDA. Kısıt tamamlanmamış
   işleri serbest bırakıyor: iş açılırken henüz ne yapılacağı belli değil.

   Kısıt eklenmeden önce mevcut tamamlanmış işler doldurulmalı, yoksa
   ALTER başarısız olur. Geçmiş işlerin çoğu motor sarımı olduğu için
   varsayılan 'winding'; bu bir tahmin ve NOTICE ile bildiriliyor. */
do $$
declare v_gecmis integer;
begin
  select count(*) into v_gecmis
  from jobs where status = 'completed' and service_type is null;

  if v_gecmis > 0 then
    update jobs set service_type = 'winding'
    where status = 'completed' and service_type is null;

    raise notice '% tamamlanmis is icin islem turu bilinmiyordu, "motor sarimi"', v_gecmis;
    raise notice 'olarak isaretlendi. Yanlis olanlari panelden duzeltebilirsiniz.';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_tamamlanan_islem_turu'
  ) then
    alter table jobs add constraint jobs_tamamlanan_islem_turu
      check (status <> 'completed' or service_type is not null);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- complete_job — işlem türü parametresi eklendi
-- -----------------------------------------------------------------------------
drop function if exists complete_job(uuid, boolean);

create or replace function complete_job(
  p_job_id uuid,
  p_service_type service_type,
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
  if p_service_type is null then
    raise exception 'İşlem türü seçilmeli: motor sarımı veya revizyon'
      using errcode = 'invalid_parameter_value';
  end if;

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
  set status       = 'completed',
      completed_at = now(),
      service_type = p_service_type
  where id = p_job_id;

  -- QR kodu: iş tamamlandığında üretilir (PRD 5.2 / 5.5)
  insert into qr_codes (job_id) values (p_job_id)
  on conflict (job_id) do nothing;

  select token into v_token from qr_codes where job_id = p_job_id;

  return jsonb_build_object(
    'job_id', p_job_id,
    'qr_token', v_token,
    'service_type', p_service_type,
    'material_lines', v_line_count
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- QR sayfası — müşteri ne yapıldığını okusun
--
-- Miktar hâlâ dönmüyor (0010): kullanılan telin gramı işin maliyetini
-- yaklaşık ele veriyor. İşlem türü ise müşterinin bilmesi gereken bilgi.
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
    'service_type', j.service_type,
    'materials', coalesce(
      (
        select jsonb_agg(
          /* YALNIZCA malzeme adı. Miktar bilinçli olarak dönmüyor. */
          jsonb_build_object('name', p.name)
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
-- Yetkiler — complete_job imzası değişti
-- -----------------------------------------------------------------------------
revoke all on function complete_job(uuid, service_type, boolean) from anon, public;
grant execute on function complete_job(uuid, service_type, boolean) to authenticated;

revoke all on function public_job_by_token(text) from anon, public;
grant execute on function public_job_by_token(text) to anon, authenticated;

-- #############################################################################
-- # 0012_islem_turu_coklu.sql
-- # ISLEM TURU COK SECIMLI: sarim ve/veya revizyon (en az biri zorunlu)
-- #############################################################################

-- =============================================================================
-- İşlem türü tek seçimden ÇOK seçime geçiyor
--
-- Bir motora aynı ziyarette hem sarım hem revizyon yapılabiliyor. Tek enum
-- değeri bunu ifade edemiyordu; kullanıcı ikisini birden işaretlemek
-- istiyor. En az biri hâlâ zorunlu.
--
-- Neden dizi, neden 'both' diye üçüncü bir enum değeri değil?
--   'both' üç durumu üç ayrı değerle temsil ederdi; dördüncü bir işlem
--   türü eklendiğinde kombinasyon sayısı patlar (2^n). Dizi ile her yeni
--   tür tek bir enum değeri olarak eklenir ve kombinasyonlar kendiliğinden
--   oluşur. Ayrıca "revizyon yapılan işler" sorgusu diziyle doğrudan
--   yazılabiliyor (`'revision' = any(service_types)`), 'both' ile her
--   sorguya iki koşul gerekirdi.
--
-- Neden iki boolean kolonu değil?
--   Aynı sebep: her yeni tür şema değişikliği demek olurdu.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Yeni kolon ve mevcut verinin taşınması
-- -----------------------------------------------------------------------------
alter table jobs
  add column if not exists service_types service_type[];

/* Tek değerli eski kolon tek elemanlı diziye çevriliyor. Veri kaybı yok. */
do $$
declare v_tasinan integer;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs'
      and column_name = 'service_type'
  ) then
    execute $tasi$
      update jobs
      set service_types = array[service_type]
      where service_type is not null and service_types is null
    $tasi$;

    execute 'select count(*) from jobs where service_types is not null'
      into v_tasinan;
    raise notice '% isin islem turu diziye tasindi.', v_tasinan;
  end if;
end $$;

comment on column jobs.service_types is
  'Yapilan islemler. Bir ziyarette hem sarim hem revizyon yapilabildigi '
  'icin dizi. Tamamlanmis iste en az bir eleman zorunlu (kisit); '
  'tamamlanmamis iste null.';

-- -----------------------------------------------------------------------------
-- 2) Kısıtlar
--
-- Eski tek-değer kısıtı kaldırılıyor, yerine dizi kısıtı geliyor:
-- tamamlanmış iş ⇒ dizi dolu VE boş dizi değil VE tekrar içermiyor.
--
-- Tekrar kontrolü neden var? array['winding','winding'] geçerli bir dizi
-- ama anlamsız; müşteri belgesinde "motor sarımı ve motor sarımı" yazardı.
-- -----------------------------------------------------------------------------
alter table jobs drop constraint if exists jobs_tamamlanan_islem_turu;

/* Tekrar kontrolü ayrı bir fonksiyonda: Postgres CHECK kısıtı içinde alt
   sorguya izin vermiyor ("cannot use subquery in check constraint").
   IMMUTABLE olduğu için kısıtta kullanılabiliyor. */
create or replace function islem_turleri_gecerli(p_turler service_type[])
returns boolean
language sql
immutable
as $$
  /* coalesce ŞART: array_length(boş dizi, 1) Postgres'te 0 değil NULL
     döner. NULL dönen bir ifade CHECK kısıtında "geçti" sayılıyor, yani
     coalesce olmadan boş dizi kısıttan sızıyordu — kendi testimiz yakaladı
     ("elle bos dizi yazilabildi"). Fonksiyon her durumda kesin bir boolean
     döndürmek zorunda. */
  select coalesce(array_length(p_turler, 1), 0) >= 1
     -- benzersiz eleman sayısı toplam eleman sayısına eşit ⇒ tekrar yok
     and coalesce(array_length(p_turler, 1), 0) = (
           select count(distinct t) from unnest(coalesce(p_turler, '{}')) as t
         );
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_tamamlanan_islem_turleri'
  ) then
    alter table jobs add constraint jobs_tamamlanan_islem_turleri check (
      status <> 'completed' or islem_turleri_gecerli(service_types)
    );
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3) Eski kolonu kaldır
--
-- Taşıma yapıldıktan sonra tek-değer kolonu kalırsa iki kaynak oluşur ve
-- biri güncellenmeyip sessizce yanlış veri verir.
-- -----------------------------------------------------------------------------
alter table jobs drop column if exists service_type;

-- -----------------------------------------------------------------------------
-- 4) complete_job — dizi parametresi
-- -----------------------------------------------------------------------------
drop function if exists complete_job(uuid, service_type, boolean);

create or replace function complete_job(
  p_job_id uuid,
  p_service_types service_type[],
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
  v_turler     service_type[];
begin
  if p_service_types is null or array_length(p_service_types, 1) is null then
    raise exception 'En az bir işlem seçilmeli: motor sarımı ve/veya revizyon'
      using errcode = 'invalid_parameter_value';
  end if;

  /* Tekrarları at ve sırayı enum tanım sırasına sabitle.
     Sıranın sabit olması gerekiyor: müşteri belgesindeki metin bu sıradan
     üretiliyor ve "revizyon ve motor sarımı" ile "motor sarımı ve
     revizyon" arasında gidip gelmemeli. */
  select array_agg(distinct t order by t) into v_turler
  from unnest(p_service_types) as t;

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
  set status        = 'completed',
      completed_at  = now(),
      service_types = v_turler
  where id = p_job_id;

  -- QR kodu: iş tamamlandığında üretilir (PRD 5.2 / 5.5)
  insert into qr_codes (job_id) values (p_job_id)
  on conflict (job_id) do nothing;

  select token into v_token from qr_codes where job_id = p_job_id;

  return jsonb_build_object(
    'job_id', p_job_id,
    'qr_token', v_token,
    'service_types', v_turler,
    'material_lines', v_line_count
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) QR sayfası — işlemler dizi olarak dönüyor
--
-- Miktar hâlâ dönmüyor (0010).
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
    'service_types', coalesce(to_jsonb(j.service_types), '[]'::jsonb),
    'materials', coalesce(
      (
        select jsonb_agg(
          /* YALNIZCA malzeme adı. Miktar bilinçli olarak dönmüyor. */
          jsonb_build_object('name', p.name)
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
-- 6) Yetkiler — complete_job imzası değişti
-- -----------------------------------------------------------------------------
revoke all on function islem_turleri_gecerli(service_type[]) from anon, public;
grant execute on function islem_turleri_gecerli(service_type[]) to authenticated;

revoke all on function complete_job(uuid, service_type[], boolean) from anon, public;
grant execute on function complete_job(uuid, service_type[], boolean) to authenticated;

revoke all on function public_job_by_token(text) from anon, public;
grant execute on function public_job_by_token(text) to anon, authenticated;

-- #############################################################################
-- # 0013_guvenlik_sikilastirma.sql
-- # YUMUSAK SILME + DELETE KALDIRILDI + SIGNUP ENGELI + GIRIS DENETIMI
-- #############################################################################

-- =============================================================================
-- Güvenlik sıkılaştırma: veri kaybı imkânsız hâle getiriliyor
--
-- Denetimde bulunan kritik açık: RLS açıktı ama politikalar izin vericiydi
-- (`for all ... using (true)`). Oturum açmış HERHANGİ biri — ya da ele
-- geçmiş bir oturum — tüm müşterileri, işleri ve faturaları silebiliyordu.
--
-- Bu dosya üç şey yapıyor:
--   1) Yumuşak silme: kayıtlar işaretlenir, fiziksel olarak silinmez
--   2) RLS'ten DELETE tamamen kaldırılır (tablo yetkisi de geri alınır)
--   3) Kayıt (signup) veritabanı düzeyinde izinli listeye bağlanır
--
-- Neden yumuşak silme, "hiç silinmesin" değil?
--   Yanlış girilen bir fatura ya da mükerrer müşteri listede sonsuza kadar
--   kalırsa günlük kullanım bozulur. İşaretlenen kayıt listelerden ve
--   toplamlardan kalkıyor ama veritabanında duruyor; yanlışlıkla
--   silinen tek SQL satırıyla geri geliyor.
-- =============================================================================

-- #############################################################################
-- 1) YUMUŞAK SİLME ALANI
-- #############################################################################

alter table customers    add column if not exists deleted_at timestamptz;
alter table segments     add column if not exists deleted_at timestamptz;
alter table jobs         add column if not exists deleted_at timestamptz;
alter table job_products add column if not exists deleted_at timestamptz;
alter table invoices     add column if not exists deleted_at timestamptz;
alter table products     add column if not exists deleted_at timestamptz;

comment on column customers.deleted_at is
  'Yumusak silme. Dolu ise kayit listelerde ve toplamlarda GORUNMEZ ama '
  'veritabaninda durur. Fiziksel silme RLS ile engelli.';

/* Kısmi indeksler: sorguların tamamı `deleted_at is null` filtresi
   taşıyor, bu yüzden yalnızca yaşayan satırları indekslemek yeterli ve
   indeks küçük kalıyor. */
create index if not exists customers_yasayan_idx    on customers (id)    where deleted_at is null;
create index if not exists segments_yasayan_idx     on segments (id)     where deleted_at is null;
create index if not exists jobs_yasayan_idx         on jobs (id)         where deleted_at is null;
create index if not exists job_products_yasayan_idx on job_products (job_id) where deleted_at is null;
create index if not exists invoices_yasayan_idx     on invoices (id)     where deleted_at is null;
create index if not exists products_yasayan_idx     on products (id)     where deleted_at is null;

-- #############################################################################
-- 2) RLS: DELETE TAMAMEN KALDIRILIYOR
--
-- `for all` politikası SELECT/INSERT/UPDATE/DELETE hepsini kapsıyordu.
-- Yerine üç ayrı politika geliyor; DELETE için politika YAZILMIYOR ve
-- Postgres politikası olmayan işlemi reddediyor.
--
-- Tablo düzeyindeki DELETE yetkisi de geri alınıyor: iki katman, çünkü
-- ileride biri yanlışlıkla bir DELETE politikası eklerse yetki yokluğu
-- yine engelliyor.
-- #############################################################################

do $$
declare t text;
begin
  foreach t in array array['customers','segments','jobs','job_products','invoices','products','qr_codes']
  loop
    -- Eski her-şeye-izin politikası
    execute format('drop policy if exists %I on %I', t || '_staff_all', t);

    execute format('drop policy if exists %I on %I', t || '_staff_select', t);
    execute format(
      'create policy %I on %I for select to authenticated using (true)',
      t || '_staff_select', t);

    execute format('drop policy if exists %I on %I', t || '_staff_insert', t);
    execute format(
      'create policy %I on %I for insert to authenticated with check (true)',
      t || '_staff_insert', t);

    execute format('drop policy if exists %I on %I', t || '_staff_update', t);
    execute format(
      'create policy %I on %I for update to authenticated using (true) with check (true)',
      t || '_staff_update', t);

    /* DELETE politikası BİLİNÇLİ olarak yok. */
    execute format('revoke delete on %I from authenticated, anon', t);
  end loop;
end $$;

/* stock_movements ve audit_log zaten salt-eklenir; yetkilerini de
   pekiştiriyoruz. */
revoke delete, update on stock_movements from authenticated, anon;
revoke delete, update, insert on audit_log from authenticated, anon;
revoke delete, update, insert on monthly_summaries from authenticated, anon;

-- #############################################################################
-- 3) GÖRÜNÜM VE FONKSİYONLAR: silinmiş kayıtları dışla
--
-- Bu adım atlanırsa yumuşak silme işe yaramaz: kayıt listeden kalkar ama
-- kâr/zarar raporunda ve maliyet hesabında görünmeye devam eder — sessiz
-- ve fark edilmesi zor bir tutarsızlık.
-- #############################################################################

create or replace view job_costs as
select
  j.id as job_id,
  j.segment_id,
  coalesce(sum(
    job_product_cost(p.unit_type_default, jp.unit_cost_snapshot,
                     jp.qty_pieces_used, jp.qty_grams_used)
  ), 0)::numeric(14,2) as material_cost
from jobs j
left join job_products jp
       on jp.job_id = j.id and jp.deleted_at is null
left join products p on p.id = jp.product_id
where j.deleted_at is null
group by j.id, j.segment_id;

alter view job_costs set (security_invoker = on);
grant select on job_costs to authenticated;
revoke all on job_costs from anon;

create or replace view segment_invoice_totals as
select
  s.id as segment_id,
  count(i.id) as fatura_sayisi,
  coalesce(sum(i.gross_amount), 0)::numeric(14,2) as brut_toplam,
  coalesce(sum(i.net_amount), 0)::numeric(14,2)   as net_toplam,
  coalesce(sum(i.tax_amount), 0)::numeric(14,2)   as vergi_toplam
from segments s
left join invoices i
       on i.segment_id = s.id and i.deleted_at is null
where s.deleted_at is null
group by s.id;

alter view segment_invoice_totals set (security_invoker = on);
grant select on segment_invoice_totals to authenticated;
revoke all on segment_invoice_totals from anon;

-- Aylık trend
/* 0015 monthly_trend / dashboard_by_customer'in DONUS KOLONLARINI
   degistiriyor (net_gelir -> tahsilat, kalan_alacak eklendi).
   `create or replace function` donus tipini degistiremiyor: kurulum
   dosyasi ikinci kez calistirildiginda bu satir "cannot change return
   type of existing function" hatasi veriyordu. Once dusuruluyor. */
drop function if exists monthly_trend(integer);

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
    where deleted_at is null
    group by 1
  ),
  maliyet as (
    select date_trunc('month', j.completed_at)::date as ay,
           sum(jc.material_cost) as tutar
    from jobs j
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed' and j.completed_at is not null
      and j.deleted_at is null
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

-- Panel araması: silinmiş kayıt sonuçlarda çıkmamalı
create or replace function panel_arama(
  p_terim text,
  p_limit integer default 30
)
returns table (
  tur            text,
  kayit_id       uuid,
  musteri_id     uuid,
  musteri_adi    text,
  segment_id     uuid,
  segment_tarihi date,
  is_id          uuid,
  is_basligi     text,
  is_durumu      job_status,
  siralama       timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_desen text;
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if p_terim is null or length(btrim(p_terim)) < 2 then
    return;
  end if;

  v_desen := '%' || replace(replace(replace(
      tr_normalize(btrim(p_terim)),
      '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select
    'musteri'::text, c.id, c.id, c.name,
    null::uuid, null::date, null::uuid, null::text, null::job_status,
    c.created_at
  from customers c
  where tr_normalize(c.name) like v_desen
    and c.deleted_at is null

  union all

  select
    'is'::text, j.id, cu.id, cu.name, s.id, s.segment_date,
    j.id, j.title, j.status, j.created_at
  from jobs j
  join segments s   on s.id = j.segment_id
  join customers cu on cu.id = s.customer_id
  where tr_normalize(j.title) like v_desen
    and j.deleted_at is null
    and s.deleted_at is null
    and cu.deleted_at is null

  order by 10 desc
  limit v_limit;
end;
$$;

revoke all on function panel_arama(text, integer) from anon, public;
grant execute on function panel_arama(text, integer) to authenticated;

-- QR sayfası: silinmiş malzeme müşteriye gösterilmemeli
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
    'service_types', coalesce(to_jsonb(j.service_types), '[]'::jsonb),
    'materials', coalesce(
      (
        select jsonb_agg(jsonb_build_object('name', p.name) order by p.name)
        from job_products jp
        join products p on p.id = jp.product_id
        where jp.job_id = j.id
          and jp.deleted_at is null
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from qr_codes q
  join jobs j on j.id = q.job_id
  where q.token = p_token
    and j.status = 'completed'
    and j.deleted_at is null;   -- silinen isin QR'i artik veri dondurmez

  return v_result;
end;
$$;

revoke all on function public_job_by_token(text) from anon, public;
grant execute on function public_job_by_token(text) to anon, authenticated;

-- İş tamamlama: silinmiş malzeme satırı stoktan düşülmemeli
create or replace function complete_job(
  p_job_id uuid,
  p_service_types service_type[],
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
  v_turler     service_type[];
begin
  if p_service_types is null or array_length(p_service_types, 1) is null then
    raise exception 'En az bir işlem seçilmeli: motor sarımı ve/veya revizyon'
      using errcode = 'invalid_parameter_value';
  end if;

  select array_agg(distinct t order by t) into v_turler
  from unnest(p_service_types) as t;

  select * into v_job from jobs where id = p_job_id for update;

  if not found or v_job.deleted_at is not null then
    raise exception 'İş bulunamadı: %', p_job_id using errcode = 'no_data_found';
  end if;

  if v_job.status = 'completed' then
    raise exception 'İş zaten tamamlanmış: %', p_job_id
      using errcode = 'invalid_parameter_value';
  end if;

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
      and jp.deleted_at is null
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
  set status        = 'completed',
      completed_at  = now(),
      service_types = v_turler
  where id = p_job_id;

  insert into qr_codes (job_id) values (p_job_id)
  on conflict (job_id) do nothing;

  select token into v_token from qr_codes where job_id = p_job_id;

  return jsonb_build_object(
    'job_id', p_job_id,
    'qr_token', v_token,
    'service_types', v_turler,
    'material_lines', v_line_count
  );
end;
$$;

revoke all on function complete_job(uuid, service_type[], boolean) from anon, public;
grant execute on function complete_job(uuid, service_type[], boolean) to authenticated;

-- Geri alma: silinmiş satır iade edilmemeli
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

  if not found or v_job.deleted_at is not null then
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
      and jp.deleted_at is null
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

revoke all on function revert_job_completion(uuid) from anon, public;
grant execute on function revert_job_completion(uuid) to authenticated;

-- Malzeme ekleme: silinmiş ürüne ve silinmiş işe eklenemez
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
  v_job     jobs;
  v_product products;
  v_id      uuid;
begin
  select * into v_job from jobs where id = p_job_id;
  if not found or v_job.deleted_at is not null then
    raise exception 'İş bulunamadı: %', p_job_id using errcode = 'no_data_found';
  end if;

  if v_job.status = 'completed' then
    raise exception 'Tamamlanmış işe malzeme eklenemez; önce tamamlamayı geri alın'
      using errcode = 'invalid_parameter_value';
  end if;

  if coalesce(p_miktar, 0) <= 0 then
    raise exception 'Miktar sıfırdan büyük olmalı'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_product from products where id = p_product_id;
  if not found or v_product.deleted_at is not null then
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

revoke all on function add_job_product(uuid, uuid, integer) from anon, public;
grant execute on function add_job_product(uuid, uuid, integer) to authenticated;

-- Stok hareketi: silinmiş ürüne hareket girilemez
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

  if not found or v_product.deleted_at is not null then
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

revoke all on function apply_stock_movement(uuid, movement_type, integer, text) from anon, public;
grant execute on function apply_stock_movement(uuid, movement_type, integer, text) to authenticated;

-- Stok mutabakatı: silinmiş ürün farklı görünmesin
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
    p.id, p.name, p.unit_type_default,
    p.qty_pieces, coalesce(sum(sm.qty_pieces_delta), 0),
    p.qty_grams,  coalesce(sum(sm.qty_grams_delta), 0)
  from products p
  left join stock_movements sm on sm.product_id = p.id
  where p.deleted_at is null
  group by p.id, p.name, p.unit_type_default, p.qty_pieces, p.qty_grams
  having p.qty_pieces <> coalesce(sum(sm.qty_pieces_delta), 0)
      or p.qty_grams  <> coalesce(sum(sm.qty_grams_delta), 0);
$$;

revoke all on function stock_reconciliation() from anon, public;
grant execute on function stock_reconciliation() to authenticated;

-- #############################################################################
-- 4) YUMUŞAK SİLME FONKSİYONU
--
-- Uygulama doğrudan `update ... set deleted_at = now()` da yapabilirdi ama
-- fonksiyon üzerinden geçmenin iki faydası var: silme sebebi denetim
-- günlüğüne anlamlı düşüyor ve zaten silinmiş kaydın tekrar silinmesi
-- sessizce geçmiyor.
-- #############################################################################

create or replace function kayit_sil(p_tablo text, p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_etkilenen integer;
begin
  if p_tablo not in ('customers','segments','jobs','job_products','invoices','products') then
    raise exception 'Bu tabloda yumusak silme tanimli degil: %', p_tablo
      using errcode = 'invalid_parameter_value';
  end if;

  execute format(
    'update %I set deleted_at = now() where id = $1 and deleted_at is null',
    p_tablo
  ) using p_id;

  get diagnostics v_etkilenen = row_count;

  if v_etkilenen = 0 then
    raise exception 'Kayit bulunamadi veya zaten silinmis'
      using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function kayit_sil(text, uuid) from anon, public;
grant execute on function kayit_sil(text, uuid) to authenticated;

/* Geri getirme fonksiyonu BİLİNÇLİ olarak uygulamaya açılmıyor: yanlışlıkla
   silinen bir kaydı geri almak nadir bir olay ve SQL Editor'den tek satırla
   yapılıyor:
     update customers set deleted_at = null where id = '...';
   Arayüze koymak "silinenler" ekranı, listesi ve yetkilendirmesi demek —
   bugün ihtiyaç yok. */

-- #############################################################################
-- 5) KAYIT (SIGNUP) ENGELİ — veritabanı düzeyinde
--
-- Supabase panelindeki "Allow new users to sign up" ayarı birincil kontrol.
-- Ama o ayar yanlışlıkla açılırsa HERKES hesap açıp `authenticated` rolüne
-- geçer ve RLS'imiz oturum açmış herkese veri okumaya izin verdiği için
-- tüm işletme verisi görünür hâle gelir. Bu yüzden ikinci bir katman:
-- izinli e-posta listesi.
--
-- Nasıl çalışıyor? auth.users'a eklenen e-posta listede yoksa trigger
-- eklemeyi reddediyor. Yeni personel için önce e-posta listeye eklenir,
-- sonra Supabase panelinden kullanıcı oluşturulur.
-- #############################################################################

do $$
begin
  /* Sema DEGIL tablo kontrol ediliyor: yerel test shim'i auth semasini
     olusturuyor ama auth.users'i olusturmayabilir. Sema kontrolu yeterli
     sanilirsa migration "relation auth.users does not exist" ile duruyor. */
  if to_regclass('auth.users') is null then
    raise notice 'auth.users yok; signup engeli kurulmadi (yerel test ortami)';
    return;
  end if;

  create table if not exists izinli_epostalar (
    eposta     text primary key,
    not_       text,
    created_at timestamptz not null default now()
  );

  execute $c$
    comment on table izinli_epostalar is
      'Hesap acilmasina izin verilen e-postalar. auth.users trigger''i bu '
      'listeye bakiyor; listede olmayan e-posta ile hesap OLUSTURULAMAZ.'
  $c$;

  /* Personel bu tabloyu görebilir ama DEĞİŞTİREMEZ: kendi kendine yetki
     vermenin yolu kapalı. Listeye ekleme yalnızca SQL Editor'den
     (service_role / postgres) yapılıyor. */
  alter table izinli_epostalar enable row level security;

  drop policy if exists izinli_epostalar_staff_select on izinli_epostalar;
  create policy izinli_epostalar_staff_select on izinli_epostalar
    for select to authenticated using (true);

  revoke all on izinli_epostalar from anon;
  revoke insert, update, delete on izinli_epostalar from authenticated;
  grant select on izinli_epostalar to authenticated;
end $$;

/* Mevcut kullanıcılar listeye alınıyor — yoksa trigger kurulduktan sonra
   şifre sıfırlama gibi işlemlerde sorun çıkabilir ve daha önemlisi, var
   olan hesaplar "izinsiz" görünür. */
do $$
declare v_sayi integer;
begin
  if to_regclass('auth.users') is null then return; end if;

  execute $c$
    insert into izinli_epostalar (eposta, not_)
    select lower(email), 'Trigger kurulmadan once var olan hesap'
    from auth.users
    where email is not null
    on conflict (eposta) do nothing
  $c$;

  execute 'select count(*) from izinli_epostalar' into v_sayi;
  raise notice 'Izinli eposta listesinde % kayit var.', v_sayi;
end $$;

create or replace function izinsiz_kayit_engelle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is null then
    raise exception 'E-postasiz hesap olusturulamaz'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from izinli_epostalar where eposta = lower(new.email)
  ) then
    raise exception
      'Bu e-posta ile hesap acilmasina izin verilmiyor. Once izinli_epostalar tablosuna eklenmeli.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('auth.users') is null then return; end if;

  drop trigger if exists izinsiz_kayit_engeli on auth.users;
  create trigger izinsiz_kayit_engeli
    before insert on auth.users
    for each row execute function izinsiz_kayit_engelle();

  raise notice 'Signup engeli kuruldu: izinli_epostalar listesi disinda hesap acilamaz.';
exception
  when insufficient_privilege then
    /* Bazı Supabase projelerinde SQL Editor'ün rolü auth.users üzerinde
       trigger oluşturamıyor. Bu blok başarısız olsa da geri kalan
       sıkılaştırma uygulanmış olmalı; eksik olan tek şey bildiriliyor. */
    raise notice '';
    raise notice 'UYARI: auth.users uzerinde trigger olusturulamadi (yetki yok).';
    raise notice 'Signup engeli VERITABANI duzeyinde kurulamadi. Supabase panelinde';
    raise notice 'Authentication -> Sign In / Providers -> "Allow new users to sign up"';
    raise notice 'ayarini KAPALI tuttugunuzdan emin olun.';
end $$;

revoke all on function izinsiz_kayit_engelle() from anon, public, authenticated;

-- #############################################################################
-- 6) GİRİŞ DENETİMİ — ülke bilgisiyle
--
-- Ülke kısıtı uygulama katmanında (middleware) uygulanıyor çünkü ülke
-- bilgisi HTTP başlığından geliyor, veritabanı bunu göremez. Buradaki iş
-- kaydı tutmak: hangi girişin nereden yapıldığı sonradan sorulabilmeli.
-- #############################################################################

do $$
begin
  if not exists (select 1 from pg_type where typname = 'login_outcome') then
    create type login_outcome as enum ('allowed', 'blocked_country', 'unknown_country');
  end if;
end $$;

create table if not exists login_log (
  id          bigserial primary key,
  occurred_at timestamptz   not null default now(),
  eposta      text,
  country     text,
  outcome     login_outcome not null,
  ip_prefix   text,
  user_agent  text
);

comment on table login_log is
  'Giris denemeleri ve ulke bilgisi. Salt-eklenir. ip_prefix TAM IP degil: '
  'son okteti maskeli, cunku tam IP kisisel veri ve tesbit icin gerekmiyor.';

create index if not exists login_log_zaman_idx on login_log (occurred_at desc);

alter table login_log enable row level security;

drop policy if exists login_log_staff_select on login_log;
create policy login_log_staff_select on login_log
  for select to authenticated using (true);

revoke all on login_log from anon;
revoke insert, update, delete on login_log from authenticated;
grant select on login_log to authenticated;

/* Yazma SECURITY DEFINER fonksiyon üzerinden: personel günlüğü
   değiştirip izini silemiyor. */
create or replace function giris_kaydet(
  p_eposta text,
  p_country text,
  p_outcome login_outcome,
  p_ip_prefix text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into login_log (eposta, country, outcome, ip_prefix, user_agent)
  values (lower(nullif(btrim(p_eposta), '')), upper(nullif(btrim(p_country), '')),
          p_outcome, p_ip_prefix, left(p_user_agent, 300));
end;
$$;

/* anon'a AÇIK: giriş denemesi henüz oturum açılmadan kaydediliyor.
   Fonksiyon yalnızca INSERT yapıyor, hiçbir şey okumuyor. */
revoke all on function giris_kaydet(text, text, login_outcome, text, text) from public;
grant execute on function giris_kaydet(text, text, login_outcome, text, text)
  to anon, authenticated;

-- #############################################################################
-- # 0014_tutar_ve_stok_fiyati.sql
-- # FATURASIZ CIRO + STOK GIRISINDE FIYAT + GUNCEL FIYATTAN MALIYET
-- #############################################################################

-- =============================================================================
-- Faturasız ciro, stok girişinde fiyat, güncel fiyattan maliyet
--
-- Beş değişiklik:
--   1) Segment başına ciro: YA fatura YA elle girilen tutar (ikisi birden
--      olamaz — aynı para iki kez sayılmasın)
--   2) İş başına tutar: yalnızca NOT, hiçbir hesaba girmiyor
--   3) Stok girişinde fiyat: ürünün fiyatı artık alım anında güncelleniyor
--   4) Maliyet TAMAMLAMA anındaki fiyattan donduruluyor (ekleme anındaki
--      değil)
--   5) Sayım düzeltmesi kalktı: miktarın işareti giriş/çıkışı belirliyor
-- =============================================================================

-- #############################################################################
-- 1) CİRO: segment başına fatura VEYA tutar
-- #############################################################################

alter table segments
  add column if not exists charged_amount numeric(12, 2)
    check (charged_amount is null or charged_amount >= 0);

comment on column segments.charged_amount is
  'Musteriden alinan tutar (faturasiz nakit odeme icin). Bir segmentte YA '
  'fatura YA bu tutar olur; ikisi birden olamaz (ciro iki kez sayilmasin). '
  'Ciro hesabi: fatura varsa faturadan, yoksa buradan.';

alter table jobs
  add column if not exists charged_amount numeric(12, 2)
    check (charged_amount is null or charged_amount >= 0);

comment on column jobs.charged_amount is
  'Is basina musteriden alinan tutar. YALNIZCA NOT: hicbir ciro, kar veya '
  'rapor hesabina girmiyor. Ciro segment duzeyinde tutuluyor.';

-- -----------------------------------------------------------------------------
-- "Ya fatura ya tutar" kuralı
--
-- Tek bir CHECK ile ifade edilemiyor: kural iki tabloya yayılıyor (segment
-- tutarı ile o segmentin faturaları). Bu yüzden iki yönlü trigger — hangi
-- taraftan gelinirse gelinsin çakışma engellenir. Tek yön korunsa diğer
-- kapı açık kalırdı.
-- -----------------------------------------------------------------------------
create or replace function segment_ciro_cakismasi()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tutar  numeric;
  v_fatura integer;
begin
  /* Iki taraf iki ayri soru soruyor; birlestirmeye calismak once
     hataliydi. Segment tarafindan gelen "bu segmentte fatura var mi",
     fatura tarafindan gelen "bu segmentte tutar var mi" diye sormali. */
  if TG_TABLE_NAME = 'segments' then
    if new.charged_amount is null then return new; end if;

    select count(*) into v_fatura
    from invoices
    where segment_id = new.id and deleted_at is null;

    if v_fatura > 0 then
      raise exception
        'Bu segmentte fatura var; ayrica tutar girilemez. Ciro iki kez sayilir. Once faturayi kaldirin ya da tutari bosaltin.'
        using errcode = 'check_violation';
    end if;
  else
    if new.segment_id is null then return new; end if;

    select charged_amount into v_tutar
    from segments where id = new.segment_id and deleted_at is null;

    if v_tutar is not null then
      raise exception
        'Bu segmente elden tutar girilmis; ayrica fatura eklenemez. Ciro iki kez sayilir. Once tutari bosaltin.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists segments_ciro_cakismasi on segments;
create trigger segments_ciro_cakismasi
  before insert or update of charged_amount on segments
  for each row execute function segment_ciro_cakismasi();

drop trigger if exists invoices_ciro_cakismasi on invoices;
create trigger invoices_ciro_cakismasi
  before insert or update of segment_id on invoices
  for each row execute function segment_ciro_cakismasi();

revoke all on function segment_ciro_cakismasi() from anon, public, authenticated;

-- #############################################################################
-- 2) STOK: giriş/çıkış işaretle, fiyat alım anında
-- #############################################################################

do $$
begin
  /* Sayım düzeltmesi kalkıyor ama enum'dan değer SİLİNMİYOR: geçmiş
     hareketler o değeri taşıyor ve silmek onları okunamaz hâle getirir.
     Yeni hareketlerde kullanılmıyor, o kadar. */
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'movement_type' and e.enumlabel = 'manual_out'
  ) then
    alter type movement_type add value 'manual_out';
  end if;
end $$;

alter table stock_movements
  add column if not exists unit_price numeric(12, 2)
    check (unit_price is null or unit_price >= 0);

/* Kesin sira.
   created_at transaction basi zamanini aliyor: ayni transaction icindeki
   iki hareket ayni damgayi tasiyor ve id rastgele uuid oldugu icin
   siralama belirsiz kaliyordu. Yuruyen bakiye siraya bagli oldugu icin
   bu bir gosterim sorunu degil, hesap sorunu. Salt-eklenir bir gunlukte
   dogru cozum artan bir sayac. */
alter table stock_movements
  add column if not exists seq bigserial;

create index if not exists stock_movements_seq_idx
  on stock_movements (product_id, seq desc);

comment on column stock_movements.seq is
  'Artan hareket sirasi. created_at transaction basi zamanini aldigi icin '
  'ayni transaction icindeki hareketleri siralayamiyor; yuruyen bakiye bu '
  'kolona gore hesaplaniyor.';

comment on column stock_movements.unit_price is
  'Bu alimda odenen birim fiyat. Adet urunde TL/adet, gram urunde TL/kg. '
  'Yalnizca girislerde dolu; cikislarda ve is hareketlerinde null.';

-- #############################################################################
-- 3) apply_stock_movement — işaret + fiyat
--
-- Hareket tipi artık PARAMETRE DEĞİL: miktarın işareti belirliyor.
-- Kullanıcı "giriş mi düzeltme mi" diye karar vermek zorunda kalmıyor;
-- panelde bir karar eksiliyor ve yanlış tip seçme ihtimali kalkıyor.
-- #############################################################################

-- Eski imzalar: 0002 numeric'li, 0008 gram'li surumu birakti.
drop function if exists apply_stock_movement(uuid, movement_type, integer, text);
drop function if exists apply_stock_movement(uuid, movement_type, integer, numeric, text);

create or replace function apply_stock_movement(
  p_product_id uuid,
  p_miktar integer,
  p_fiyat numeric default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_product   products;
  v_tip       movement_type;
  v_adet      integer := 0;
  v_gram      integer := 0;
  v_yeni      integer;
  v_birim_adi text;
begin
  if coalesce(p_miktar, 0) = 0 then
    raise exception 'Miktar girilmeli' using errcode = 'invalid_parameter_value';
  end if;

  if p_fiyat is not null and p_fiyat < 0 then
    raise exception 'Fiyat negatif olamaz' using errcode = 'invalid_parameter_value';
  end if;

  /* Fiyat yalnızca girişte anlamlı: çıkış bir satın alma değil, o yüzden
     "kaça çıktı" sorusu yok. Sessizce yok saymak yerine reddediliyor —
     kullanıcı fiyat girdiyse bir şey kastediyor. */
  if p_miktar < 0 and p_fiyat is not null then
    raise exception 'Stok cikisinda fiyat girilmez'
      using errcode = 'invalid_parameter_value';
  end if;

  v_tip := case when p_miktar > 0 then 'purchase_in' else 'manual_out' end;

  select * into v_product from products where id = p_product_id for update;

  if not found or v_product.deleted_at is not null then
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

  /* Fiyat verildiyse ürünün güncel fiyatı güncelleniyor. Maliyet hesabı
     tamamlama anındaki bu fiyatı kullanacak. */
  update products
  set qty_pieces = case when v_product.unit_type_default = 'piece'
                        then v_yeni else qty_pieces end,
      qty_grams  = case when v_product.unit_type_default = 'piece'
                        then qty_grams else v_yeni end,
      purchase_price = coalesce(p_fiyat, purchase_price)
  where id = p_product_id;

  insert into stock_movements (
    product_id, movement_type, qty_pieces_delta, qty_grams_delta, unit_price, note
  )
  values (p_product_id, v_tip, v_adet, v_gram, p_fiyat, p_note);

  return jsonb_build_object(
    'product_id', p_product_id,
    'birim',      v_birim_adi,
    'miktar',     v_yeni,
    'fiyat',      coalesce(p_fiyat, v_product.purchase_price)
  );
end;
$$;

revoke all on function apply_stock_movement(uuid, integer, numeric, text) from anon, public;
grant execute on function apply_stock_movement(uuid, integer, numeric, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Ürünü stok girişiyle birlikte tanımlama
--
-- Ürün formunda fiyat sorulmuyor artık: fiyat alım anında belli oluyor,
-- ürün tanımlanırken değil. Malzeme alan kişi "şunu şu fiyata şu kadar
-- aldım" diyor; iki ayrı ekranda iki ayrı adım olması gereksizdi.
-- -----------------------------------------------------------------------------
create or replace function urun_ve_stok_ekle(
  p_ad text,
  p_birim unit_type,
  p_miktar integer,
  p_fiyat numeric,
  p_sku text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_ad is null or length(btrim(p_ad)) = 0 then
    raise exception 'Ürün adı girilmeli' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_miktar, 0) <= 0 then
    raise exception 'Ürün eklerken miktar sıfırdan büyük olmalı'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into products (name, sku, unit_type_default, purchase_price, notes)
  values (btrim(p_ad), nullif(btrim(coalesce(p_sku, '')), ''), p_birim,
          coalesce(p_fiyat, 0), nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  /* Açılış stoğu trigger'ı (record_opening_stock) products insert'inde
     hareketi kendisi yazıyor; burada qty 0 ile açıp hareketi
     apply_stock_movement ile geçiyoruz ki fiyat da harekete düşsün. */
  return apply_stock_movement(v_id, p_miktar, p_fiyat, p_note);
end;
$$;

revoke all on function urun_ve_stok_ekle(text, unit_type, integer, numeric, text, text) from anon, public;
grant execute on function urun_ve_stok_ekle(text, unit_type, integer, numeric, text, text) to authenticated;

-- #############################################################################
-- 4) ÜRÜN BAZLI STOK GEÇMİŞİ
-- #############################################################################

create or replace function urun_stok_gecmisi(
  p_product_id uuid,
  p_limit integer default 100
)
returns table (
  hareket_id  uuid,
  zaman       timestamptz,
  tip         movement_type,
  miktar      integer,
  birim       unit_type,
  birim_fiyat numeric,
  is_basligi  text,
  not_        text,
  bakiye      integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with urun as (
    select unit_type_default from products where id = p_product_id
  ),
  hareketler as (
    select
      sm.id,
      sm.seq,
      sm.created_at,
      sm.movement_type,
      case when u.unit_type_default = 'piece'
           then sm.qty_pieces_delta else sm.qty_grams_delta end as delta,
      u.unit_type_default,
      sm.unit_price,
      j.title,
      sm.note,
      /* Yürüyen bakiye: "o an stokta ne vardı" sorusu, hareket listesine
         bakarak elle toplamadan cevaplanabilmeli. */
      sum(case when u.unit_type_default = 'piece'
               then sm.qty_pieces_delta else sm.qty_grams_delta end)
        over (order by sm.seq) as yuruyen
    from stock_movements sm
    cross join urun u
    left join jobs j on j.id = sm.job_id
    where sm.product_id = p_product_id
  )
  select id, created_at, movement_type, delta, unit_type_default,
         unit_price, title, note, yuruyen
  from hareketler
  order by seq desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function urun_stok_gecmisi(uuid, integer) from anon, public;
grant execute on function urun_stok_gecmisi(uuid, integer) to authenticated;

-- #############################################################################
-- 5) MALİYET: tamamlama anındaki fiyattan
--
-- Eskiden fiyat malzeme EKLENDİĞİ anda donuyordu. Kullanıcının isteği:
-- iş devam ederken yeni ve daha pahalı mal alındıysa maliyet o fiyattan
-- hesaplanmalı — "bu işi bugün kapatıyorum, malzemeyi bugünkü fiyatla
-- yerine koyacağım" mantığı.
--
-- Tamamlandıktan SONRA yine donuyor: geçen ayın kârı bugün fiyat
-- değiştirdiğiniz için değişmemeli.
-- #############################################################################

create or replace view job_costs as
select
  j.id as job_id,
  j.segment_id,
  coalesce(sum(
    job_product_cost(
      p.unit_type_default,
      /* Tamamlanmış iş: tamamlama anında donmuş fiyat.
         Devam eden iş: güncel fiyat — canlı tahmin, henüz donmadı. */
      case when j.status = 'completed'
           then jp.unit_cost_snapshot
           else p.purchase_price end,
      jp.qty_pieces_used, jp.qty_grams_used
    )
  ), 0)::numeric(14,2) as material_cost
from jobs j
left join job_products jp
       on jp.job_id = j.id and jp.deleted_at is null
left join products p on p.id = jp.product_id
where j.deleted_at is null
group by j.id, j.segment_id;

alter view job_costs set (security_invoker = on);
grant select on job_costs to authenticated;
revoke all on job_costs from anon;

-- complete_job: fiyatları tamamlama anında dondur + tutar al
drop function if exists complete_job(uuid, service_type[], boolean);

create or replace function complete_job(
  p_job_id uuid,
  p_service_types service_type[],
  p_charged_amount numeric default null,
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
  v_turler     service_type[];
begin
  if p_service_types is null or array_length(p_service_types, 1) is null then
    raise exception 'En az bir işlem seçilmeli: motor sarımı ve/veya revizyon'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_charged_amount is not null and p_charged_amount < 0 then
    raise exception 'Tutar negatif olamaz' using errcode = 'invalid_parameter_value';
  end if;

  select array_agg(distinct t order by t) into v_turler
  from unnest(p_service_types) as t;

  select * into v_job from jobs where id = p_job_id for update;

  if not found or v_job.deleted_at is not null then
    raise exception 'İş bulunamadı: %', p_job_id using errcode = 'no_data_found';
  end if;

  if v_job.status = 'completed' then
    raise exception 'İş zaten tamamlanmış: %', p_job_id
      using errcode = 'invalid_parameter_value';
  end if;

  /* MALIYET DONDURMA — tamamlama anındaki fiyat.
     Stok düşümünden ÖNCE yapılıyor: aynı transaction içinde olduğu için
     sıra sonucu değiştirmiyor ama okurken niyet belli oluyor. */
  update job_products jp
  set unit_cost_snapshot = p.purchase_price
  from products p
  where jp.product_id = p.id
    and jp.job_id = p_job_id
    and jp.deleted_at is null;

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
      and jp.deleted_at is null
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
  set status         = 'completed',
      completed_at   = now(),
      service_types  = v_turler,
      /* Tutar NOT niteliğinde: hiçbir hesaba girmiyor. null gelirse
         mevcut değer korunuyor (geri alıp tekrar tamamlarken kaybolmasın). */
      charged_amount = coalesce(p_charged_amount, charged_amount)
  where id = p_job_id;

  insert into qr_codes (job_id) values (p_job_id)
  on conflict (job_id) do nothing;

  select token into v_token from qr_codes where job_id = p_job_id;

  return jsonb_build_object(
    'job_id', p_job_id,
    'qr_token', v_token,
    'service_types', v_turler,
    'material_lines', v_line_count
  );
end;
$$;

revoke all on function complete_job(uuid, service_type[], numeric, boolean) from anon, public;
grant execute on function complete_job(uuid, service_type[], numeric, boolean) to authenticated;

-- #############################################################################
-- 6) CİRO HESABI: fatura VEYA segment tutarı
--
-- Çakışma trigger'la engellendiği için basit toplama yeterli: bir
-- segmentte ikisi birden olamıyor.
-- #############################################################################

create or replace function dashboard_summary(p_start date, p_end date)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with fatura as (
    select
      coalesce(sum(gross_amount), 0)::numeric(14,2) as brut,
      coalesce(sum(net_amount), 0)::numeric(14,2)   as net,
      coalesce(sum(tax_amount), 0)::numeric(14,2)   as vergi,
      count(*)                                       as sayi
    from invoices
    where issue_date between p_start and p_end
      and deleted_at is null
  ),
  /* Faturasız ciro: segmente elle girilen tutar. Trigger ikisinin bir
     arada olmasını engelliyor, o yüzden çifte sayım yok. */
  elden as (
    select coalesce(sum(charged_amount), 0)::numeric(14,2) as tutar,
           count(*) as sayi
    from segments
    where charged_amount is not null
      and deleted_at is null
      and segment_date between p_start and p_end
  ),
  maliyet as (
    select coalesce(sum(jc.material_cost), 0)::numeric(14,2) as toplam
    from jobs j
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed'
      and j.completed_at::date between p_start and p_end
      and j.deleted_at is null
  ),
  isler as (
    select
      count(*) filter (where status = 'completed'
                         and completed_at::date between p_start and p_end) as tamamlanan,
      count(*) filter (where status <> 'completed')                        as acik
    from jobs
    where deleted_at is null
  )
  select jsonb_build_object(
    'baslangic', p_start,
    'bitis', p_end,
    'brut_gelir', (fatura.brut + elden.tutar)::numeric(14,2),
    'net_gelir', (fatura.net + elden.tutar)::numeric(14,2),
    'vergi', fatura.vergi,
    'fatura_sayisi', fatura.sayi,
    'faturali_gelir', fatura.net,
    'elden_gelir', elden.tutar,
    'elden_sayisi', elden.sayi,
    'malzeme_maliyeti', maliyet.toplam,
    'kar_zarar', (fatura.net + elden.tutar - maliyet.toplam)::numeric(14,2),
    'tamamlanan_is', isler.tamamlanan,
    'acik_is', isler.acik
  )
  from fatura, elden, maliyet, isler;
$$;

revoke all on function dashboard_summary(date, date) from anon, public;
grant execute on function dashboard_summary(date, date) to authenticated;

/* 0015 monthly_trend / dashboard_by_customer'in DONUS KOLONLARINI
   degistiriyor (net_gelir -> tahsilat, kalan_alacak eklendi).
   `create or replace function` donus tipini degistiremiyor: kurulum
   dosyasi ikinci kez calistirildiginda bu satir "cannot change return
   type of existing function" hatasi veriyordu. Once dusuruluyor. */
drop function if exists monthly_trend(integer);

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
    select ay, sum(tutar) as net from (
      select date_trunc('month', issue_date)::date as ay, net_amount as tutar
      from invoices where deleted_at is null
      union all
      select date_trunc('month', segment_date)::date as ay, charged_amount as tutar
      from segments where charged_amount is not null and deleted_at is null
    ) k group by ay
  ),
  maliyet as (
    select date_trunc('month', j.completed_at)::date as ay,
           sum(jc.material_cost) as tutar
    from jobs j
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed' and j.completed_at is not null
      and j.deleted_at is null
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

/* 0015 monthly_trend / dashboard_by_customer'in DONUS KOLONLARINI
   degistiriyor (net_gelir -> tahsilat, kalan_alacak eklendi).
   `create or replace function` donus tipini degistiremiyor: kurulum
   dosyasi ikinci kez calistirildiginda bu satir "cannot change return
   type of existing function" hatasi veriyordu. Once dusuruluyor. */
drop function if exists dashboard_by_customer(date, date);

create or replace function dashboard_by_customer(p_start date, p_end date)
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
    select customer_id, sum(tutar) as net from (
      select customer_id, net_amount as tutar
      from invoices
      where issue_date between p_start and p_end and deleted_at is null
      union all
      select customer_id, charged_amount as tutar
      from segments
      where charged_amount is not null and deleted_at is null
        and segment_date between p_start and p_end
    ) k group by customer_id
  ),
  maliyet as (
    select s.customer_id, sum(jc.material_cost) as tutar, count(*) as is_sayisi
    from jobs j
    join segments s on s.id = j.segment_id
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed'
      and j.completed_at::date between p_start and p_end
      and j.deleted_at is null and s.deleted_at is null
    group by s.customer_id
  )
  select
    c.id, c.name,
    coalesce(g.net, 0)::numeric(14,2),
    coalesce(m.tutar, 0)::numeric(14,2),
    (coalesce(g.net, 0) - coalesce(m.tutar, 0))::numeric(14,2),
    coalesce(m.is_sayisi, 0)
  from customers c
  left join gelir g on g.customer_id = c.id
  left join maliyet m on m.customer_id = c.id
  where c.deleted_at is null
    and (g.net is not null or m.tutar is not null)
  order by (coalesce(g.net, 0) - coalesce(m.tutar, 0)) desc;
$$;

revoke all on function dashboard_by_customer(date, date) from anon, public;
grant execute on function dashboard_by_customer(date, date) to authenticated;

-- #############################################################################
-- 7) Segment tutarı yazma fonksiyonu
--
-- Doğrudan UPDATE de olurdu ama fonksiyon fatura çakışmasını anlaşılır bir
-- mesajla bildiriyor ve silinmiş segmente yazılmasını engelliyor.
-- #############################################################################

create or replace function segment_tutar_yaz(
  p_segment_id uuid,
  p_tutar numeric
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_var integer;
begin
  if p_tutar is not null and p_tutar < 0 then
    raise exception 'Tutar negatif olamaz' using errcode = 'invalid_parameter_value';
  end if;

  select count(*) into v_var from segments
  where id = p_segment_id and deleted_at is null;
  if v_var = 0 then
    raise exception 'Segment bulunamadı' using errcode = 'no_data_found';
  end if;

  update segments set charged_amount = p_tutar where id = p_segment_id;
end;
$$;

revoke all on function segment_tutar_yaz(uuid, numeric) from anon, public;
grant execute on function segment_tutar_yaz(uuid, numeric) to authenticated;

-- #############################################################################
-- # 0015_tahsilat_ve_vade.sql
-- # ANLASILAN TUTAR / TAHSILAT AYRIMI + COK VADELI ODEME
-- #############################################################################

-- =============================================================================
-- Anlaşılan tutar / tahsilat ayrımı — çok vadeli ödeme
--
-- SORUN: sistem "anlaşılan para" ile "alınan para"yı aynı şey sayıyordu.
-- Fatura yüklemek ya da elden tutar girmek tek vadede tahsil edilmiş
-- sayılıyor, aylık gelir de o tarihe yazılıyordu. Gerçekte anlaşılan
-- para tek seferde ödenmiyor.
--
-- ÇÖZÜM: iki ayrı kavram.
--
--   1) ANLAŞILAN TUTAR (segments.agreed_amount / fatura brütü)
--      Müşteriyle konuşulan toplam. Fatura yüklendiyse faturadan,
--      yüklenmediyse elle giriliyor. Bir borç, bir tahsilat değil.
--
--   2) TAHSİLAT (payments)
--      Fiilen alınan para. Bir segmentte birden çok olabiliyor ("vade").
--      Her birinin KENDİ TARİHİ var ve aylık gelir bu tarihe yazılıyor —
--      kullanıcının açık isteği. Anlaşma tarihi değil, paranın eline
--      geçtiği tarih önemli.
--
-- Aylık gelir artık NAKİT ESASLI. Bu bilinçli bir tercih: "bu ay kasaya
-- ne girdi" sorusunun cevabı. Yapılan ama tahsil edilmemiş iş gelirde
-- görünmüyor; onun karşılığı "kalan alacak".
--
-- İşin tamamlanmasıyla paranın hiçbir bağı YOK: tamamlanmamış işin
-- parası peşin alınabiliyor, tamamlanmış işin parası aylar sonra
-- gelebiliyor. complete_job() bu yüzden tutar parametresini kaybetti.
-- =============================================================================

-- #############################################################################
-- 1) charged_amount -> agreed_amount
--
-- Ad artık yanlış olurdu: "charged" tahsil edilmiş parayı çağırıyor ve
-- tahsilat ayrı bir tabloya taşındı. İki kavramın adı birbirine
-- benzemeyecek.
-- #############################################################################

/* 0014'un trigger'i charged_amount kolonuna BAGIMLI; kolon oldugu gibi
   dusurulemiyor ("cannot drop column ... because other objects depend on
   it"). Trigger birkac satir asagida yeniden kuruluyor, o yuzden burada
   dusurmek guvenli. `cascade` kullanilmiyor: bir kolonun pesinden neyin
   birlikte gittigini gormek istiyoruz. */
drop trigger if exists segments_ciro_cakismasi on segments;

do $$
declare
  t text;
begin
  foreach t in array array['segments', 'jobs']
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t
        and column_name = 'charged_amount'
    ) then
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = t
          and column_name = 'agreed_amount'
      ) then
        /* Kurulum dosyası baştan çalıştırıldı: 0014'ün
           "add column if not exists charged_amount" satırı, adı
           değiştirilmiş kolonu görmediği için BOŞ bir kolon daha
           ekliyor. İçinde veri olabilecek tek durum, elle yazılmış
           olması; yine de veriyi taşıyıp kolonu atıyoruz. */
        execute format(
          'update %I set agreed_amount = coalesce(agreed_amount, charged_amount)
           where charged_amount is not null', t);
        execute format('alter table %I drop column charged_amount', t);
      else
        execute format('alter table %I rename column charged_amount to agreed_amount', t);
      end if;
    end if;
  end loop;
end $$;

/* Kolon 0014 hiç çalışmadan doğrudan buraya gelinirse diye. */
alter table segments
  add column if not exists agreed_amount numeric(12, 2)
    check (agreed_amount is null or agreed_amount >= 0);

alter table jobs
  add column if not exists agreed_amount numeric(12, 2)
    check (agreed_amount is null or agreed_amount >= 0);

comment on column segments.agreed_amount is
  'Musteriyle anlasilan TOPLAM tutar (fatura kesilmeyen isler icin). Bir '
  'segmentte YA fatura YA bu tutar olur; ikisi de "anlasilan toplam"i '
  'ifade ettigi icin ikisi birden anlamsiz. Tahsil edilen para bu kolonda '
  'DEGIL, payments tablosunda.';

comment on column jobs.agreed_amount is
  'Is basina anlasilan tutar. YALNIZCA NOT: hicbir ciro, tahsilat, kar '
  'veya rapor hesabina girmiyor. Para segment duzeyinde takip ediliyor. '
  'Isin durumundan bagimsiz her zaman duzenlenebilir.';

-- -----------------------------------------------------------------------------
-- "Ya fatura ya elle girilen anlaşılan tutar" kuralı
--
-- 0014'teki iki yönlü trigger korunuyor; gövde kolon adını PLPGSQL
-- içinde ÇALIŞMA ANINDA çözdüğü için yeniden tanımlanması ZORUNLU —
-- yoksa rename sonrası "record new has no field charged_amount" hatası
-- verirdi.
-- -----------------------------------------------------------------------------
create or replace function segment_ciro_cakismasi()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tutar  numeric;
  v_fatura integer;
begin
  /* Iki taraf iki ayri soru soruyor. Segment tarafindan gelen "bu
     segmentte fatura var mi", fatura tarafindan gelen "bu segmentte
     elle girilmis tutar var mi" diye sormali; birlestirmeye calismak
     once hataliydi. */
  if TG_TABLE_NAME = 'segments' then
    if new.agreed_amount is null then return new; end if;

    select count(*) into v_fatura
    from invoices
    where segment_id = new.id and deleted_at is null;

    if v_fatura > 0 then
      raise exception
        'Bu segmentte fatura var; anlasilan tutar faturadan geliyor. Elle tutar girmek icin once faturayi kaldirin.'
        using errcode = 'check_violation';
    end if;
  else
    if new.segment_id is null then return new; end if;

    select agreed_amount into v_tutar
    from segments where id = new.segment_id and deleted_at is null;

    if v_tutar is not null then
      raise exception
        'Bu segmente elle anlasilan tutar girilmis; ayrica fatura eklenemez. Once tutari bosaltin.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists segments_ciro_cakismasi on segments;
create trigger segments_ciro_cakismasi
  before insert or update of agreed_amount on segments
  for each row execute function segment_ciro_cakismasi();

drop trigger if exists invoices_ciro_cakismasi on invoices;
create trigger invoices_ciro_cakismasi
  before insert or update of segment_id on invoices
  for each row execute function segment_ciro_cakismasi();

revoke all on function segment_ciro_cakismasi() from anon, public, authenticated;

-- #############################################################################
-- 2) payments — tahsilat / vade
--
-- Segment düzeyinde, iş düzeyinde değil: müşteri bir gelişte birden çok
-- iş bırakıyor ve parayı işlere bölerek ödemiyor. "500 verdi" demek
-- segmente 500 girmek demek.
-- #############################################################################

create table if not exists payments (
  id         uuid primary key default gen_random_uuid(),
  segment_id uuid not null references segments (id) on delete cascade,
  /* Sifir tutarli tahsilat bir kayit degil, gurultu. */
  amount     numeric(12, 2) not null check (amount > 0),
  /* Paranin ELE GECTIGI gun. Varsayilan bugun cunku tahsilat cogunlukla
     alindigi gun giriliyor; gecmise donuk giris de mumkun olmali.
     Aylik gelir bu kolona gore hesaplaniyor. */
  paid_on    date not null default current_date,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table payments is
  'Segment basina tahsilat (vade). Anlasilan tutar tek seferde odenmedigi '
  'icin bir segmentte birden cok satir olabiliyor. paid_on = paranin ele '
  'gectigi gun; aylik gelir bu tarihe gore hesaplaniyor.';

comment on column payments.paid_on is
  'Paranin alindigi gun. Fatura tarihi veya segment tarihi DEGIL: nakit '
  'esasli gelir hesabi bu kolona bagli.';

create index if not exists payments_segment_idx
  on payments (segment_id) where deleted_at is null;

/* Aylik gelir sorgusu tarih araligiyla tarama yapiyor. */
create index if not exists payments_paid_on_idx
  on payments (paid_on desc) where deleted_at is null;

drop trigger if exists payments_set_updated_at on payments;
create trigger payments_set_updated_at
  before update on payments
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — 0013'teki kalıbın aynısı: DELETE politikası YOK
-- -----------------------------------------------------------------------------
alter table payments enable row level security;

drop policy if exists payments_staff_select on payments;
create policy payments_staff_select
  on payments for select to authenticated using (true);

drop policy if exists payments_staff_insert on payments;
create policy payments_staff_insert
  on payments for insert to authenticated with check (true);

drop policy if exists payments_staff_update on payments;
create policy payments_staff_update
  on payments for update to authenticated using (true) with check (true);

/* Fiziksel silme yok: para kaydi yumusak siliniyor ki yanlislikla
   silinen bir tahsilat geri getirilebilsin. */
revoke delete on payments from authenticated, anon;
revoke all on payments from anon;
grant select, insert, update on payments to authenticated;

-- -----------------------------------------------------------------------------
-- Denetim günlüğü
-- -----------------------------------------------------------------------------
alter table audit_log drop constraint if exists audit_log_entity_gecerli;
alter table audit_log add constraint audit_log_entity_gecerli check (entity in (
  'customer', 'segment', 'job', 'job_product',
  'product', 'stock_movement', 'invoice', 'report', 'payment'
));

drop trigger if exists payments_audit on payments;
create trigger payments_audit after insert or update or delete on payments
  for each row execute function audit_trigger('payment');

-- -----------------------------------------------------------------------------
-- Yumuşak silme listesine ekleniyor
-- -----------------------------------------------------------------------------
create or replace function kayit_sil(p_tablo text, p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_etkilenen integer;
begin
  if p_tablo not in ('customers','segments','jobs','job_products',
                     'invoices','products','payments') then
    raise exception 'Bu tabloda yumusak silme tanimli degil: %', p_tablo
      using errcode = 'invalid_parameter_value';
  end if;

  execute format(
    'update %I set deleted_at = now() where id = $1 and deleted_at is null',
    p_tablo
  ) using p_id;

  get diagnostics v_etkilenen = row_count;

  if v_etkilenen = 0 then
    raise exception 'Kayit bulunamadi veya zaten silinmis'
      using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function kayit_sil(text, uuid) from anon, public;
grant execute on function kayit_sil(text, uuid) to authenticated;

-- #############################################################################
-- 3) segment_balances — segmentin para durumu tek satırda
--
-- Üç ekran ve PDF aynı hesabı yapıyor: anlaşılan ne, tahsil edilen ne,
-- kalan ne. Üç yerde ayrı yazılsa biri değişip diğeri kalırdı.
--
-- kalan NULL kalabiliyor: anlaşılan tutar hiç girilmemişse "borç yok"
-- değil "borç bilinmiyor" demektir. Sıfır yazmak bunu gizlerdi.
-- #############################################################################

create or replace view segment_balances as
select
  s.id                as segment_id,
  s.customer_id,
  s.segment_date,
  f.fatura_sayisi,
  f.brut_toplam       as fatura_toplam,
  s.agreed_amount     as elle_girilen,
  /* Anlasilan toplam: fatura varsa faturanin BRUTU (musterinin odedigi
     rakam), yoksa elle girilen tutar. Ikisi birden olamiyor. */
  case when f.fatura_sayisi > 0 then f.brut_toplam else s.agreed_amount end
                      as anlasilan,
  coalesce(t.tahsilat, 0)::numeric(14,2) as tahsil_edilen,
  coalesce(t.vade_sayisi, 0)             as vade_sayisi,
  t.son_tahsilat,
  case
    when f.fatura_sayisi > 0 then (f.brut_toplam - coalesce(t.tahsilat, 0))::numeric(14,2)
    when s.agreed_amount is not null then (s.agreed_amount - coalesce(t.tahsilat, 0))::numeric(14,2)
    else null
  end                 as kalan
from segments s
left join segment_invoice_totals f on f.segment_id = s.id
left join (
  select segment_id,
         sum(amount)   as tahsilat,
         count(*)      as vade_sayisi,
         max(paid_on)  as son_tahsilat
  from payments
  where deleted_at is null
  group by segment_id
) t on t.segment_id = s.id
where s.deleted_at is null;

alter view segment_balances set (security_invoker = on);
grant select on segment_balances to authenticated;
revoke all on segment_balances from anon;

-- #############################################################################
-- 4) Yazma fonksiyonları
-- #############################################################################

-- Eski ad: 0014'te "elden alınan tutar" anlamındaydı, artık "anlaşılan".
drop function if exists segment_tutar_yaz(uuid, numeric);

create or replace function segment_anlasilan_yaz(
  p_segment_id uuid,
  p_tutar numeric
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_var integer;
begin
  if p_tutar is not null and p_tutar < 0 then
    raise exception 'Tutar negatif olamaz' using errcode = 'invalid_parameter_value';
  end if;

  select count(*) into v_var from segments
  where id = p_segment_id and deleted_at is null;
  if v_var = 0 then
    raise exception 'Segment bulunamadi' using errcode = 'no_data_found';
  end if;

  /* Fatura çakışması trigger'da; buradan geçen null tutarı temizliyor ve
     fatura yolunu tekrar açıyor. */
  update segments set agreed_amount = p_tutar where id = p_segment_id;
end;
$$;

revoke all on function segment_anlasilan_yaz(uuid, numeric) from anon, public;
grant execute on function segment_anlasilan_yaz(uuid, numeric) to authenticated;

-- -----------------------------------------------------------------------------
-- Tahsilat ekleme
--
-- Anlaşılan tutar girilmemişken de tahsilat kabul ediliyor: para
-- kağıttan önce gelebiliyor ve kullanıcıyı "önce şunu gir" diye
-- durdurmak sahada işi tıkıyor. Fazla tahsilat da reddedilmiyor —
-- avans, yuvarlama ve kur farkı gerçek; arayüz farkı gösteriyor.
-- -----------------------------------------------------------------------------
create or replace function tahsilat_ekle(
  p_segment_id uuid,
  p_tutar numeric,
  p_tarih date default current_date,
  p_not text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id  uuid;
  v_var integer;
begin
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Tahsilat tutari sifirdan buyuk olmali'
      using errcode = 'invalid_parameter_value';
  end if;

  /* Gelecek tarihli tahsilat reddediliyor: "alinan para"nin tanimi
     geriye donuk. Ileri tarihli bir vade PLANLANMIS odemedir ve bu
     sistem plan tutmuyor — gelir hesabina girse o ay olmayan para
     gelir gibi gorunurdu. */
  if p_tarih > current_date then
    raise exception 'Tahsilat tarihi gelecekte olamaz: %', p_tarih
      using errcode = 'invalid_parameter_value';
  end if;

  select count(*) into v_var from segments
  where id = p_segment_id and deleted_at is null;
  if v_var = 0 then
    raise exception 'Segment bulunamadi' using errcode = 'no_data_found';
  end if;

  insert into payments (segment_id, amount, paid_on, note)
  values (p_segment_id, p_tutar, coalesce(p_tarih, current_date),
          nullif(btrim(coalesce(p_not, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function tahsilat_ekle(uuid, numeric, date, text) from anon, public;
grant execute on function tahsilat_ekle(uuid, numeric, date, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Tahsilat düzeltme
--
-- Yanlış tutar ya da yanlış tarih girilmesi sık: tarih düzeltilebilmeli,
-- yoksa gelir yanlış aya yazılıyor ve düzeltmenin tek yolu kaydı silip
-- yeniden girmek olurdu (denetim günlüğünde iki gürültülü satır).
-- -----------------------------------------------------------------------------
create or replace function tahsilat_guncelle(
  p_id uuid,
  p_tutar numeric,
  p_tarih date,
  p_not text default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_etkilenen integer;
begin
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'Tahsilat tutari sifirdan buyuk olmali'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_tarih is null then
    raise exception 'Tahsilat tarihi girilmeli'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_tarih > current_date then
    raise exception 'Tahsilat tarihi gelecekte olamaz: %', p_tarih
      using errcode = 'invalid_parameter_value';
  end if;

  update payments
  set amount  = p_tutar,
      paid_on = p_tarih,
      note    = nullif(btrim(coalesce(p_not, '')), '')
  where id = p_id and deleted_at is null;

  get diagnostics v_etkilenen = row_count;
  if v_etkilenen = 0 then
    raise exception 'Tahsilat bulunamadi veya silinmis'
      using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function tahsilat_guncelle(uuid, numeric, date, text) from anon, public;
grant execute on function tahsilat_guncelle(uuid, numeric, date, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Segmentin tahsilat listesi
-- -----------------------------------------------------------------------------
create or replace function segment_tahsilatlari(p_segment_id uuid)
returns table (
  tahsilat_id uuid,
  tutar       numeric,
  tarih       date,
  not_        text,
  girildi     timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select id, amount, paid_on, note, created_at
  from payments
  where segment_id = p_segment_id and deleted_at is null
  /* Tarihe gore artan: vadeler olus sirasiyla okunmali ("1. vade,
     2. vade"). Ayni gune iki tahsilat girilirse created_at ayiriyor. */
  order by paid_on asc, created_at asc;
$$;

revoke all on function segment_tahsilatlari(uuid) from anon, public;
grant execute on function segment_tahsilatlari(uuid) to authenticated;

-- #############################################################################
-- 5) GEÇİŞ: mevcut kayıtlar tek vade olarak taşınıyor
--
-- 0014 öncesi sistem anlaşılan parayı tahsil edilmiş sayıyordu. Tahsilat
-- tablosu boş bırakılsa geçmiş dönem raporları SIFIR gelir gösterirdi —
-- veri kaybı gibi görünen, sessiz ve yanlış bir sonuç.
--
-- Bu yüzden her mevcut fatura ve elle girilmiş tutar için BİR vade
-- yazılıyor: eski sistemin varsaydığı şeyin aynısı, artık açıkça bir
-- kayıt olarak. Notu geçişten geldiğini söylüyor; gerçekte tahsil
-- edilmemiş olanlar panelden silinebiliyor.
--
-- Segmentinde zaten tahsilat olan kayıtlar atlanıyor: kurulum dosyası
-- baştan çalıştırıldığında para ikiye katlanmasın.
-- #############################################################################

insert into payments (segment_id, amount, paid_on, note)
select s.id, s.agreed_amount, s.segment_date,
       '0015 gecisi: eski "elden alinan tutar" kaydi tek vade olarak tasindi'
from segments s
where s.agreed_amount is not null
  and s.agreed_amount > 0
  and s.deleted_at is null
  and not exists (select 1 from payments p where p.segment_id = s.id);

insert into payments (segment_id, amount, paid_on, note)
select i.segment_id, sum(i.gross_amount), min(i.issue_date),
       '0015 gecisi: fatura tutari tek vade olarak tasindi'
from invoices i
where i.segment_id is not null
  and i.deleted_at is null
  and not exists (select 1 from payments p where p.segment_id = i.segment_id)
group by i.segment_id
having sum(i.gross_amount) > 0;

-- #############################################################################
-- 6) complete_job — tutar parametresi kalktı
--
-- İşin tamamlanmasıyla paranın bağı yok. Tutar iş sayfasından her zaman
-- düzenlenebilen bir NOT; tamamlama formunda tekrar sorulması aynı alanı
-- üçüncü bir yerden yazmak olurdu ve "tamamlarken girmezsem kaybolur mu"
-- sorusunu doğuruyordu.
-- #############################################################################

drop function if exists complete_job(uuid, service_type[], numeric, boolean);

create or replace function complete_job(
  p_job_id uuid,
  p_service_types service_type[],
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
  v_turler     service_type[];
begin
  if p_service_types is null or array_length(p_service_types, 1) is null then
    raise exception 'En az bir islem secilmeli: motor sarimi ve/veya revizyon'
      using errcode = 'invalid_parameter_value';
  end if;

  select array_agg(distinct t order by t) into v_turler
  from unnest(p_service_types) as t;

  select * into v_job from jobs where id = p_job_id for update;

  if not found or v_job.deleted_at is not null then
    raise exception 'Is bulunamadi: %', p_job_id using errcode = 'no_data_found';
  end if;

  if v_job.status = 'completed' then
    raise exception 'Is zaten tamamlanmis: %', p_job_id
      using errcode = 'invalid_parameter_value';
  end if;

  /* MALIYET DONDURMA — tamamlama anındaki fiyat (0014). */
  update job_products jp
  set unit_cost_snapshot = p.purchase_price
  from products p
  where jp.product_id = p.id
    and jp.job_id = p_job_id
    and jp.deleted_at is null;

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
      and jp.deleted_at is null
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

    insert into stock_movements (
      product_id, job_id, movement_type, qty_pieces_delta, qty_grams_delta, note
    )
    values (
      v_line.product_id, p_job_id, 'job_out',
      -v_line.qty_pieces_used,
      -v_line.qty_grams_used,
      'Is tamamlandi: ' || v_job.title
    );
  end loop;

  update jobs
  set status        = 'completed',
      completed_at  = now(),
      service_types = v_turler
  where id = p_job_id;

  insert into qr_codes (job_id) values (p_job_id)
  on conflict (job_id) do nothing;

  select token into v_token from qr_codes where job_id = p_job_id;

  return jsonb_build_object(
    'job_id', p_job_id,
    'qr_token', v_token,
    'service_types', v_turler,
    'material_lines', v_line_count
  );
end;
$$;

revoke all on function complete_job(uuid, service_type[], boolean) from anon, public;
grant execute on function complete_job(uuid, service_type[], boolean) to authenticated;

-- #############################################################################
-- 7) RAPORLAR: gelir tahsilat tarihinden
--
-- Değişen tek şey gelirin KAYNAĞI değil, TARİHİ: para hangi ay alındıysa
-- o ayın geliri. Anlaşılan tutar ayrıca dönülüyor ki "iş yaptım ama
-- tahsil etmedim" durumu kâr/zararda kayıp gibi görünmesin.
-- #############################################################################

create or replace function dashboard_summary(p_start date, p_end date)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with tahsilat as (
    select coalesce(sum(p.amount), 0)::numeric(14,2) as toplam,
           count(*)                                  as sayi
    from payments p
    join segments s on s.id = p.segment_id and s.deleted_at is null
    where p.deleted_at is null
      and p.paid_on between p_start and p_end
  ),
  /* ANLASILAN taraf segment_balances uzerinden okunuyor, dogrudan
     invoices/segments uzerinden DEGIL. Sebep: kalan alacak da ayni
     gorunumden geliyor ve iki rakamin birbirini tutmasi gerekiyor.
     Faturayi issue_date ile, segmenti segment_date ile saymak
     "anlasilan - tahsilat = kalan" esitligini bozuyordu; ustelik
     segmentsiz bir fatura (sema izin veriyor) anlasilana girip
     alacaga hic girmiyordu.
     Tek olcut: SEGMENT tarihi. Anlasma, isin birakildigi gun yapiliyor. */
  anlasilan as (
    select
      coalesce(sum(sb.anlasilan), 0)::numeric(14,2) as toplam,
      coalesce(sum(case when sb.fatura_sayisi > 0
                        then sb.anlasilan else 0 end), 0)::numeric(14,2) as faturali,
      coalesce(sum(case when sb.fatura_sayisi = 0
                        then coalesce(sb.anlasilan, 0) else 0 end), 0)::numeric(14,2) as elden,
      count(*) filter (where sb.fatura_sayisi = 0
                         and sb.elle_girilen is not null) as elden_sayisi
    from segment_balances sb
    where sb.segment_date between p_start and p_end
  ),
  /* Fatura rakamlari muhasebe icin ayrica duruyor ve olcutu FATURA
     TARIHI: vergi hangi ay beyan edilecekse o aya ait. Bilincli olarak
     yukaridakinden farkli bir eksen. */
  fatura as (
    select coalesce(sum(tax_amount), 0)::numeric(14,2) as vergi,
           count(*)                                     as sayi
    from invoices
    where issue_date between p_start and p_end
      and deleted_at is null
  ),
  /* Kalan alacak bir AKIS degil BAKIYE: donem sonu itibariyla acik olan
     borc. Aralik baslangici umursanmiyor, cunku 3 ay once anlasilip hala
     odenmemis para bugun de alacak.
     greatest(...,0): fazla tahsilat baska bir segmentin borcunu
     kapatmiyor. */
  bakiye as (
    select coalesce(sum(greatest(sb.kalan, 0)), 0)::numeric(14,2) as kalan
    from segment_balances sb
    where sb.segment_date <= p_end
      and sb.kalan is not null
  ),
  maliyet as (
    select coalesce(sum(jc.material_cost), 0)::numeric(14,2) as toplam
    from jobs j
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed'
      and j.completed_at::date between p_start and p_end
      and j.deleted_at is null
  ),
  isler as (
    select
      count(*) filter (where status = 'completed'
                         and completed_at::date between p_start and p_end) as tamamlanan,
      count(*) filter (where status <> 'completed')                        as acik
    from jobs
    where deleted_at is null
  )
  select jsonb_build_object(
    'baslangic', p_start,
    'bitis', p_end,
    /* NAKIT: donemde eline gecen para. Ana rakam. */
    'tahsilat', tahsilat.toplam,
    'tahsilat_sayisi', tahsilat.sayi,
    /* TAHAKKUK: donemde anlasilan toplam. Tahsil edilmis olmasi
       gerekmiyor; ikisinin farki kalan alacaga gidiyor. */
    'anlasilan_tutar', anlasilan.toplam,
    'faturali_anlasilan', anlasilan.faturali,
    'elden_anlasilan', anlasilan.elden,
    'fatura_sayisi', fatura.sayi,
    'elden_sayisi', anlasilan.elden_sayisi,
    'vergi', fatura.vergi,
    'kalan_alacak', bakiye.kalan,
    'malzeme_maliyeti', maliyet.toplam,
    /* Kar/zarar NAKIT esasli: tahsilat - malzeme gideri. */
    'kar_zarar', (tahsilat.toplam - maliyet.toplam)::numeric(14,2),
    'tamamlanan_is', isler.tamamlanan,
    'acik_is', isler.acik
  )
  from tahsilat, anlasilan, fatura, bakiye, maliyet, isler;
$$;

revoke all on function dashboard_summary(date, date) from anon, public;
grant execute on function dashboard_summary(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Aylık seyir — gelir sütunu artık tahsilat
--
-- `create or replace` dönüş kolonunun ADINI değiştiremiyor; önce
-- düşürülüyor. Ad değişmesi gerekiyordu: "net_gelir" fatura netini
-- çağırıyordu, gelen sayı artık tahsil edilen para.
-- -----------------------------------------------------------------------------
drop function if exists monthly_trend(integer);

create or replace function monthly_trend(p_ay_sayisi integer default 12)
returns table (
  donem date,
  tahsilat numeric,
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
    select date_trunc('month', p.paid_on)::date as ay, sum(p.amount) as tutar
    from payments p
    join segments s on s.id = p.segment_id and s.deleted_at is null
    where p.deleted_at is null
    group by 1
  ),
  maliyet as (
    select date_trunc('month', j.completed_at)::date as ay,
           sum(jc.material_cost) as tutar
    from jobs j
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed' and j.completed_at is not null
      and j.deleted_at is null
    group by 1
  )
  select
    a.donem,
    coalesce(g.tutar, 0)::numeric(14,2),
    coalesce(m.tutar, 0)::numeric(14,2),
    (coalesce(g.tutar, 0) - coalesce(m.tutar, 0))::numeric(14,2)
  from aylar a
  left join gelir g on g.ay = a.donem
  left join maliyet m on m.ay = a.donem
  order by a.donem;
$$;

revoke all on function monthly_trend(integer) from anon, public;
grant execute on function monthly_trend(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Müşteri bazlı kırılım — kalan alacak eklendi
--
-- "Kim bana ne kadar borçlu" bu geliştirmenin asıl karşılığı; raporda
-- görünmezse tahsilat takibi yine deftere kalır.
-- -----------------------------------------------------------------------------
drop function if exists dashboard_by_customer(date, date);

create or replace function dashboard_by_customer(p_start date, p_end date)
returns table (
  customer_id uuid,
  customer_name text,
  tahsilat numeric,
  malzeme_maliyeti numeric,
  kar_zarar numeric,
  kalan_alacak numeric,
  tamamlanan_is bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with gelir as (
    select s.customer_id, sum(p.amount) as tutar
    from payments p
    join segments s on s.id = p.segment_id and s.deleted_at is null
    where p.deleted_at is null
      and p.paid_on between p_start and p_end
    group by s.customer_id
  ),
  /* Alacak bakiyesi donem sonu itibariyla, aralik baslangicindan
     bagimsiz (bkz. dashboard_summary). */
  alacak as (
    select sb.customer_id, sum(greatest(sb.kalan, 0)) as tutar
    from segment_balances sb
    where sb.segment_date <= p_end and sb.kalan is not null
    group by sb.customer_id
  ),
  maliyet as (
    select s.customer_id, sum(jc.material_cost) as tutar, count(*) as is_sayisi
    from jobs j
    join segments s on s.id = j.segment_id
    join job_costs jc on jc.job_id = j.id
    where j.status = 'completed'
      and j.completed_at::date between p_start and p_end
      and j.deleted_at is null and s.deleted_at is null
    group by s.customer_id
  )
  select
    c.id, c.name,
    coalesce(g.tutar, 0)::numeric(14,2),
    coalesce(m.tutar, 0)::numeric(14,2),
    (coalesce(g.tutar, 0) - coalesce(m.tutar, 0))::numeric(14,2),
    coalesce(a.tutar, 0)::numeric(14,2),
    coalesce(m.is_sayisi, 0)
  from customers c
  left join gelir g   on g.customer_id = c.id
  left join alacak a  on a.customer_id = c.id
  left join maliyet m on m.customer_id = c.id
  where c.deleted_at is null
    and (g.tutar is not null or m.tutar is not null
         or coalesce(a.tutar, 0) > 0)
  order by (coalesce(g.tutar, 0) - coalesce(m.tutar, 0)) desc;
$$;

revoke all on function dashboard_by_customer(date, date) from anon, public;
grant execute on function dashboard_by_customer(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- monthly_summaries: bilinçli olarak dokunulmuyor
--
-- 0005'te gecelik önbellek olarak eklendi ama panelin hiçbir yeri onu
-- OKUMUYOR (dashboard_summary canlı hesaplıyor). Kolonları fatura
-- eksenli; tahsilata çevirmek kullanılmayan bir tablonun şemasını
-- değiştirmek olurdu. Yanlış okunmaması için işaretleniyor.
-- -----------------------------------------------------------------------------
comment on table monthly_summaries is
  'KULLANILMIYOR. 0005 onbellegi; rakamlari FATURA eksenli ve 0015 sonrasi '
  'gelir tanimiyla (tahsilat tarihi) ORTUSMUYOR. Panel dashboard_summary() '
  'ile canli hesapliyor. Rapor icin bu tabloya bakilmamali.';
