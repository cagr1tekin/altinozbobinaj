"use client";

import Link from "next/link";
import { Phone, Mail, MapPin, Clock, type LucideIcon } from "lucide-react";
import { handleAnchorClick } from "@/lib/scroll";

type FooterLink = {
  label: string;
  href: string;
  icon?: LucideIcon;
};

type FooterColumn = {
  title: string;
  links: FooterLink[];
};

/* Gerçek sosyal medya hesapları müşteriden geldiğinde, aşağıya
   href'leri dolu bir "Sosyal Medya" kolonu olarak eklenebilir.
   href="#" ile boş link bırakmak SEO'da ölü link sayılıyor. */
const footerColumns: FooterColumn[] = [
  {
    title: "Hızlı Linkler",
    links: [
      { label: "Hizmetler", href: "#hizmetler" },
      { label: "Hakkımızda", href: "#hakkimizda" },
      { label: "Referanslar", href: "#referanslar" },
      { label: "İletişim", href: "#iletisim" },
    ],
  },
  {
    title: "Hizmetlerimiz",
    links: [
      { label: "Elektrik Motoru Sarımı", href: "#hizmetler" },
      { label: "Su Pompası Revizyon", href: "#hizmetler" },
      { label: "Parça Tedarik", href: "#hizmetler" },
      { label: "Fren Bobini Sarımı", href: "#hizmetler" },
    ],
  },
  {
    title: "İletişim",
    links: [
      { label: "0542 591 83 72", href: "tel:+905425918372", icon: Phone },
      { label: "0506 121 05 73", href: "tel:+905061210573", icon: Phone },
      {
        label: "altinozbobinajsan@gmail.com",
        href: "mailto:altinozbobinajsan@gmail.com",
        icon: Mail,
      },
    ],
  },
];

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-ink text-paper">
      <div className="container mx-auto px-4 pb-32 pt-16 sm:px-6 md:pb-16 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h3 className="mb-4 text-lg font-semibold text-paper">
                {column.title}
              </h3>
              <ul className="space-y-3">
                {column.links.map((link) => {
                  const Icon = link.icon;
                  return (
                    <li key={`${column.title}-${link.label}`}>
                      <Link
                        href={link.href}
                        onClick={(e) => handleAnchorClick(e, link.href)}
                        className="group flex items-center gap-2 rounded text-sm text-paper/80 transition-colors hover:text-silver-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main"
                      >
                        {Icon && (
                          <Icon
                            className="h-4 w-4 shrink-0 text-silver-main transition-colors group-hover:text-silver-light"
                            aria-hidden="true"
                          />
                        )}
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Adres ve çalışma saatleri: yerel SEO için metin olarak da bulunmalı */}
          <div>
            <h3 className="mb-4 text-lg font-semibold text-paper">
              Adres &amp; Çalışma Saatleri
            </h3>
            <address className="space-y-3 not-italic">
              <p className="flex items-start gap-2 text-sm text-paper/80">
                <MapPin
                  className="mt-0.5 h-4 w-4 shrink-0 text-silver-main"
                  aria-hidden="true"
                />
                <span>
                  Yeni Sanayi Sitesi, 19 Ağustos Cd.
                  <br />
                  10100 Karesi / Balıkesir
                </span>
              </p>
              <p className="flex items-start gap-2 text-sm text-paper/80">
                <Clock
                  className="mt-0.5 h-4 w-4 shrink-0 text-silver-main"
                  aria-hidden="true"
                />
                <span>
                  Pazartesi – Cumartesi
                  <br />
                  08:00 – 18:00
                </span>
              </p>
            </address>
          </div>
        </div>

        {/* Telif Hakkı */}
        <div className="mt-12 border-t border-white/10 pt-8 text-center">
          <p className="text-sm text-paper/60">
            © {currentYear} Altınöz Bobinaj. Tüm hakları saklıdır.
          </p>
        </div>
      </div>
    </footer>
  );
}
