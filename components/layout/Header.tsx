"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const menuItems = [
    { label: "Hakkımızda", href: "#hakkimizda" },
    { label: "Hizmetler", href: "#hizmetler" },
    { label: "Referanslar", href: "#referanslar" },
    { label: "İletişim", href: "#iletisim" },
  ];

  const handleSmoothScroll = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    e.preventDefault();
    const targetId = href.replace("#", "");
    const element = document.getElementById(targetId);
    if (element) {
      const headerHeight = 80; // Header yüksekliği
      const elementPosition =
        element.getBoundingClientRect().top + window.pageYOffset;
      const offsetPosition = elementPosition - headerHeight;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-white/80 backdrop-blur-md shadow-sm"
          : "bg-white/60 backdrop-blur-sm"
      }`}
    >
      <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="text-2xl font-bold text-surface-dark transition-colors hover:text-copper-main"
            aria-label="Altınöz Bobinaj Ana Sayfa"
          >
            Altınöz Bobinaj
          </Link>

          {/* Menü - Desktop */}
          <div className="hidden items-center gap-8 md:flex">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => handleSmoothScroll(e, item.href)}
                className="text-base font-medium text-surface-dark transition-colors hover:text-copper-main"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* CTA Butonu */}
          <Link
            href="#iletisim"
            onClick={(e) => handleSmoothScroll(e, "#iletisim")}
            className="group relative flex items-center justify-center rounded-full bg-copper-gradient px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-copper-main/30 md:px-6 md:py-3"
            aria-label="Teklif Al"
          >
            <span className="hidden sm:inline">Teklif Al</span>
            <span className="sm:hidden">Teklif</span>
          </Link>
        </div>
      </nav>
    </header>
  );
}
