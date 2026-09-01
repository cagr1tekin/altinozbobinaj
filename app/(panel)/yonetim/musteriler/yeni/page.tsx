import { Icerik, Kart, UstCubuk } from "@/components/panel/ui";
import MusteriFormu from "@/components/panel/MusteriFormu";

export default function YeniMusteriSayfasi() {
  return (
    <>
      <UstCubuk
        baslik="Yeni Müşteri"
        geriHref="/yonetim/musteriler"
        geriEtiket="Müşteriler"
      />
      <Icerik>
        <p className="mb-4 text-sm text-pnl-muted">
          Yalnızca ad zorunlu. Diğer bilgiler sonradan eklenebilir.
        </p>
        <Kart>
          <MusteriFormu />
        </Kart>
      </Icerik>
    </>
  );
}
