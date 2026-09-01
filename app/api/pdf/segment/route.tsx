import { SegmentBelgesi } from "@/lib/pdf/belgeler";
import { segmentVerisi } from "@/lib/pdf/veri";
import {
  bulunamadi,
  dosyaAdi,
  oturumVarMi,
  pdfYanit,
  yetkisiz,
} from "@/lib/pdf/yanit";

export async function GET(request: Request) {
  if (!(await oturumVarMi())) return yetkisiz();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return bulunamadi();

  const maliyetGoster = searchParams.get("maliyet") !== "0";

  const veri = await segmentVerisi(id);
  if (!veri) return bulunamadi();

  return pdfYanit(
    (
      <SegmentBelgesi
        musteri={veri.musteri}
        segment={veri.segment}
        maliyetGoster={maliyetGoster}
      />
    ),
    dosyaAdi(["segment", veri.musteri.ad, veri.segment.tarih])
  );
}
