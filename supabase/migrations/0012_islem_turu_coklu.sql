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
