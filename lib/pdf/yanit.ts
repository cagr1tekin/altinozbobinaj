import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * PDF route'ları için ortak yardımcılar.
 *
 * PDF'ler talep üzerine üretiliyor ve doğrudan yanıt gövdesinde
 * dönüyor — Supabase Storage'a yazıp imzalı link vermek PRD'de öneri
 * olarak geçiyor ama burada gereksiz bir tur: belgeler küçük, anlık
 * üretiliyor ve saklanmalarına ihtiyaç yok. Storage gerekirse
 * pdf_exports tablosu ve şema zaten hazır.
 */

/** Oturum kontrolü. PDF'ler ticari bilgi içerdiği için girişsiz açılmamalı. */
export async function oturumVarMi(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

/** Dosya adında sorun çıkaracak karakterleri temizler. */
export function dosyaAdi(parcalar: (string | null | undefined)[]): string {
  const temiz = parcalar
    .filter(Boolean)
    .join("-")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s")
    .replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${temiz || "belge"}.pdf`;
}

export async function pdfYanit(
  belge: ReactElement<DocumentProps>,
  ad: string
): Promise<Response> {
  const buffer = await renderToBuffer(belge);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      // inline: tarayıcıda önizlenir, kullanıcı isterse kaydeder
      "Content-Disposition": `inline; filename="${ad}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function yetkisiz(): Response {
  return new Response("Bu belgeyi görüntülemek için giriş yapmalısınız.", {
    status: 401,
  });
}

export function bulunamadi(): Response {
  return new Response("Kayıt bulunamadı.", { status: 404 });
}
