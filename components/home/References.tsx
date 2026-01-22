"use client";

import { motion } from "framer-motion";
import { Quote, Star } from "lucide-react";

// Marka logoları (placeholder - gerçek logolar ile değiştirilecek)
const brands = [
  { name: "Firma 1" },
  { name: "Firma 2" },
  { name: "Firma 3" },
  { name: "Firma 4" },
  { name: "Firma 5" },
  { name: "Firma 6" },
];

// Müşteri yorumları
const testimonials = [
  {
    name: "Ahmet Yılmaz",
    position: "Üretim Müdürü",
    company: "ABC Endüstri",
    comment:
      "Altınöz Bobinaj ile çalışmaktan çok memnunuz. Hızlı ve kaliteli hizmetleri sayesinde üretimimizde aksama yaşamadık. Profesyonel ekibi ve güvenilir çözümleri için teşekkür ederiz.",
    rating: 5,
  },
  {
    name: "Ayşe Demir",
    position: "Teknik Müdür",
    company: "XYZ Makina",
    comment:
      "30 yıllık deneyimleri gerçekten hissediliyor. Motor sargı işlemlerinde hassasiyet ve kalite standartlarını her zaman koruyorlar. Kesinlikle tavsiye ederim.",
    rating: 5,
  },
  {
    name: "Mehmet Kaya",
    position: "İşletme Sahibi",
    company: "Kaya Teknik",
    comment:
      "Acil durumlarda bile 7/24 destek sağlayan bir ekip. Motorlarımızın bakım ve onarımında her zaman yanımızda oldular. Müşteri memnuniyeti odaklı çalışmaları takdire şayan.",
    rating: 5,
  },
];

export default function References() {
  // Marquee animasyonu için mesafe hesaplama
  // Her logo ~160px (w-40) + gap-12 (48px) = ~208px
  const marqueeDistance = brands.length * 208;

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
      id="referanslar"
      className="bg-surface-light py-16 lg:py-20"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Marka Logoları - Marquee */}
        <div className="mb-20 overflow-hidden">
          <motion.div
            className="flex gap-12"
            animate={{
              x: [0, -marqueeDistance],
            }}
            transition={{
              x: {
                repeat: Infinity,
                repeatType: "loop",
                duration: 30,
                ease: "linear",
              },
            }}
            style={{ width: "max-content" }}
          >
            {/* İlk set */}
            {brands.map((brand, index) => (
              <div
                key={`brand-1-${index}`}
                className="group flex h-20 w-40 shrink-0 items-center justify-center grayscale transition-all duration-300 hover:grayscale-0 hover:opacity-100 opacity-50"
              >
                {/* Placeholder logo - Gerçek logolar ile değiştirilecek */}
                <div className="flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-copper-light/20 to-copper-dark/20 text-center text-xs font-semibold text-copper-main transition-colors group-hover:from-copper-light/40 group-hover:to-copper-dark/40">
                  {brand.name}
                </div>
              </div>
            ))}
            {/* İkinci set (sonsuz döngü için) */}
            {brands.map((brand, index) => (
              <div
                key={`brand-2-${index}`}
                className="group flex h-20 w-40 shrink-0 items-center justify-center grayscale transition-all duration-300 hover:grayscale-0 hover:opacity-100 opacity-50"
              >
                {/* Placeholder logo - Gerçek logolar ile değiştirilecek */}
                <div className="flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-copper-light/20 to-copper-dark/20 text-center text-xs font-semibold text-copper-main transition-colors group-hover:from-copper-light/40 group-hover:to-copper-dark/40">
                  {brand.name}
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Müşteri Yorumları */}
        <div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
            className="mb-12 text-center text-3xl font-bold text-surface-dark sm:text-4xl md:text-5xl"
          >
            Müşterilerimiz Ne Diyor?
          </motion.h2>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
          >
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                variants={cardVariants}
                className="group relative rounded-3xl border border-copper-light/30 bg-gray-50 p-8 shadow-lg transition-all duration-300 hover:shadow-xl"
              >
                {/* Quote Icon - Sol Üst */}
                <Quote
                  className="absolute left-6 top-6 h-12 w-12 text-copper-main opacity-20"
                  aria-hidden="true"
                />

                {/* Yıldızlar */}
                <div className="mb-4 flex gap-1">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star
                      key={i}
                      className="h-5 w-5 fill-copper-main text-copper-main"
                      aria-hidden="true"
                    />
                  ))}
                </div>

                {/* Yorum Metni */}
                <p className="mb-6 text-base leading-relaxed text-gray-700">
                  {testimonial.comment}
                </p>

                {/* Müşteri Bilgisi */}
                <div className="border-t border-gray-200 pt-4">
                  <p className="font-semibold text-surface-dark">
                    {testimonial.name}
                  </p>
                  <p className="text-sm text-gray-600">
                    {testimonial.position}
                  </p>
                  <p className="text-sm text-copper-main">
                    {testimonial.company}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
