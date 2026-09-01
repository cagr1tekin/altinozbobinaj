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
