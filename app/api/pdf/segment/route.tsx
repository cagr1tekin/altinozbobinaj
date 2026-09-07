import { SegmentBelgesi } from "@/lib/pdf/belgeler";
import { segmentVerisi } from "@/lib/pdf/veri";
import { denetimPdfKaydet } from "@/lib/denetim";
import {
  bulunamadi,
  dosyaAdi,
  icKopyaMi,
  oturumVarMi,
  pdfYanit,
  yetkisiz,
} from "@/lib/pdf/yanit";

export async function GET(request: Request) {
  if (!(await oturumVarMi())) return yetkisiz();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return bulunamadi();

  const icKopya = icKopyaMi(request.url);

  const veri = await segmentVerisi(id);
  if (!veri) return bulunamadi();

  await denetimPdfKaydet("segment", id, veri.segment.tarih, {
    musteri: veri.musteri.ad,
    ic_kopya: icKopya,
  });

  return pdfYanit(
    (
      <SegmentBelgesi
        musteri={veri.musteri}
        segment={veri.segment}
        icKopya={icKopya}
      />
    ),
    dosyaAdi(["segment", veri.musteri.ad, veri.segment.tarih])
  );
}
