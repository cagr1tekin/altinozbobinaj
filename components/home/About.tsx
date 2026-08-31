"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, fadeInRight, inViewOptions, staggerContainer } from "@/lib/motion";

const stats = [
  {
    value: "50+",
    label: "Yıllık Deneyim",
    detail: "Sektörde lider",
  },
  {
    value: "10K",
    label: "Mutlu Müşteri",
    detail: "Güvenilir hizmet",
  },
];

export default function About() {
  const shouldReduceMotion = useReducedMotion();
  const initial = shouldReduceMotion ? false : "hidden";

  return (
    <section
      id="hakkimizda"
      className="relative flex items-center overflow-hidden bg-ink py-16 lg:min-h-[760px] lg:py-20"
    >
      <div className="container relative mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
          {/* Sol Taraf: Metin İçeriği */}
          <motion.div
            variants={staggerContainer}
            initial={initial}
            whileInView="visible"
            viewport={inViewOptions}
            className="space-y-6"
          >
            <motion.h2
              variants={fadeUp}
              className="font-display text-4xl font-bold leading-tight text-paper sm:text-5xl md:text-5xl lg:text-6xl"
            >
              Hakkımızda
            </motion.h2>

            <motion.p
              variants={fadeUp}
              className="text-base leading-relaxed text-paper-muted sm:text-lg md:text-xl"
            >
              Altınöz Bobinaj olarak, 50 yılı aşkın deneyimimizle motor sargı ve
              bobinaj sektöründe öncü bir konumdayız. Müşteri memnuniyetini ön
              planda tutarak, kaliteli hizmet ve güvenilir çözümler sunuyoruz.
            </motion.p>

            <motion.p
              variants={fadeUp}
              className="text-base leading-relaxed text-paper-muted sm:text-lg md:text-xl"
            >
              Modern teknoloji ve geleneksel ustalığı bir araya getirerek,
              endüstriyel ve ticari motorların bakım, onarım ve yenileme
              işlemlerinde profesyonel hizmet veriyoruz. Atölyemizde, her türlü
              motor sargı işlemini hassasiyetle gerçekleştiriyoruz.
            </motion.p>

            <motion.dl variants={fadeUp} className="flex flex-wrap gap-6 pt-4">
              {stats.map((stat) => (
                <div key={stat.value} className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-silver-cta text-xl font-bold text-ink">
                    {stat.value}
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-paper">
                      {stat.label}
                    </dt>
                    <dd className="text-xs text-paper-muted">{stat.detail}</dd>
                  </div>
                </div>
              ))}
            </motion.dl>
          </motion.div>

          {/* Sağ Taraf: Görsel */}
          <motion.div
            variants={fadeInRight}
            initial={initial}
            whileInView="visible"
            viewport={inViewOptions}
            className="relative w-full"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br from-silver-light/20 to-silver-dark/20 shadow-2xl md:aspect-[4/5] md:max-h-[600px] md:rounded-3xl">
              <div className="relative h-full w-full">
                <Image
                  src="/images/referanslar/ref2.webp"
                  alt="Altınöz Bobinaj Atölye ve Çalışma Alanı - Motor Sargı İşlemi"
                  fill
                  className="h-full w-full object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
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
