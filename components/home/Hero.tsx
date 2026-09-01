"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Phone } from "lucide-react";
import { handleAnchorClick } from "@/lib/scroll";
import { fadeUp, fadeInRight, staggerContainer } from "@/lib/motion";

export default function Hero() {
  const shouldReduceMotion = useReducedMotion();
  const initial = shouldReduceMotion ? false : "hidden";

  return (
    <section
      id="hero"
      className="relative flex items-center overflow-hidden bg-ink py-16 lg:min-h-[760px] lg:py-20"
    >
      <div className="container relative mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
          {/* Sol Taraf: Metin İçeriği */}
          <motion.div
            variants={staggerContainer}
            initial={initial}
            animate="visible"
            className="space-y-6"
          >
            {/* H1 Başlık */}
            <motion.h1
              variants={fadeUp}
              className="font-display text-4xl font-bold leading-tight text-paper sm:text-5xl md:text-5xl lg:text-6xl"
            >
              1976&apos;dan Günümüze{" "}
              <span className="bg-silver-gradient bg-clip-text text-transparent">
                Altınöz Bobinaj
              </span>
            </motion.h1>

            {/* Açıklama Metni */}
            <motion.p
              variants={fadeUp}
              className="text-base leading-relaxed text-paper-muted sm:text-lg md:text-xl"
            >
              Yarım asra yaklaşan tecrübemizle, endüstriyel elektrik motorlarının
              sarımı, bakımı ve onarımında Türkiye&apos;nin güvenilir çözüm
              ortağıyız. Geleneksel ustalığı modern teknolojiyle birleştirerek,
              işletmenizin kalbi olan motorlarınıza ilk günkü performansını
              kazandırıyoruz. Sadece tamir etmiyor, geleceğe hazırlıyoruz.
            </motion.p>

            {/* Butonlar */}
            <motion.div
              variants={fadeUp}
              className="flex flex-col gap-4 sm:flex-row sm:gap-6"
            >
              {/* Hizmetlerimiz Butonu */}
              <Link
                href="#hizmetler"
                onClick={(e) => handleAnchorClick(e, "#hizmetler")}
                className="group flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-silver-cta px-8 py-3.5 text-base font-semibold text-ink transition-all duration-300 hover:shadow-lg hover:shadow-silver-main/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-light motion-safe:hover:scale-105 sm:text-lg"
                aria-label="Hizmetlerimizi Görüntüle"
              >
                Hizmetlerimiz
                <ArrowRight
                  className="h-5 w-5 transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>

              {/* Bize Ulaşın Butonu */}
              <Link
                href="#iletisim"
                onClick={(e) => handleAnchorClick(e, "#iletisim")}
                className="group flex min-h-[48px] items-center justify-center gap-2 rounded-xl border-2 border-silver-main px-8 py-3.5 text-base font-semibold text-silver-main transition-all duration-300 hover:bg-silver-main hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-light sm:text-lg"
                aria-label="İletişime Geç"
              >
                <Phone className="h-5 w-5" aria-hidden="true" />
                Bize Ulaşın
              </Link>
            </motion.div>
          </motion.div>

          {/* Sağ Taraf: Görsel */}
          <motion.div
            variants={fadeInRight}
            initial={initial}
            animate="visible"
            className="relative w-full"
          >
            {/* Ana Görsel */}
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br from-silver-light/10 to-silver-dark/30 shadow-xl md:aspect-[4/5] md:max-h-[600px] md:rounded-3xl md:shadow-2xl">
              <div className="relative h-full w-full">
                <Image
                  src="/images/referanslar/2.webp"
                  alt="Altınöz Bobinaj Motor Sargı ve Bobinaj Hizmetleri - Endüstriyel Motor"
                  fill
                  className="h-full w-full object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                />
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-silver-dark/10 to-transparent md:from-silver-dark/20" />
              </div>
            </div>

            {/* Floating Deneyim Kartı
                Mobilde negatif offset viewport'u aştığı için görsel içine alındı. */}
            <motion.div
              variants={fadeUp}
              initial={initial}
              animate="visible"
              className="absolute bottom-4 left-4 rounded-lg border border-white/10 bg-ink-soft/75 p-5 shadow-lg backdrop-blur-sm md:-bottom-8 md:-left-8 md:p-6 md:shadow-xl md:backdrop-blur-md"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-silver-cta text-2xl font-bold text-ink">
                  50+
                </div>
                <div>
                  <p className="text-sm font-medium text-paper">
                    Yıllık Tecrübe
                  </p>
                  <p className="text-xs text-paper-muted">
                    Sektörde lider konumdayız
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
