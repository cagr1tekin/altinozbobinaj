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
    hidden: { opacity: 0, x: 30 },
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
      className="bg-surface-light py-16 lg:py-20"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12 lg:items-center">
          {/* Sol Taraf: Metin İçeriği */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="space-y-6"
          >
            <motion.h2
              variants={itemVariants}
              className="text-3xl font-bold text-surface-dark sm:text-4xl md:text-5xl"
            >
              Hakkımızda
            </motion.h2>

            <motion.p
              variants={itemVariants}
              className="text-base leading-relaxed text-gray-600 sm:text-lg md:text-xl"
            >
              Altınöz Bobinaj olarak, 30 yılı aşkın deneyimimizle motor sargı
              ve bobinaj sektöründe öncü bir konumdayız. Müşteri memnuniyetini
              ön planda tutarak, kaliteli hizmet ve güvenilir çözümler sunuyoruz.
            </motion.p>

            <motion.p
              variants={itemVariants}
              className="text-base leading-relaxed text-gray-600 sm:text-lg md:text-xl"
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
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-copper-gradient text-white">
                  <span className="text-xl font-bold">30+</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-surface-dark">
                    Yıllık Deneyim
                  </p>
                  <p className="text-xs text-gray-500">Sektörde lider</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-copper-gradient text-white">
                  <span className="text-xl font-bold">1000+</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-surface-dark">
                    Mutlu Müşteri
                  </p>
                  <p className="text-xs text-gray-500">Güvenilir hizmet</p>
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Sağ Taraf: Fotoğraf (Offset Border) */}
          <motion.div
            variants={imageVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="relative"
          >
            {/* Offset Border Container */}
            <div className="relative">
              {/* Border (Fotoğraftan ayrık) */}
              <div className="absolute -inset-4 rounded-3xl border-4 border-copper-main opacity-60" />

              {/* Fotoğraf */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-copper-light/10 to-copper-dark/10 shadow-2xl">
                <Image
                  src="https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800&h=1000&fit=crop&q=80"
                  alt="Altınöz Bobinaj Atölye ve Çalışma Alanı - Motor Sargı İşlemi"
                  width={600}
                  height={700}
                  className="h-full w-full object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-copper-dark/10 to-transparent" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
