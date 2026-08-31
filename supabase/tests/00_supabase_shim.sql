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
