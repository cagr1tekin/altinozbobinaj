import { SITE_URL } from "@/lib/supabase/env";
import { dosyaQrSvg } from "@/lib/qr";
import { oturumVarMi, yetkisiz } from "@/lib/pdf/yanit";

/**
 * QR görseli (SVG).
 *
 * Token'ın kendisi girdi olarak alınmıyor; iş id'si alınıp token
 * veritabanından okunuyor olsaydı ekstra sorgu gerekirdi. Bunun yerine
 * token doğrudan veriliyor ama uç oturum istiyor: token zaten yalnızca
 * panelde görünüyor ve QR görselinin kendisi de tahmin edilemez.
 *
 * SVG tercih edildi: etikette büyütülünce bozulmuyor ve dosya küçük.
 */
export async function GET(request: Request) {
  if (!(await oturumVarMi())) return yetkisiz();

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token || !/^[0-9a-f]{32}$/.test(token)) {
    return new Response("Geçersiz token.", { status: 400 });
  }

  const url = `${SITE_URL}/j/${token}`;

  /* Tek başına servis edilen dosya: ölçüsü kendi içinde olmalı,
     çünkü onu saran bir CSS yok. */
  const svg = await dosyaQrSvg(url);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
