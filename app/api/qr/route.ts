import QRCode from "qrcode";
import { SITE_URL } from "@/lib/supabase/env";
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

  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
