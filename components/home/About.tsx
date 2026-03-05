"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function About() {
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

  return (
    <section
      id="hakkimizda"
      className="relative overflow-hidden bg-[#09090b] h-auto lg:h-[760px] py-16 lg:py-10"
    >
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center h-full">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12 lg:items-center">
          {/* Sol Taraf: Metin İçeriği */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            <motion.h2
              variants={itemVariants}
              className="font-display text-4xl font-bold leading-tight text-[#fafafa] sm:text-5xl md:text-5xl lg:text-6xl"
            >
              Hakkımızda
            </motion.h2>

            <motion.p
              variants={itemVariants}
              className="text-base leading-relaxed text-gray-400 sm:text-lg md:text-xl"
            >
              Altınöz Bobinaj olarak, 50 yılı aşkın deneyimimizle motor sargı
              ve bobinaj sektöründe öncü bir konumdayız. Müşteri memnuniyetini
              ön planda tutarak, kaliteli hizmet ve güvenilir çözümler sunuyoruz.
            </motion.p>

            <motion.p
              variants={itemVariants}
              className="text-base leading-relaxed text-gray-400 sm:text-lg md:text-xl"
            >
              Modern teknoloji ve geleneksel ustalığı bir araya getirerek,
              endüstriyel ve ticari motorların bakım, onarım ve yenileme
              işlemlerinde profesyonel hizmet veriyoruz. Atölyemizde, her türlü
              motor sargı işlemini hassasiyetle gerçekleştiriyoruz.
            </motion.p>

            <motion.div
              variants={itemVariants}
              className="flex flex-wrap gap-4 pt-4"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-silver-gradient text-white">
                  <span className="text-xl font-bold">50+</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#fafafa]">
                    Yıllık Deneyim
                  </p>
                  <p className="text-xs text-gray-400">Sektörde lider</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-silver-gradient text-white">
                  <span className="text-xl font-bold">10K</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#fafafa]">
                    Mutlu Müşteri
                  </p>
                  <p className="text-xs text-gray-400">Güvenilir hizmet</p>
                </div>
              </div>
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
            <div className="relative w-full aspect-square overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-silver-light/20 to-silver-dark/20 shadow-2xl md:aspect-[4/5] md:max-h-[600px]">
              <div className="relative h-full w-full">
                <Image
                  src="/images/referanslar/ref2.webp"
                  alt="Altınöz Bobinaj Atölye ve Çalışma Alanı - Motor Sargı İşlemi"
                  fill
                  className="w-full h-full object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-silver-dark/20 to-transparent" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
