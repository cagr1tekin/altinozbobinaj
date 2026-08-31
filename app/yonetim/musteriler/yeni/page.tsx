import { BolumBasligi, Kart } from "@/components/yonetim/ui";
import MusteriFormu from "@/components/yonetim/MusteriFormu";

export default function YeniMusteriSayfasi() {
  return (
    <>
      <BolumBasligi
        baslik="Yeni Müşteri"
        aciklama="Yalnızca ad zorunlu; diğer alanlar sonradan doldurulabilir."
      />
      <Kart className="max-w-2xl">
        <MusteriFormu />
      </Kart>
    </>
  );
}
