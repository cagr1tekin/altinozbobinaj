"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

// 1. Grup Görseller (Üst Satır)
const row1Images = [
  {
    id: 1,
    src: "/images/referanslar/3585DFDA-7B06-4AEF-9B8F-6E8324C93927.webp",
    alt: "Balıkesir Altınöz Bobinaj endüstriyel motor sarımı referans çalışması",
  },
  {
    id: 2,
    src: "/images/referanslar/B920246F-E325-4B39-986C-CBAFB4EF492C (1).webp",
    alt: "Karesi Altınöz Bobinaj ağır hizmet elektrik motoru tamiri",
  },
  {
    id: 3,
    src: "/images/referanslar/a24924b8-65f0-44bf-9e37-07342966ec9c.webp",
    alt: "Balıkesir sanayi elektrik motoru sargı ve izolasyon referansı",
  },
  {
    id: 4,
    src: "/images/referanslar/FC577FD9-9EF4-42B2-96CD-44EC1439261D.webp",
    alt: "Balıkesir Altınöz Bobinaj su pompası tamiri ve revizyonu",
  },
  {
    id: 5,
    src: "/images/referanslar/Gemini_Generated_Image_1bajy11bajy11baj-_1_.webp",
    alt: "Altınöz Bobinaj Balıkesir profesyonel bobinaj atölyesi referans görüntüsü",
  },
  {
    id: 6,
    src: "/images/referanslar/Gemini_Generated_Image_1fnlnr1fnlnr1fnl.webp",
    alt: "Karesi Altınöz Bobinaj elektrik motoru sarımı ve bakım hizmeti",
  },
  {
    id: 7,
    src: "/images/referanslar/IMG_5615.webp",
    alt: "Balıkesir yüksek voltajlı elektrik motor sarımı Altınöz Bobinaj referansı",
  },
  {
    id: 8,
    src: "/images/referanslar/Gemini_Generated_Image_d6xngnd6xngnd6xn.webp",
    alt: "Altınöz Bobinaj alternatör ve jeneratör bobinajı referans çalışması",
  },
  {
    id: 9,
    src: "/images/referanslar/Gemini_Generated_Image_fevi8xfevi8xfevi.webp",
    alt: "Balıkesir sanayi bölgesi Altınöz Bobinaj atölye içi referans",
  },
  {
    id: 10,
    src: "/images/referanslar/Gemini_Generated_Image_r6rsar6rsar6rsar.webp",
    alt: "Endüstriyel elektromanyetik fren bobini sarımı Altınöz Bobinaj Balıkesir",
  },
  {
    id: 11,
    src: "/images/referanslar/IMG_4512.webp",
    alt: "Altınöz Bobinaj garantili elektrik motoru yenileme ve balans ayarı",
  },
];

// 2. Grup Görseller (Alt Satır)
const row2Images = [
  {
    id: 12,
    src: "/images/referanslar/IMG_7183.webp",
    alt: "Balıkesir ağır sanayi elektrik motoru sargısı Altınöz Bobinaj referansı",
  },
  {
    id: 13,
    src: "/images/referanslar/87.webp",
    alt: "Karesi Altınöz Bobinaj dalgıç su pompası tamir ve bakım çalışması",
  },
  {
    id: 14,
    src: "/images/referanslar/IMG_4804.webp",
    alt: "Balıkesir Altınöz Bobinaj endüstriyel motor sarımı referans görseli",
  },
  {
    id: 15,
    src: "/images/referanslar/IMG_5289.webp",
    alt: "Altınöz Bobinaj servo motor tamiri ve test hattı referansı",
  },
  {
    id: 16,
    src: "/images/referanslar/IMG_5595.webp",
    alt: "Balıkesir Altınöz Bobinaj komple elektrik motor revizyonu ve sarımı",
  },
  {
    id: 17,
    src: "/images/referanslar/IMG_5600.webp",
    alt: "Trafo ve özel bobin sargısı Altınöz Bobinaj Balıkesir referans çalışması",
  },
  {
    id: 19,
    src: "/images/referanslar/Gemini_Generated_Image_b2am0wb2am0wb2am.webp",
    alt: "Altınöz Bobinaj özel sargı ve proje bazlı bobinaj uygulaması",
  },
  {
    id: 26,
    src: "/images/referanslar/IMG_1084.webp",
    alt: "Balıkesir fabrikalar için elektrik motoru bakım onarım hizmeti referansı",
  },
  {
    id: 27,
    src: "/images/referanslar/IMG_9172.webp",
    alt: "Altınöz Bobinaj Balıkesir bobinaj atölyesi iç mekan referans fotoğrafı",
  },
  {
    id: 28,
    src: "/images/referanslar/WhatsApp-Image-2026-02-10-at-14.22.00.webp",
    alt: "Elektrik motoru sargı kalite kontrol ve test Altınöz Bobinaj",
  },
  {
    id: 29,
    src: "/images/referanslar/Gemini_Generated_Image_sodrlmsodrlmsodr.webp",
    alt: "Altınöz Bobinaj Balıkesir motor sarımı ve referans işçiliği görseli",
  },
];

export default function References() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, clientWidth, scrollWidth } = el;
    const tolerance = 8;
    setCanScrollLeft(scrollLeft > tolerance);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - tolerance);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollButtons();

    const handleScroll = () => updateScrollButtons();
    const handleResize = () => updateScrollButtons();

    el.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleResize);

    return () => {
      el.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const scrollByAmount = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.4;
    el.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <section
      id="referanslar"
      className="relative overflow-hidden bg-[#09090b] h-auto lg:h-[760px] py-16 lg:py-10"
    >
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(to_bottom,_rgba(148,163,184,0.16),_transparent_40%,_transparent_60%,_rgba(148,163,184,0.1))]" />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center h-full">
        {/* Başlık ve Slogan */}
        <div className="mb-8 lg:mb-10 text-center">
          <h2 className="mb-4 text-3xl font-display font-bold text-[#fafafa] sm:text-4xl md:text-5xl">
            {/* Başlık SEO için tanımlıydı, kullanıcı isteğiyle gizlendi */}
          </h2>

          {/* Açıklama paragrafını tamamen kaldırdık; boşluk için sadece h3 aşağıda kalıyor */}

          <h3 className="font-display text-3xl font-bold leading-tight text-[#fafafa] sm:text-4xl md:text-5xl">
            <span className="text-transparent bg-clip-text bg-silver-gradient">
              Referansımız, İşçiliğimizin Kalitesidir.
            </span>
          </h3>
        </div>

        {/* İki şeritli yatay kaydırılabilir galeri */}
        <div className="relative">
          {/* Scroll alanı */}
          <div
            ref={scrollRef}
            role="list"
            aria-label="Altınöz Bobinaj referans görsel galerisi"
            className="overflow-x-auto overflow-y-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="inline-flex flex-col gap-3 sm:gap-4 md:gap-5">
              {/* 1. Şerit */}
              <div className="flex flex-nowrap gap-3 sm:gap-4 md:gap-5">
                {row1Images.map((image) => (
                  <div
                    key={image.id}
                    role="listitem"
                    className="group relative h-52 w-auto shrink-0 overflow-hidden rounded-md sm:rounded-lg md:rounded-xl transition-all duration-500 hover:scale-[1.03]"
                  >
                    <figure className="h-full">
                      <Image
                        src={image.src}
                        alt={image.alt}
                        width={320}
                        height={200}
                        className="h-full w-auto object-cover"
                        style={{ width: "auto", height: "100%" }}
                        sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
                        loading="eager"
                      />
                      <figcaption className="sr-only">{image.alt}</figcaption>
                    </figure>
                  </div>
                ))}
              </div>

              {/* 2. Şerit */}
              <div className="flex flex-nowrap gap-3 sm:gap-4 md:gap-5">
                {row2Images.map((image) => (
                  <div
                    key={image.id}
                    role="listitem"
                    className="group relative h-52 w-auto shrink-0 overflow-hidden rounded-md sm:rounded-lg md:rounded-xl transition-all duration-500 hover:scale-[1.03]"
                  >
                    <figure className="h-full">
                      <Image
                        src={image.src}
                        alt={image.alt}
                        width={320}
                        height={200}
                        className="h-full w-auto object-cover"
                        style={{ width: "auto", height: "100%" }}
                        sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
                        loading="eager"
                      />
                      <figcaption className="sr-only">{image.alt}</figcaption>
                    </figure>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Vinyet + oklar (sadece desktop) */}
          <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden md:block">
            {/* Sol vinyet */}
            <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#09090b] via-[#09090b]/80 to-transparent" />
            {/* Sağ vinyet */}
            <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#09090b] via-[#09090b]/80 to-transparent" />
          </div>

          {/* Sol ok */}
          <button
            type="button"
            onClick={() => scrollByAmount("left")}
            disabled={!canScrollLeft}
            aria-label="Referansları sola kaydır"
            className={`hidden md:flex pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2 h-16 w-16 items-center justify-center rounded-xl text-white text-5xl font-bold drop-shadow-[0_0_14px_rgba(0,0,0,0.95)] transition ${
              canScrollLeft ? "opacity-100" : "opacity-30 cursor-default pointer-events-none"
            }`}
          >
            ‹
          </button>

          {/* Sağ ok */}
          <button
            type="button"
            onClick={() => scrollByAmount("right")}
            disabled={!canScrollRight}
            aria-label="Referansları sağa kaydır"
            className={`hidden md:flex pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2 h-16 w-16 items-center justify-center rounded-xl text-white text-5xl font-bold drop-shadow-[0_0_14px_rgba(0,0,0,0.95)] transition ${
              canScrollRight ? "opacity-100" : "opacity-30 cursor-default pointer-events-none"
            }`}
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
}
