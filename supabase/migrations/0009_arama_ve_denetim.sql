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
