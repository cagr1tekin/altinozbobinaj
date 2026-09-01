"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Phone, MessageCircle } from "lucide-react";

const PHONE = "+905425918372";
const WHATSAPP_MESSAGE = encodeURIComponent(
  "Merhaba, bobinaj hizmetleriniz hakkında bilgi almak istiyorum."
);
const WHATSAPP_URL = `https://wa.me/905425918372?text=${WHATSAPP_MESSAGE}`;

/**
 * Mobilde ekranın altına sabitlenen çağrı barı.
 * Trafiğin çoğu yerel mobil aramadan geliyor ve dönüşüm telefon görüşmesi;
 * Hero'daki CTA ilk ekrandan sonra kaybolduğu için bar Hero geçildiğinde
 * devreye giriyor.
 */
/** Hero'nun altı bu eşiğin üstüne çıktığında bar beliriyor. */
const ESIK = 120;

export default function MobileCallBar() {
  const [isVisible, setIsVisible] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero) return;

    /* Mount anındaki konumu doğrudan ölç.
       Yalnızca IntersectionObserver'a güvenmek yetmiyordu: kullanıcı sayfa
       yüklenirken (hydration tamamlanmadan) hızlıca aşağı kaydırırsa,
       observer kurulduğunda ilk callback gecikiyor ve bar hiç belirmiyordu.
       Bu ölçüm o boşluğu kapatıyor. */
    const konumuDegerlendir = () => {
      const r = hero.getBoundingClientRect();
      setIsVisible(r.bottom <= ESIK);
    };
    konumuDegerlendir();

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Hero ekrandan çıktığında göster
        setIsVisible(!entry.isIntersecting);
      },
      { rootMargin: `-${ESIK}px 0px 0px 0px`, threshold: 0 }
    );

    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { y: "100%" }}
          animate={shouldReduceMotion ? { opacity: 1 } : { y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { y: "100%" }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-ink/95 backdrop-blur-md md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-stretch gap-2 px-3 py-3">
            <a
              href={`tel:${PHONE}`}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-silver-cta text-base font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-light"
            >
              <Phone className="h-5 w-5" aria-hidden="true" />
              Hemen Ara
            </a>

            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-silver-main text-base font-semibold text-silver-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-light"
              aria-label="WhatsApp üzerinden yaz (yeni sekmede açılır)"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              WhatsApp
            </a>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
