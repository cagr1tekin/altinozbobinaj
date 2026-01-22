"use client";

import { motion } from "framer-motion";
import { MapPin, Phone, Mail } from "lucide-react";
import Link from "next/link";

const contactInfo = [
  {
    icon: MapPin,
    title: "Adres",
    content: "Örnek Mahalle, Örnek Sokak No: 123",
    subContent: "İstanbul, Türkiye",
    href: "#",
  },
  {
    icon: Phone,
    title: "Telefon",
    content: "+90 (555) 123 45 67",
    subContent: "7/24 Destek Hattı",
    href: "tel:+905551234567",
  },
  {
    icon: Mail,
    title: "E-posta",
    content: "info@altinozbobinaj.com",
    subContent: "Genel İletişim",
    href: "mailto:info@altinozbobinaj.com",
  },
];

export default function Contact() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -30 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.6,
        ease: "easeOut" as const,
      },
    },
  };

  const mapVariants = {
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

  // Google Maps iframe URL (placeholder - gerçek adres ile değiştirilecek)
  const mapUrl =
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3009.5!2d28.9784!3d41.0082!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDHCsDAwJzI5LjUiTiAyOMKwNTgnNDIuMiJF!5e0!3m2!1str!2str!4v1234567890123!5m2!1str!2str";

  return (
    <section
      id="iletisim"
      className="relative overflow-hidden bg-gradient-to-t from-zinc-950 via-zinc-900 to-zinc-900 h-auto lg:h-[760px] py-16 lg:py-10"
    >
      {/* Arka Plan: Gümüş Glow Efekti */}
      <div className="absolute -left-1/4 -bottom-1/4 h-[600px] w-[600px] rounded-full bg-silver-gradient opacity-10 blur-3xl md:h-[800px] md:w-[800px]" />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center h-full">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Sol Taraf: İletişim Bilgileri */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="space-y-6"
          >
            {/* Başlık */}
            <motion.h2
              variants={itemVariants}
              className="text-3xl font-bold text-white sm:text-4xl md:text-5xl"
            >
              Bizimle İletişime Geçin
            </motion.h2>

            {/* İletişim Kartları */}
            {contactInfo.map((info, index) => {
              const Icon = info.icon;
              const isLink = info.href.startsWith("tel:") || info.href.startsWith("mailto:");

              const CardContent = (
                <div className="group flex items-start gap-6 rounded-2xl bg-white/5 p-6 backdrop-blur-sm transition-all duration-300 hover:translate-x-2 hover:border hover:border-silver-main/30 hover:bg-white/10">
                  {/* İkon */}
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-silver-main/20 text-silver-main transition-colors group-hover:bg-silver-main/30">
                    <Icon className="h-7 w-7" aria-hidden="true" />
                  </div>

                  {/* İçerik */}
                  <div className="flex-1">
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
                      {info.title}
                    </h3>
                    <p className="mb-1 text-lg font-semibold text-white">
                      {info.content}
                    </p>
                    <p className="text-sm text-gray-400">{info.subContent}</p>
                  </div>
                </div>
              );

              return (
                <motion.div key={index} variants={itemVariants}>
                  {isLink ? (
                    <Link
                      href={info.href}
                      className="block"
                      aria-label={`${info.title}: ${info.content}`}
                    >
                      {CardContent}
                    </Link>
                  ) : (
                    CardContent
                  )}
                </motion.div>
              );
            })}
          </motion.div>

          {/* Sağ Taraf: Google Maps */}
          <motion.div
            variants={mapVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="relative h-full min-h-[400px] max-h-[500px] lg:max-h-full w-full"
          >
            <div className="group relative h-full w-full overflow-hidden rounded-3xl">
              {/* Harita Iframe */}
              <iframe
                src={mapUrl}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-full w-full grayscale transition-all duration-500 group-hover:grayscale-0"
                title="Altınöz Bobinaj Konum Haritası"
              />
              {/* Overlay (hover için) */}
              <div className="pointer-events-none absolute inset-0 bg-silver-main/0 transition-colors duration-500 group-hover:bg-silver-main/5" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
