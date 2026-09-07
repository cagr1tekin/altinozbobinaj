import { IsBelgesi } from "@/lib/pdf/belgeler";
import { isVerisi } from "@/lib/pdf/veri";
import {
  bulunamadi,
  dosyaAdi,
  icKopyaMi,
  oturumVarMi,
  pdfYanit,
  yetkisiz,
} from "@/lib/pdf/yanit";
import { SITE_URL } from "@/lib/supabase/env";
import { denetimPdfKaydet } from "@/lib/denetim";

export async function GET(request: Request) {
  if (!(await oturumVarMi())) return yetkisiz();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return bulunamadi();

  /* Müşteri kopyasında maliyet, malzeme MİKTARI ve alınan tutar birlikte
     gizleniyor — hepsi ticari bilgi (bkz. belgeler.tsx). */
  const icKopya = icKopyaMi(request.url);

  const veri = await isVerisi(id);
  if (!veri) return bulunamadi();

  const qrUrl = veri.is.qrToken ? `${SITE_URL}/j/${veri.is.qrToken}` : null;

  /* PDF alma bir satırı değiştirmiyor, trigger göremiyor; açıkça bildiriliyor. */
  await denetimPdfKaydet("job", id, veri.is.baslik, {
    musteri: veri.musteri.ad,
    ic_kopya: icKopya,
  });

  return pdfYanit(
    (
      <IsBelgesi
        musteri={veri.musteri}
        segment={veri.segment}
        is={veri.is}
        icKopya={icKopya}
        qrUrl={qrUrl}
      />
    ),
    dosyaAdi(["is", veri.musteri.ad, veri.is.baslik])
  );
}
