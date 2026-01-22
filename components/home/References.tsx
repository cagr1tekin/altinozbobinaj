"use client";

import { motion } from "framer-motion";
import Image from "next/image";

// Placeholder görseller (gerçek görseller ile değiştirilecek)
const galleryImages = [
  { id: 1, src: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop&q=80", alt: "Endüstriyel Motor Bobinaj İşlemi" },
  { id: 2, src: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600&h=400&fit=crop&q=80", alt: "Motor Sargı Atölyesi" },
  { id: 3, src: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop&q=80", alt: "Bobinaj Sarım İşlemi" },
  { id: 4, src: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600&h=400&fit=crop&q=80", alt: "Elektrik Motoru Tamiri" },
  { id: 5, src: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop&q=80", alt: "Motor Bakım ve Onarım" },
  { id: 6, src: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600&h=400&fit=crop&q=80", alt: "Endüstriyel Motor Çalışması" },
];

export default function References() {
  // Görselleri 4 kez çoğalt (kesintisiz döngü için)
  const duplicatedImages = [
    ...galleryImages,
    ...galleryImages,
    ...galleryImages,
    ...galleryImages,
  ];

  return (
    <section
      id="referanslar"
      className="relative overflow-hidden bg-[#09090b] h-auto lg:h-[760px] py-16 lg:py-10"
    >
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center h-full">
        {/* Başlık ve Slogan */}
        <div className="mb-8 lg:mb-10 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
            className="mb-6 text-3xl font-bold text-[#fafafa] sm:text-4xl md:text-5xl"
          >
          </motion.h2>

          <motion.h3
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-3xl font-bold leading-tight text-[#fafafa] sm:text-4xl md:text-5xl"
          >
            <span className="text-transparent bg-clip-text bg-silver-gradient">
              Referansımız, İşçiliğimizin Kalitesidir.
            </span>
          </motion.h3>
        </div>

        {/* Çift Yönlü Kayan Galeri */}
        <div className="space-y-6">
          {/* 1. Satır: Soldan Sağa */}
          <div className="overflow-hidden">
            <motion.div
              className="flex gap-6"
              initial={{ x: 0 }}
              animate={{ x: "-50%" }}
              transition={{
                duration: 60,
                repeat: Infinity,
                ease: "linear",
              }}
              style={{ width: "max-content" }}
            >
              {duplicatedImages.map((image, index) => (
                <div
                  key={`row1-${image.id}-${index}`}
                  className="group relative h-64 w-auto shrink-0 overflow-hidden rounded-2xl transition-all duration-500 hover:scale-105"
                >
                  <Image
                    src={image.src}
                    alt={image.alt}
                    width={400}
                    height={256}
                    className="h-full w-auto object-cover"
                    sizes="(max-width: 768px) 200px, 400px"
                  />
                </div>
              ))}
            </motion.div>
          </div>

          {/* 2. Satır: Sağdan Sola */}
          <div className="overflow-hidden">
            <motion.div
              className="flex gap-6"
              initial={{ x: "-50%" }}
              animate={{ x: "0%" }}
              transition={{
                duration: 60,
                repeat: Infinity,
                ease: "linear",
              }}
              style={{ width: "max-content" }}
            >
              {duplicatedImages.map((image, index) => (
                <div
                  key={`row2-${image.id}-${index}`}
                  className="group relative h-64 w-auto shrink-0 overflow-hidden rounded-2xl transition-all duration-500 hover:scale-105"
                >
                  <Image
                    src={image.src}
                    alt={image.alt}
                    width={400}
                    height={256}
                    className="h-full w-auto object-cover"
                    sizes="(max-width: 768px) 200px, 400px"
                  />
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
