"use client";

import { motion, useReducedMotion } from "framer-motion";
import { MapPin, Phone, Mail, ExternalLink } from "lucide-react";
import Link from "next/link";
import { fadeInLeft, fadeInRight, inViewOptions, staggerContainer } from "@/lib/motion";

const MAPS_DIRECTIONS_URL =
  "https://www.google.com/maps/dir/?api=1&destination=39.662356,27.910002";

/* Google Maps embed – Altınöz Bobinaj, Yeni Sanayi Sitesi / Karesi */
const MAP_EMBED_URL =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3071.4381955598697!2d27.910002476230698!3d39.66235647157093!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x14b6ff515998906f%3A0x6d33e708d120c5ea!2zQWx0xLFuw7Z6IEJvYmluYWogQmFsxLFrZXNpcg!5e0!3m2!1str!2str!4v1772074445259!5m2!1str!2str";

export default function Contact() {
  const shouldReduceMotion = useReducedMotion();
  const initial = shouldReduceMotion ? false : "hidden";

  const cardClass =
    "group flex items-start gap-5 rounded-xl border border-transparent bg-white/5 p-6 backdrop-blur-sm transition-all duration-300 hover:border-silver-main/30 hover:bg-white/10 motion-safe:hover:translate-x-2";
  const iconWrapClass =
    "flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-silver-main/20 text-silver-main transition-colors group-hover:bg-silver-main/30";
  const labelClass =
    "mb-2 text-sm font-semibold uppercase tracking-wide text-paper-muted";

  return (
    <section
      id="iletisim"
      className="relative flex items-center overflow-hidden bg-ink py-16 lg:min-h-[760px] lg:py-20"
    >
      <div className="container relative mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Sol Taraf: İletişim Bilgileri */}
          <motion.div
            variants={staggerContainer}
            initial={initial}
            whileInView="visible"
            viewport={inViewOptions}
            className="space-y-6"
          >
            <motion.h2
              variants={fadeInLeft}
              className="font-display text-3xl font-bold text-paper sm:text-4xl md:text-5xl"
            >
              Bizimle İletişime Geçin
            </motion.h2>

            {/* Adres */}
            <motion.div variants={fadeInLeft}>
              <a
                href={MAPS_DIRECTIONS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`${cardClass} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main`}
                aria-label="Adres: Yeni Sanayi Sitesi, 19 Ağustos Caddesi, Karesi Balıkesir. Google Haritalar'da yol tarifi al (yeni sekmede açılır)"
              >
                <div className={iconWrapClass}>
                  <MapPin className="h-7 w-7" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <h3 className={labelClass}>Adres</h3>
                  <address className="mb-1 block text-lg font-semibold not-italic text-paper">
                    Yeni Sanayi Sitesi, 19 Ağustos Cd.
                    <br />
                    10100 Karesi / Balıkesir
                  </address>
                  <span className="flex items-center gap-1.5 text-sm text-paper-muted">
                    Yol tarifi al
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </div>
              </a>
            </motion.div>

            {/* Telefonlar – her numara ayrı tıklanabilir link */}
            <motion.div variants={fadeInLeft} className={cardClass}>
              <div className={iconWrapClass}>
                <Phone className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className={labelClass}>Telefon</h3>
                <ul className="mb-1 space-y-1">
                  <li>
                    <Link
                      href="tel:+905425918372"
                      className="rounded text-lg font-semibold text-paper transition-colors hover:text-silver-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main"
                    >
                      +90 (542) 591 83 72
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="tel:+905061210573"
                      className="rounded text-lg font-semibold text-paper transition-colors hover:text-silver-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main"
                    >
                      +90 (506) 121 05 73
                    </Link>
                  </li>
                </ul>
                <p className="text-sm text-paper-muted">7/24 Destek Hattı</p>
              </div>
            </motion.div>

            {/* E-posta */}
            <motion.div variants={fadeInLeft}>
              <Link
                href="mailto:altinozbobinajsan@gmail.com"
                className={`${cardClass} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main`}
                aria-label="E-posta gönder: altinozbobinajsan@gmail.com"
              >
                <div className={iconWrapClass}>
                  <Mail className="h-7 w-7" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <h3 className={labelClass}>E-posta</h3>
                  <span className="mb-1 block break-all text-lg font-semibold text-paper">
                    altinozbobinajsan@gmail.com
                  </span>
                  <span className="block text-sm text-paper-muted">
                    Genel İletişim
                  </span>
                </div>
              </Link>
            </motion.div>
          </motion.div>

          {/* Sağ Taraf: Google Maps */}
          <motion.div
            variants={fadeInRight}
            initial={initial}
            whileInView="visible"
            viewport={inViewOptions}
            className="relative h-full min-h-[400px] w-full max-h-[500px] lg:max-h-full"
          >
            <div className="group relative h-full w-full overflow-hidden rounded-2xl">
              <iframe
                src={MAP_EMBED_URL}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-full w-full grayscale transition-all duration-500 group-hover:grayscale-0 motion-reduce:transition-none"
                title="Altınöz Bobinaj Konum Haritası"
              />
              <div className="pointer-events-none absolute inset-0 bg-silver-main/0 transition-colors duration-500 group-hover:bg-silver-main/5" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
