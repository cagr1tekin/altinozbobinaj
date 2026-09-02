-- Supabase'in sağladığı ama düz Postgres'te bulunmayan roller.
-- Yalnızca migration'ları yerel olarak doğrulamak için; Supabase'e
-- uygulanmaz (orada bu roller hazır gelir).
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;

do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase, public semasinda olusturulan TUM fonksiyonlari otomatik olarak
-- anon/authenticated rollerine grant ediyor. Yetki testlerinin gercekci
-- olmasi icin ayni varsayilan burada da kuruluyor.
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- auth semasi taklidi
--
-- Supabase'de auth.uid() ve auth.jwt() mevcut; denetim (audit) trigger'i her
-- yazmada bunlari cagiriyor. Yerelde olmazsa trigger patlar ve audit edilen
-- her tabloya insert basarisiz olur. Gercek imzalara yakin bir taklit:
-- degerler `set request.jwt.claims` ile verilebiliyor, verilmezse null.
-- -----------------------------------------------------------------------------
create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable as $$
  -- Supabase claims'i tek JSON olarak veriyor; eski projelerde ayri ayarda.
  -- Ikisi de destekleniyor ki testler gercekcı olsun.
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

grant usage on schema auth to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- auth.users taklidi
--
-- Supabase'de bu tabloyu GoTrue yonetiyor. Signup engeli trigger'i buna
-- baglandigi icin yerelde de bir karsiligi olmali; yoksa engel hic test
-- edilemez ve canliya dogrulanmamis gider. Yalnizca trigger'in ihtiyac
-- duydugu kolonlar var.
-- -----------------------------------------------------------------------------
create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);
