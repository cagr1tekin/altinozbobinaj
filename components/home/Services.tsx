"use client";

import { motion } from "framer-motion";
import { Settings, Zap, Toolbox, Wrench, Cog, Gauge } from "lucide-react";

type Service = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

const services: Service[] = [
  {
    icon: Settings,
    title: "Bobinaj Sarımı",
    description:
      "Endüstriyel ve ticari motorlar için profesyonel bobinaj sarım hizmeti. Yüksek kalite malzeme ve hassas işçilik.",
  },
  {
    icon: Zap,
    title: "Elektrik Motoru Tamiri",
    description:
      "Arızalı elektrik motorlarının hızlı ve güvenilir tamiri. Tüm marka ve modeller için uzman çözümler.",
  },
  {
    icon: Toolbox,
    title: "Bakım & Onarım",
    description:
      "Düzenli bakım ve önleyici onarım hizmetleri ile motorlarınızın ömrünü uzatın. Periyodik kontroller.",
  },
  {
    icon: Wrench,
    title: "Yedek Parça",
    description:
      "Orijinal ve kaliteli yedek parça temini. Geniş stok yelpazesi ile hızlı çözüm.",
  },
  {
    icon: Cog,
    title: "Teknik Destek",
    description:
      "7/24 teknik destek ve danışmanlık hizmeti. Uzman ekibimiz her zaman yanınızda.",
  },
  {
    icon: Gauge,
    title: "Test & Kalibrasyon",
    description:
      "Motor performans testleri ve kalibrasyon işlemleri. ISO standartlarında ölçüm ve raporlama.",
  },
];

export default function Services() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const cardVariants = {
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

  return (
    <section
      id="hizmetler"
      className="bg-[#09090b] py-16 lg:py-20"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Başlık */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center text-3xl font-bold text-[#fafafa] sm:text-4xl md:text-5xl"
        >
          Neler Yapıyoruz?
        </motion.h2>

        {/* 3 Sütunlu Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {services.map((service, index) => {
            const Icon = service.icon;
            return (
              <motion.div
                key={index}
                variants={cardVariants}
                className="group relative rounded-3xl border-2 border-white/10 bg-[#18181b] p-8 shadow-lg transition-all duration-300 hover:-translate-y-2 hover:border-silver-main"
              >
                {/* İkon (Sol Üst) */}
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-silver-gradient text-white transition-transform duration-300 group-hover:scale-110">
                  <Icon className="h-8 w-8" aria-hidden="true" />
                </div>

                {/* Başlık */}
                <h3 className="mb-3 text-xl font-bold text-[#fafafa]">
                  {service.title}
                </h3>

                {/* Açıklama */}
                <p className="text-base leading-relaxed text-gray-400">
                  {service.description}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
