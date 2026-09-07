import { MusteriBelgesi } from "@/lib/pdf/belgeler";
import { musteriVerisi } from "@/lib/pdf/veri";
import { denetimPdfKaydet } from "@/lib/denetim";
import { aralikEtiketi, gecerliTarih } from "@/lib/donem";
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

  /* Tarih aralığı opsiyonel. Yarım ya da ters bir aralık sessizce tüm
     geçmişi getirmiyor, reddediliyor: kullanıcı aralık verdiyse
     sınırlamak istiyor ve beklediğinden fazlasını içeren bir belgeyi
     müşteriye vermek gerçek bir sızıntı olurdu. */
  const bas = searchParams.get("bas");
  const bit = searchParams.get("bit");
  const aralikVar = bas !== null || bit !== null;

  if (aralikVar && !(gecerliTarih(bas) && gecerliTarih(bit) && bas! <= bit!)) {
    return new Response(
      "Geçerli bir tarih aralığı belirtin (başlangıç bitişten sonra olamaz).",
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const aralik = aralikVar
    ? { baslangic: bas!, bitis: bit! }
    : undefined;

  const veri = await musteriVerisi(id, aralik);
  if (!veri) return bulunamadi();

  await denetimPdfKaydet("customer", id, veri.musteri.ad, {
    segment_sayisi: veri.segmentler.length,
    ic_kopya: icKopya,
    ...(aralik ? { bas: aralik.baslangic, bit: aralik.bitis } : {}),
  });

  return pdfYanit(
    (
      <MusteriBelgesi
        musteri={veri.musteri}
        segmentler={veri.segmentler}
        icKopya={icKopya}
        aralikEtiketi={aralik ? aralikEtiketi(aralik) : undefined}
      />
    ),
    dosyaAdi(
      aralik
        ? ["musteri", veri.musteri.ad, aralik.baslangic, aralik.bitis]
        : ["musteri", veri.musteri.ad]
    )
  );
}
