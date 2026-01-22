"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, Phone } from "lucide-react";

export default function Hero() {
  const handleSmoothScroll = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    e.preventDefault();
    const targetId = href.replace("#", "");
    const element = document.getElementById(targetId);
    if (element) {
      const headerHeight = 80;
      const elementPosition =
        element.getBoundingClientRect().top + window.pageYOffset;
      const offsetPosition = elementPosition - headerHeight;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  // Animasyon varyantları
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: "easeOut" as const,
      },
    },
  };

  const imageVariants = {
    hidden: { opacity: 0, x: 50 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.8,
        ease: "easeOut" as const,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.8, y: 20 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        duration: 0.6,
        delay: 0.4,
        ease: "easeOut" as const,
      },
    },
  };

  return (
    <section
      id="hero"
      className="relative flex min-h-[calc(100vh-80px)] items-center overflow-hidden bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-800 py-12 lg:py-20"
    >
      {/* Arka Plan: Blur Gümüş Daire */}
      <div className="absolute -right-1/4 -top-1/4 h-[800px] w-[800px] rounded-full bg-silver-gradient opacity-20 blur-3xl md:-right-1/3 md:-top-1/3 md:h-[1000px] md:w-[1000px]" />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12 lg:items-center">
          {/* Sol Taraf: Metin İçeriği */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            {/* H1 Başlık */}
            <motion.h1
              variants={itemVariants}
              className="text-4xl font-bold leading-tight text-[#fafafa] sm:text-5xl md:text-5xl lg:text-6xl"
            >
              1976&apos;dan Günümüze{" "}
              <span className="text-transparent bg-clip-text bg-silver-gradient">
                Altınöz Bobinaj
              </span>
            </motion.h1>

            {/* Açıklama Metni */}
            <motion.p
              variants={itemVariants}
              className="text-base leading-relaxed text-gray-400 sm:text-lg md:text-xl"
            >
              Yarım asra yaklaşan tecrübemizle, endüstriyel elektrik motorlarının
              sarımı, bakımı ve onarımında Türkiye&apos;nin güvenilir çözüm ortağıyız.
              Geleneksel ustalığı modern teknolojiyle birleştirerek, işletmenizin
              kalbi olan motorlarınıza ilk günkü performansını kazandırıyoruz.
              Sadece tamir etmiyor, geleceğe hazırlıyoruz.
            </motion.p>

            {/* Butonlar */}
            <motion.div
              variants={itemVariants}
              className="flex flex-col gap-4 sm:flex-row sm:gap-6"
            >
              {/* Hizmetlerimiz Butonu */}
              <Link
                href="#hizmetler"
                onClick={(e) => handleSmoothScroll(e, "#hizmetler")}
                className="group flex items-center justify-center gap-2 rounded-full bg-silver-gradient px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-silver-main/30 sm:text-lg"
                aria-label="Hizmetlerimizi Görüntüle"
              >
                Hizmetlerimiz
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>

              {/* Bize Ulaşın Butonu */}
              <Link
                href="#iletisim"
                onClick={(e) => handleSmoothScroll(e, "#iletisim")}
                className="group flex items-center justify-center gap-2 rounded-full border-2 border-silver-main px-8 py-4 text-base font-semibold text-silver-main transition-all duration-300 hover:bg-silver-main hover:text-white sm:text-lg"
                aria-label="İletişime Geç"
              >
                <Phone className="h-5 w-5" />
                Bize Ulaşın
              </Link>
            </motion.div>
          </motion.div>

          {/* Sağ Taraf: Görsel */}
          <motion.div
            variants={imageVariants}
            initial="hidden"
            animate="visible"
            className="relative w-full"
          >
            {/* Ana Görsel */}
            <div className="relative w-full aspect-square overflow-hidden rounded-[3rem] rounded-tr-[5rem] bg-gradient-to-br from-silver-light/20 to-silver-dark/20 shadow-2xl md:aspect-[4/5] md:max-h-[600px]">
              <div className="relative h-full w-full">
                <Image
                  src="/asd.avif"
                  alt="Altınöz Bobinaj Motor Sargı ve Bobinaj Hizmetleri - Endüstriyel Motor"
                  fill
                  className="w-full h-full object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                />
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-silver-dark/20 to-transparent" />
              </div>
            </div>

            {/* Floating Deneyim Kartı */}
            <motion.div
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              className="absolute -bottom-6 -left-6 rounded-2xl bg-[#18181b]/80 backdrop-blur-md p-6 shadow-xl border border-white/10 md:-bottom-8 md:-left-8"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-silver-gradient text-2xl font-bold text-white">
                  30+
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-300">
                    Yıllık Tecrübe
                  </p>
                  <p className="text-xs text-gray-400">
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
