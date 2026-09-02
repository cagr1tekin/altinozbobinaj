import { DonemRaporu } from "@/lib/pdf/belgeler";
import { donemVerisi } from "@/lib/pdf/veri";
import { dosyaAdi, oturumVarMi, pdfYanit, yetkisiz } from "@/lib/pdf/yanit";
import { denetimPdfKaydet } from "@/lib/denetim";

const TARIH = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  if (!(await oturumVarMi())) return yetkisiz();

  const { searchParams } = new URL(request.url);
  const bas = searchParams.get("bas");
  const bit = searchParams.get("bit");

  if (!bas || !bit || !TARIH.test(bas) || !TARIH.test(bit) || bas > bit) {
    return new Response("Geçerli bir tarih aralığı belirtin.", { status: 400 });
  }

  const veri = await donemVerisi(bas, bit);
  if (!veri) {
    return new Response(
      "Dönem raporu üretilemedi. 0004 numaralı migration'ın uygulandığını kontrol edin.",
      { status: 500 }
    );
  }

  /* Dönem raporu bir kayda bağlı değil: entity_id null, aralık ayrıntıda. */
  await denetimPdfKaydet("report", null, `Dönem raporu ${bas} — ${bit}`, {
    bas,
    bit,
  });

  return pdfYanit(
    (
      <DonemRaporu
        baslangic={bas}
        bitis={bit}
        ozet={veri.ozet}
        musteriler={veri.musteriler}
      />
    ),
    dosyaAdi(["donem-raporu", bas, bit])
  );
}
