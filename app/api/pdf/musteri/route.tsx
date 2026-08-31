import { MusteriBelgesi } from "@/lib/pdf/belgeler";
import { musteriVerisi } from "@/lib/pdf/veri";
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

  const veri = await musteriVerisi(id);
  if (!veri) return bulunamadi();

  return pdfYanit(
    (
      <MusteriBelgesi
        musteri={veri.musteri}
        segmentler={veri.segmentler}
        maliyetGoster={maliyetGoster}
      />
    ),
    dosyaAdi(["musteri", veri.musteri.ad])
  );
}
