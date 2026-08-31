import { IsBelgesi } from "@/lib/pdf/belgeler";
import { isVerisi } from "@/lib/pdf/veri";
import {
  bulunamadi,
  dosyaAdi,
  oturumVarMi,
  pdfYanit,
  yetkisiz,
} from "@/lib/pdf/yanit";
import { SITE_URL } from "@/lib/supabase/env";

export async function GET(request: Request) {
  if (!(await oturumVarMi())) return yetkisiz();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return bulunamadi();

  /* Alış fiyatı yalnızca iç kullanım içindir; müşteriye verilecek
     çıktıda maliyet=0 ile gizleniyor (PRD 5.6 ile aynı gerekçe). */
  const maliyetGoster = searchParams.get("maliyet") !== "0";

  const veri = await isVerisi(id);
  if (!veri) return bulunamadi();

  const qrUrl = veri.is.qrToken ? `${SITE_URL}/j/${veri.is.qrToken}` : null;

  return pdfYanit(
    (
      <IsBelgesi
        musteri={veri.musteri}
        segment={veri.segment}
        is={veri.is}
        maliyetGoster={maliyetGoster}
        qrUrl={qrUrl}
      />
    ),
    dosyaAdi(["is", veri.musteri.ad, veri.is.baslik])
  );
}
