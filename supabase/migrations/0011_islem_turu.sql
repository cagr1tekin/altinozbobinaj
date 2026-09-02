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
