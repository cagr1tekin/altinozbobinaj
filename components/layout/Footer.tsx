"use client";

import Link from "next/link";
import {
  Phone,
  Mail,
  MapPin,
  Facebook,
  Instagram,
  Linkedin,
  type LucideIcon,
} from "lucide-react";

type FooterLink = {
  label: string;
  href: string;
  icon?: LucideIcon;
};

type FooterColumn = {
  title: string;
  links: FooterLink[];
};

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const handleSmoothScroll = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    if (href.startsWith("#")) {
      e.preventDefault();
      const targetId = href.replace("#", "");
      const element = document.getElementById(targetId);
      if (element) {
        const headerHeight = 80;
        const elementPosition =
          element.getBoundingClientRect().top + window.pageYOffset;
        const offsetPosition = elementPosition - headerHeight;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });
      }
    }
  };

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
        { label: "Telefon", href: "tel:+905425918372", icon: Phone },
        { label: "E-posta", href: "mailto:altinozbobinajsan@gmail.com", icon: Mail },
        { label: "Adres", href: "#iletisim", icon: MapPin },
      ],
    },
    {
      title: "Sosyal Medya",
      links: [
        { label: "Facebook", href: "#", icon: Facebook },
        { label: "Instagram", href: "#", icon: Instagram },
        { label: "LinkedIn", href: "#", icon: Linkedin },
      ],
    },
  ];

  return (
    <footer className="bg-[#09090b] text-white border-t border-white/10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {footerColumns.map((column, index) => (
            <div key={index}>
              <h3 className="mb-4 text-lg font-semibold text-white">
                {column.title}
              </h3>
              <ul className="space-y-3">
                {column.links.map((link, linkIndex) => {
                  const Icon = link.icon;
                  return (
                    <li key={linkIndex}>
                      <Link
                        href={link.href}
                        onClick={(e) => handleSmoothScroll(e, link.href)}
                        className="group flex items-center gap-2 text-sm text-gray-300 transition-colors hover:text-silver-main"
                      >
                        {Icon && (
                          <Icon
                            className="h-4 w-4 text-silver-main transition-colors group-hover:text-silver-light"
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
        </div>

        {/* Telif Hakkı */}
        <div className="mt-12 border-t border-gray-800 pt-8 text-center">
          <p className="text-sm text-gray-400">
            © {currentYear} Altınöz Bobinaj. Tüm hakları saklıdır.
          </p>
        </div>
      </div>
    </footer>
  );
}
