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
