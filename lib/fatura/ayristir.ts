/**
 * e-Fatura PDF ayrıştırıcı.
 *
 * Neden OCR yok? Yüklenen belgeler e-fatura sağlayıcısından inen dijital
 * PDF'ler ve metin katmanları var. Metni doğrudan okumak, görüntü tanımaya
 * göre hem kesin hem ücretsiz. Taranmış/fotoğraflanmış bir fatura gelirse
 * metin çıkmayacağı için ayrıştırma başarısız olur ve kullanıcı uyarılır —
 * sessizce yanlış rakam kaydetmektense okuyamadığını söylemek doğru.
 */

export type FaturaAlanlari = {
  faturaNo: string | null;
  ettn: string | null;
  tarih: string | null; // YYYY-MM-DD
  netTutar: number | null;
  vergiTutar: number | null;
  brutTutar: number | null;
  aliciUnvan: string | null;
};

export type AyristirmaSonucu =
  | { durum: "ok"; alanlar: FaturaAlanlari; hamMetin: string }
  | { durum: "hata"; mesaj: string; hamMetin?: string };

/**
 * Türkçe biçimli tutarı sayıya çevirir: "78.605,00" → 78605
 * Nokta binlik ayırıcı, virgül ondalık ayırıcı.
 */
export function tutarCevir(ham: string): number | null {
  const temiz = ham.trim().replace(/\s/g, "");
  if (!/^[\d.,]+$/.test(temiz)) return null;
  const sayi = Number(temiz.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(sayi) ? sayi : null;
}

/**
 * e-Fatura tarih biçimi: GGAAYYYY, ayırıcısız (örn. 27082026).
 * Gün/ay sırası iki örnek faturayla doğrulandı (27 > 12 olduğu için
 * sıralama kesin).
 */
export function tarihCevir(ham: string): string | null {
  const m = ham.trim().match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return null;
  const [, gg, aa, yyyy] = m;
  const gun = Number(gg);
  const ay = Number(aa);
  if (ay < 1 || ay > 12 || gun < 1 || gun > 31) return null;

  const tarih = new Date(Date.UTC(Number(yyyy), ay - 1, gun));
  // Ay taşması kontrolü (31 Şubat gibi)
  if (tarih.getUTCMonth() !== ay - 1 || tarih.getUTCDate() !== gun) return null;

  return `${yyyy}-${aa}-${gg}`;
}

/** PDF metninden fatura alanlarını çıkarır. */
export function metinAyristir(metin: string): FaturaAlanlari {
  const tek = metin.replace(/\s+/g, " ");

  const yakala = (kalip: RegExp): string | null => {
    const m = tek.match(kalip);
    return m ? m[1].trim() : null;
  };

  const tutarYakala = (kalip: RegExp): number | null => {
    const ham = yakala(kalip);
    return ham ? tutarCevir(ham) : null;
  };

  const tarihHam = yakala(/Fatura Tarihi:\s*(\d{8})/i);

  /* Alıcı ünvanı "SAYIN" ile başlıyor ve adresle devam ediyor.
     Adres başlangıcını kestirmek için ilk adres anahtar kelimesinde
     kesiyoruz; bulunamazsa ilk 80 karakter alınıyor. */
  const sayinBlok = yakala(/SAYIN\s+(.{3,160}?)(?:\s+(?:MAH\.|MAHALLE|CAD\.|CADDE|SOK\.|SOKAK|SK\.|No:|OSB|ORGANİZE|SANAYİ|SARAÇ|ESKI|ESKİ)|$)/i);

  return {
    faturaNo: yakala(/Fatura No:\s*([A-Z0-9]{6,})/i),
    ettn: yakala(/ETTN:\s*([0-9a-f]{32})/i),
    tarih: tarihHam ? tarihCevir(tarihHam) : null,
    /* "Mal Hizmet Toplam Tutarı" = KDV matrahı = net.
       "Vergiler Dahil Toplam Tutar" = brüt. */
    netTutar: tutarYakala(/Mal Hizmet Toplam Tutar[ıi]\s*([\d.,]+)\s*TL/i),
    vergiTutar: tutarYakala(/Hesaplanan KDV\s*\(?%?\d*\)?\s*([\d.,]+)\s*TL/i),
    brutTutar: tutarYakala(/Vergiler Dahil Toplam Tutar\s*([\d.,]+)\s*TL/i),
    aliciUnvan: sayinBlok ? sayinBlok.replace(/\s+/g, " ").trim() : null,
  };
}

/**
 * Ayrıştırma sonucunu doğrular.
 *
 * Otomatik kaydetme yapıldığı için burada sıkı davranıyoruz: eksik ya da
 * tutarsız bir fatura sessizce kaydedilirse kâr/zarar raporu yanlış olur
 * ve bu fark edilmez. Şüpheli durumda kaydetmemek, yanlış kaydetmekten iyi.
 */
export function alanlariDogrula(a: FaturaAlanlari): string | null {
  if (a.netTutar === null || a.brutTutar === null) {
    return "Fatura tutarları okunamadı. Bu bir e-Fatura PDF'i mi? Taranmış veya fotoğraflanmış belgeler okunamaz.";
  }
  if (a.brutTutar <= 0) {
    return "Fatura toplamı sıfır veya negatif okundu.";
  }
  if (a.netTutar > a.brutTutar) {
    return "Okunan net tutar brüt tutardan büyük; belge beklenen biçimde değil.";
  }

  const vergi = a.vergiTutar ?? 0;
  /* Kuruş yuvarlamaları için 1 kuruş tolerans. Bu kontrol tutmuyorsa
     yanlış alan okunmuş demektir. */
  if (Math.abs(a.brutTutar - (a.netTutar + vergi)) > 0.01) {
    return `Tutarlar tutarsız okundu (net ${a.netTutar} + KDV ${vergi} ≠ brüt ${a.brutTutar}). Fatura kaydedilmedi.`;
  }
  if (!a.tarih) {
    return "Fatura tarihi okunamadı.";
  }
  return null;
}

/**
 * PDF dosyasından metni çıkarır.
 *
 * pdfjs'in legacy derlemesi kullanılıyor: sunucu tarafında DOM ve canvas
 * gerektirmiyor, yalnızca metin katmanı okunuyor.
 */
export async function pdfMetniCikar(veri: Uint8Array): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const belge = await getDocument({
    data: veri,
    useSystemFonts: false,
    // Sunucuda çalışırken worker gereksiz; ana iş parçacığında okunuyor
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  let metin = "";
  for (let s = 1; s <= belge.numPages; s++) {
    const sayfa = await belge.getPage(s);
    const icerik = await sayfa.getTextContent();
    metin +=
      icerik.items
        .map((i) => ("str" in i ? i.str : ""))
        .join(" ") + "\n";
  }

  await belge.destroy();
  return metin;
}

/** Uçtan uca: PDF baytları → doğrulanmış fatura alanları. */
export async function faturaOku(veri: Uint8Array): Promise<AyristirmaSonucu> {
  let metin: string;
  try {
    metin = await pdfMetniCikar(veri);
  } catch {
    return {
      durum: "hata",
      mesaj: "PDF açılamadı. Dosya bozuk veya şifreli olabilir.",
    };
  }

  if (metin.trim().length < 50) {
    return {
      durum: "hata",
      mesaj:
        "PDF'te metin bulunamadı. Taranmış veya fotoğraflanmış belgeler okunamıyor; e-fatura sağlayıcınızdan indirdiğiniz PDF'i yükleyin.",
      hamMetin: metin,
    };
  }

  const alanlar = metinAyristir(metin);
  const hata = alanlariDogrula(alanlar);
  if (hata) return { durum: "hata", mesaj: hata, hamMetin: metin };

  return { durum: "ok", alanlar, hamMetin: metin };
}
