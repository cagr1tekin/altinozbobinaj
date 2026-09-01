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
