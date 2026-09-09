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
