"use client";

import { motion } from "framer-motion";

export default function Services() {
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

  const services = [
    {
      title: "Klasik Motor Sarımı",
      description:
        "Her türlü AC/DC elektrik motorunun, alternatörlerin ve jeneratörlerin fabrika standartlarında sarımı, verniklenmesi ve fırınlanması işlemleri. Yüksek ısı sınıfına sahip, kaliteli bakır teller ve izolasyon malzemeleri kullanılarak motorlarınızın ömrünü uzatıyor, ilk günkü performansına kavuşturuyoruz.",
      align: "self-start text-left lg:mr-auto lg:text-left z-10 relative",
    },
    {
      title: "Su Pompası Revizyon & Parça Tedarik",
      description:
        "Dalgıç pompalar, santrifüj pompalar ve hidrofor sistemlerinin mekanik salmastra, rulman değişimi ve sargı yenileme işlemleri. Ayrıca ihtiyacınız olan orijinal yedek parçaların hızlı temini ve profesyonel montajı ile su sistemlerinizin verimliliğini maksimum seviyeye çıkarıyoruz.",
      align: "self-end text-right lg:ml-auto lg:text-right items-end lg:-mt-24 z-10 relative",
    },
    {
      title: "Fren Bobini Sarımı",
      description:
        "Vinç, asansör ve endüstriyel makinelerde kullanılan elektromanyetik fren bobinlerinin hassas sarımı ve testi. Zorlu çalışma koşullarına dayanıklı, yüksek performanslı bobin çözümleri üreterek iş güvenliğinizi ve makine verimliliğinizi koruma altına alıyoruz.",
      align: "self-start text-left lg:mr-auto lg:text-left lg:-mt-24 z-10 relative",
    },
  ];

  return (
    <section
      id="hizmetler"
      className="relative overflow-hidden bg-[#09090b] h-auto lg:h-[760px] py-16 lg:py-10"
    >
      {/* Arka Plan: Blur Gümüş Daire */}
      <div className="absolute -left-1/4 -bottom-1/4 h-[800px] w-[800px] rounded-full bg-silver-gradient opacity-10 blur-3xl md:-left-1/3 md:-bottom-1/3 md:h-[1000px] md:w-[1000px]" />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center h-full">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="flex flex-col gap-0 lg:gap-0"
        >
          {services.map((service, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className={`flex w-full flex-col gap-4 lg:max-w-[45%] ${service.align}`}
            >
              <h2 className="text-4xl font-bold leading-tight text-[#fafafa] sm:text-5xl md:text-5xl lg:text-6xl">
                {service.title}
              </h2>
              <p className="text-base leading-relaxed text-gray-400 sm:text-lg md:text-xl">
                {service.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
