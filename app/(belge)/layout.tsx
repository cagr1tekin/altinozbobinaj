import type { Metadata, Viewport } from "next";

/**
 * Müşteriye açık belge kabuğu.
 *
 * Neden ne panel ne de pazarlama grubunda?
 *
 *  - PANEL değil: bu sayfayı personel değil müşteri görüyor. Panelin açık
 *    teması ve `pnl-` tokenları atölyede hızlı kullanım için tasarlandı;
 *    müşteri belgesinin işi marka izlenimi bırakmak. Sayfa panelin içinde
 *    duruyordu ama bu bilinçli bir karar değildi — klasör olarak orada
 *    olduğu için öyle görünüyordu.
 *
 *  - PAZARLAMA grubu değil: o layout başlık ve footer'ı getiriyor.
 *    Başlıktaki menü `#hizmetler` gibi çapa bağlantıları kullanıyor ve
 *    `scrollToSection` hedefi bulamazsa hiçbir şey yapmıyor; ana sayfa
 *    dışında o linkler tıklanıp tepki vermeyen ölü bağlantılara dönüşür.
 *    Mobil çağrı barı da `#hero` arıyor, burada yok.
 *
 * Bu yüzden ayrı bir kabuk: pazarlama sitesinin RENK ve FONT dili, ama
 * pazarlama gezinmesi olmadan. Müşteri bir belge gördüğünü hissediyor,
 * reklam sayfası değil.
 *
 * Fontlar kök layout'ta yüklü (Plus Jakarta / Playfair), ek indirme yok.
 */
export const metadata: Metadata = {
  title: "İşinizde Kullanılan Malzemeler | Altınöz Bobinaj",
  /* Token tahmin edilemez ama yine de indekslenmemeli: her belge tek bir
     müşteriye ait. */
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  /* Pazarlama sitesiyle aynı koyu tema; panelin açık teması değil. */
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function BelgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-ink font-sans text-paper antialiased">
      {children}
    </div>
  );
}
