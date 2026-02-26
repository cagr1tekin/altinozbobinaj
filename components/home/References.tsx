"use client";

import { motion } from "framer-motion";
import Image from "next/image";

// 1. Grup Görseller (Üst Satır)
const row1Images = [
  { id: 1, src: "/images/referanslar/3585DFDA-7B06-4AEF-9B8F-6E8324C93927.webp", alt: "Referans Görsel" },
  { id: 2, src: "/images/referanslar/a24924b8-65f0-44bf-9e37-07342966ec9c.jpg", alt: "Referans Görsel" },
  { id: 3, src: "/images/referanslar/B920246F-E325-4B39-986C-CBAFB4EF492C (1).jpg", alt: "Referans Görsel" },
  { id: 4, src: "/images/referanslar/FC577FD9-9EF4-42B2-96CD-44EC1439261D.jpg", alt: "Referans Görsel" },
  { id: 5, src: "/images/referanslar/Gemini_Generated_Image_1bajy11bajy11baj (1).png", alt: "Referans Görsel" },
  { id: 6, src: "/images/referanslar/Gemini_Generated_Image_1fnlnr1fnlnr1fnl.png", alt: "Referans Görsel" },
  { id: 7, src: "/images/referanslar/Gemini_Generated_Image_b2am0wb2am0wb2am.png", alt: "Referans Görsel" },
  { id: 8, src: "/images/referanslar/Gemini_Generated_Image_d6xngnd6xngnd6xn.png", alt: "Referans Görsel" },
  { id: 9, src: "/images/referanslar/Gemini_Generated_Image_fevi8xfevi8xfevi.png", alt: "Referans Görsel" },
  { id: 10, src: "/images/referanslar/Gemini_Generated_Image_r6rsar6rsar6rsar.png", alt: "Referans Görsel" },
  { id: 11, src: "/images/referanslar/Gemini_Generated_Image_sodrlmsodrlmsodr.png", alt: "Referans Görsel" },
];

// 2. Grup Görseller (Alt Satır)
const row2Images = [
  { id: 12, src: "/images/referanslar/IMG_1084.JPG", alt: "Referans Görsel" },
  { id: 13, src: "/images/referanslar/IMG_4512.JPG", alt: "Referans Görsel" },
  { id: 14, src: "/images/referanslar/IMG_4804.jpg", alt: "Referans Görsel1" },
  { id: 15, src: "/images/referanslar/IMG_5289.jpg", alt: "Referans Görsel2" },
  { id: 16, src: "/images/referanslar/IMG_5595.JPG", alt: "Referans Görsel3" },
  { id: 17, src: "/images/referanslar/IMG_5600.jpg", alt: "Referans Görsel4" },
  { id: 19, src: "/images/referanslar/IMG_5615.jpg", alt: "Referans Görsel5" },
  { id: 26, src: "/images/referanslar/IMG_7183.JPG", alt: "Referans Görsel12" },
  { id: 27, src: "/images/referanslar/IMG_9172.JPG", alt: "Referans Görsel13" },
  { id: 28, src: "/images/referanslar/WhatsApp Image 2026-02-10 at 14.22.00.jpeg", alt: "Referans Görsel14" },
];

export default function References() {
  // Görselleri 4 kez çoğalt (kesintisiz döngü için)
  const duplicatedRow1 = [
    ...row1Images,
    ...row1Images,
    ...row1Images,
    ...row1Images,
  ];

  const duplicatedRow2 = [
    ...row2Images,
    ...row2Images,
    ...row2Images,
    ...row2Images,
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
              {duplicatedRow1.map((image, index) => (
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
                    style={{ width: "auto", height: "100%" }}
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
              {duplicatedRow2.map((image, index) => (
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
                    style={{ width: "auto", height: "100%" }}
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
