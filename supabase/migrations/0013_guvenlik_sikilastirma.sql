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
