"use client";

import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, inViewOptions, staggerContainer } from "@/lib/motion";

const services = [
  {
    title: "Elektrik Motoru Sarımı",
    description:
      "Her türlü AC elektrik motorunun fabrika standartlarında sarımı, verniklenmesi ve fırınlanması işlemleri. Yüksek ısı sınıfına sahip, kaliteli bakır teller ve izolasyon malzemeleri kullanılarak motorlarınızın ömrünü uzatıyor, ilk günkü performansına kavuşturuyoruz.",
    align: "self-start text-left lg:mr-auto lg:text-left",
  },
  {
    title: "Su Pompası Revizyon & Parça Tedarik",
    description:
      "Dalgıç pompalar, santrifüj pompalar ve hidrofor sistemlerinin mekanik salmastra, rulman değişimi ve sargı yenileme işlemleri. Ayrıca ihtiyacınız olan orijinal yedek parçaların hızlı temini ve profesyonel montajı ile su sistemlerinizin verimliliğini maksimum seviyeye çıkarıyoruz.",
    align: "self-end items-end text-right lg:ml-auto lg:-mt-24 lg:text-right",
  },
  {
    title: "Fren Bobini Sarımı",
    description:
      "Vinç, asansör ve endüstriyel makinelerde kullanılan elektromanyetik fren bobinlerinin hassas sarımı ve testi. Zorlu çalışma koşullarına dayanıklı, yüksek performanslı bobin çözümleri üreterek iş güvenliğinizi ve makine verimliliğinizi koruma altına alıyoruz.",
    align: "self-start text-left lg:mr-auto lg:-mt-24 lg:text-left",
  },
];

export default function Services() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section
      id="hizmetler"
      className="relative flex items-center overflow-hidden bg-ink py-16 lg:min-h-[760px] lg:py-20"
    >
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_bottom,_rgba(148,163,184,0.18),_transparent_45%,_transparent_55%,_rgba(148,163,184,0.12))]" />

      <div className="container relative mx-auto w-full px-4 sm:px-6 lg:px-8">
        <h2 className="sr-only">Hizmetlerimiz</h2>

        <motion.ul
          variants={staggerContainer}
          initial={shouldReduceMotion ? false : "hidden"}
          whileInView="visible"
          viewport={inViewOptions}
          className="flex flex-col gap-12 lg:gap-0"
        >
          {services.map((service) => (
            <motion.li
              key={service.title}
              variants={fadeUp}
              className={`relative z-10 flex w-full flex-col gap-4 lg:max-w-[45%] ${service.align}`}
            >
              <h3 className="font-display text-4xl font-bold leading-tight text-paper sm:text-5xl md:text-5xl lg:text-6xl">
                {service.title}
              </h3>
              <p className="text-base leading-relaxed text-paper-muted sm:text-lg md:text-xl">
                {service.description}
              </p>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
