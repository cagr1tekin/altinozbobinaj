/**
 * Tarih aralığı çözümlemesi.
 *
 * Üç yerden kullanılıyor (Özet, Raporlar, PDF route'ları) ve üçünün aynı
 * kuralı uygulaması gerekiyor: aynı bağlantı üç ekranda farklı aralık
 * verirse hangisinin doğru olduğu anlaşılmaz.
 */

export const DONEMLER = [
  { deger: "ay", etiket: "1 ay", ay: 1 },
  { deger: "ceyrek", etiket: "3 ay", ay: 3 },
  { deger: "yil", etiket: "1 yıl", ay: 12 },
] as const;

/** Varsayılan dönem: son 1 ay. */
export const VARSAYILAN_DONEM = "ay";

export type Aralik = { baslangic: string; bitis: string };

const TARIH_BICIMI = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ISO tarih, YEREL saate göre.
 *
 * `toISOString()` kullanılmıyor: UTC'ye kaydırıyor ve Türkiye'de gece
 * yarısından önce bir gün geriye atıyor — "bugün" filtresi dünü
 * gösteriyordu.
 */
export function isoTarih(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

export function gecerliTarih(v?: string | null): boolean {
  return Boolean(v && TARIH_BICIMI.test(v));
}

function donemAralik(donem: string): Aralik {
  const bugun = new Date();
  const ay =
    DONEMLER.find((d) => d.deger === donem)?.ay ??
    DONEMLER.find((d) => d.deger === VARSAYILAN_DONEM)!.ay;
  const bas = new Date(bugun);
  bas.setMonth(bas.getMonth() - ay);
  return { baslangic: isoTarih(bas), bitis: isoTarih(bugun) };
}

/**
 * Sorgu parametrelerinden aralığı çözer.
 *
 * Serbest tarihler hazır dönemi geçersiz kılıyor ama YALNIZCA ikisi de
 * geçerli ve sıralıysa. Yarım ya da ters bir aralıkta sessizce boş sonuç
 * göstermek yerine varsayılana dönülüyor: kullanıcı "hiç kayıt yok"
 * sanıp veri kaybı olduğunu düşünüyordu.
 */
export function aralikCoz({
  donem,
  bas,
  bit,
}: {
  donem?: string;
  bas?: string;
  bit?: string;
}): Aralik & { donem: string; serbest: boolean } {
  if (gecerliTarih(bas) && gecerliTarih(bit) && bas! <= bit!) {
    return { baslangic: bas!, bitis: bit!, donem: "serbest", serbest: true };
  }
  const secili = DONEMLER.some((d) => d.deger === donem)
    ? donem!
    : VARSAYILAN_DONEM;
  return { ...donemAralik(secili), donem: secili, serbest: false };
}

/** Aralığı insan diline çevirir: rapor başlıklarında ve PDF'te kullanılıyor. */
export function aralikEtiketi(aralik: Aralik): string {
  const bicim = (t: string) => t.split("-").reverse().join(".");
  return `${bicim(aralik.baslangic)} – ${bicim(aralik.bitis)}`;
}
