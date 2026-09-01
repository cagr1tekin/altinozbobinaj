import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Server Component / Server Action / Route Handler için Supabase istemcisi.
 *
 * Oturum çerezleri üzerinden taşınıyor; sorgular kullanıcının kendi
 * yetkisiyle (authenticated rolü) çalışıyor, yani RLS politikaları geçerli.
 * Service role anahtarı bilinçli olarak hiç kullanılmıyor — RLS'i baypas
 * eden bir anahtarı uygulamaya sokmak, tüm yetki modelini anlamsız kılar.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component'ten çağrıldığında cookie yazılamıyor; oturum
          // yenilemesi middleware'de yapıldığı için bu durum güvenli.
        }
      },
    },
  });
}
