import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * Yalnızca panel ve giriş sayfasında çalışır. Landing page tamamen
   * statik; her isteğe Supabase oturum kontrolü eklemek onu gereksiz
   * yere dinamik hale getirir ve TTFB'yi yükseltir.
   */
  matcher: ["/yonetim/:path*", "/giris"],
};
