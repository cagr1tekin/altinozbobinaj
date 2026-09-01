import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { isSupabaseConfigured } from "./env";

/** Girişsiz erişilebilen panel yolları */
const PUBLIC_PANEL_PATHS = ["/giris"];

/**
 * Oturum çerezlerini yeniler ve /yonetim altını korur.
 *
 * Not: Bu kontrol tek başına güvenlik sınırı DEĞİL. Gerçek sınır
 * veritabanındaki RLS politikaları; middleware yalnızca kullanıcıyı
 * giriş sayfasına yönlendiren bir kolaylık katmanı.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Supabase henüz yapılandırılmadıysa middleware'i çökertmeyelim:
  // /yonetim sayfası kurulum talimatını kendisi gösteriyor.
  if (!isSupabaseConfigured()) {
    return response;
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // getUser() çerezi sunucuda doğruluyor; getSession() istemciden gelen
  // çerezi doğrulamadan okuduğu için koruma amacıyla kullanılmamalı.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPanel = pathname.startsWith("/yonetim");
  const isPublicPanelPath = PUBLIC_PANEL_PATHS.some((p) =>
    pathname.startsWith(p)
  );

  if (isPanel && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    // Giriş sonrası kullanıcıyı gitmek istediği sayfaya döndürmek için
    url.searchParams.set("devam", pathname);
    return NextResponse.redirect(url);
  }

  if (isPublicPanelPath && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/yonetim";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
