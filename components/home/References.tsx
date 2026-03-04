"use client";

import Image from "next/image";

// 1. Grup Görseller (Üst Satır)
const row1Images = [
  { id: 1, src: "/images/referanslar/3585DFDA-7B06-4AEF-9B8F-6E8324C93927.webp", alt: "Balıkesir Bobinaj ve Motor Sarımı Referans" },
  { id: 2, src: "/images/referanslar/a24924b8-65f0-44bf-9e37-07342966ec9c.webp", alt: "Endüstriyel Motor Tamiri Balıkesir" },
  { id: 3, src: "/images/referanslar/B920246F-E325-4B39-986C-CBAFB4EF492C (1).webp", alt: "Elektrik Motoru Sargı İşlemleri" },
  { id: 4, src: "/images/referanslar/FC577FD9-9EF4-42B2-96CD-44EC1439261D.webp", alt: "Su Pompası Tamiri ve Bakımı" },
  { id: 5, src: "/images/referanslar/Gemini_Generated_Image_1bajy11bajy11baj-_1_.webp", alt: "Profesyonel Bobinaj Atölyesi" },
  { id: 6, src: "/images/referanslar/Gemini_Generated_Image_1fnlnr1fnlnr1fnl.webp", alt: "Karesi Motor Sarımı Hizmetleri" },
  { id: 7, src: "/images/referanslar/Gemini_Generated_Image_b2am0wb2am0wb2am.webp", alt: "Yüksek Voltajlı Motor Sarımı" },
  { id: 8, src: "/images/referanslar/Gemini_Generated_Image_d6xngnd6xngnd6xn.webp", alt: "Alternatör ve Jeneratör Tamiri" },
  { id: 9, src: "/images/referanslar/Gemini_Generated_Image_fevi8xfevi8xfevi.webp", alt: "Balıkesir Sanayi Bobinaj Ustası" },
  { id: 10, src: "/images/referanslar/Gemini_Generated_Image_r6rsar6rsar6rsar.webp", alt: "Elektromanyetik Fren Bobini Sarımı" },
  { id: 11, src: "/images/referanslar/Gemini_Generated_Image_sodrlmsodrlmsodr.webp", alt: "Garantili Motor Yenileme" },
];

// 2. Grup Görseller (Alt Satır)
const row2Images = [
  { id: 12, src: "/images/referanslar/IMG_1084.webp", alt: "Ağır Sanayi Motor Sargısı" },
  { id: 13, src: "/images/referanslar/IMG_4512.webp", alt: "Dalgıç Pompa Tamir ve Bakım" },
  { id: 14, src: "/images/referanslar/IMG_4804.webp", alt: "Balıkesir Bobinaj Referans Çalışması" },
  { id: 15, src: "/images/referanslar/IMG_5289.webp", alt: "Servo Motor Tamiri" },
  { id: 16, src: "/images/referanslar/IMG_5595.webp", alt: "Komple Motor Revizyonu" },
  { id: 17, src: "/images/referanslar/IMG_5600.webp", alt: "Trafo ve Bobin Sargısı" },
  { id: 19, src: "/images/referanslar/IMG_5615.webp", alt: "Özel Sargı Teknikleri" },
  { id: 26, src: "/images/referanslar/IMG_7183.webp", alt: "Fabrika Bakım Onarım Hizmetleri" },
  { id: 27, src: "/images/referanslar/IMG_9172.webp", alt: "Balıkesir Bobinaj Atölye İçi" },
  { id: 28, src: "/images/referanslar/WhatsApp-Image-2026-02-10-at-14.22.00.webp", alt: "Motor Sargı Kalite Kontrol" },
  { id: 29, src: "/images/referanslar/87.webp", alt: "Altınöz Bobinaj Referans İşçiliği" },
];

// Marquee için tekrar eden diziler (CSS animasyon ile sonsuz kaydırma)
const duplicatedRow1 = [...row1Images, ...row1Images];
const duplicatedRow2 = [...row2Images, ...row2Images];

export default function References() {
  return (
    <section
      id="referanslar"
      className="relative overflow-hidden bg-[#09090b] h-auto lg:h-[760px] py-16 lg:py-10"
    >
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center h-full">
        {/* Başlık ve Slogan */}
        <div className="mb-8 lg:mb-10 text-center">
          <h2 className="mb-6 text-3xl font-bold text-[#fafafa] sm:text-4xl md:text-5xl">
            {""}
          </h2>

          <h3 className="text-3xl font-bold leading-tight text-[#fafafa] sm:text-4xl md:text-5xl">
            <span className="text-transparent bg-clip-text bg-silver-gradient">
              Referansımız, İşçiliğimizin Kalitesidir.
            </span>
          </h3>
        </div>

        {/* Çift Yönlü Kayan Galeri */}
        <div className="space-y-6">
          {/* 1. Satır: Soldan Sağa */}
          <div className="overflow-hidden">
            <div
              className="flex gap-3 sm:gap-4 md:gap-6 lg:gap-8 will-change-transform animate-marquee-slow motion-reduce:animate-none"
              style={{ width: "max-content" }}
            >
              {duplicatedRow1.map((image, index) => (
                <div
                  key={`row1-${image.id}-${index}`}
                  className="group relative h-40 sm:h-48 md:h-56 lg:h-64 w-auto shrink-0 overflow-hidden rounded-lg sm:rounded-xl md:rounded-2xl transition-all duration-500 hover:scale-105"
                >
                  <Image
                    src={image.src}
                    alt={image.alt}
                    width={320}
                    height={200}
                    className="h-full w-auto object-cover"
                    style={{ width: "auto", height: "100%" }}
                    sizes="(max-width: 640px) 260px, (max-width: 768px) 320px, (max-width: 1024px) 360px, 400px"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 2. Satır: Sağdan Sola */}
          <div className="overflow-hidden">
            <div
              className="flex gap-3 sm:gap-4 md:gap-6 lg:gap-8 will-change-transform animate-marquee-reverse-slow motion-reduce:animate-none"
              style={{ width: "max-content" }}
            >
              {duplicatedRow2.map((image, index) => (
                <div
                  key={`row2-${image.id}-${index}`}
                  className="group relative h-40 sm:h-48 md:h-56 lg:h-64 w-auto shrink-0 overflow-hidden rounded-lg sm:rounded-xl md:rounded-2xl transition-all duration-500 hover:scale-105"
                >
                  <Image
                    src={image.src}
                    alt={image.alt}
                    width={320}
                    height={200}
                    className="h-full w-auto object-cover"
                    style={{ width: "auto", height: "100%" }}
                    sizes="(max-width: 640px) 260px, (max-width: 768px) 320px, (max-width: 1024px) 360px, 400px"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
