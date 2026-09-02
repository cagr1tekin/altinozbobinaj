import QRCode from "qrcode";

/**
 * QR kodu üretimi.
 *
 * İki farklı kullanım var ve ölçü davranışı farklı olmak zorunda:
 *
 *  - `etiketQrSvg` sayfaya gömülüyor. SVG'ye width/height ÖZNİTELİĞİ
 *    basılmamalı: öznitelik CSS'ten önce geldiği için kod kabına sığmayıp
 *    taşıyor ve yanındaki metnin üstüne biniyor. (Ölçüldü: 150px kapta
 *    360px'lik SVG → 210px taşma.) Ölçü, kullanan sayfada CSS ile veriliyor.
 *
 *  - `dosyaQrSvg` tek başına indirilen/servis edilen dosya. Orada CSS yok,
 *    o yüzden ölçünün SVG'nin içinde olması gerekiyor.
 */

/** QR standardı kenarda sessiz bir bant istiyor.
 *  0 olduğunda bazı okuyucular etiketin kenarındaki baskıyı desenin
 *  parçası sanıp okumayı reddediyor. */
const SESSIZ_BANT = 1;

const ORTAK = {
  type: "svg",
  errorCorrectionLevel: "M",
  color: { dark: "#000000", light: "#ffffff" },
} as const;

/** Sayfaya gömülecek QR — ölçüsünü CSS belirler. */
export async function etiketQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...ORTAK, margin: SESSIZ_BANT });
}

/** Tek başına servis edilecek QR — ölçüsü kendi içinde. */
export async function dosyaQrSvg(url: string, genislik = 512): Promise<string> {
  return QRCode.toString(url, {
    ...ORTAK,
    margin: SESSIZ_BANT,
    width: genislik,
  });
}
