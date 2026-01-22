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
    { label: "Hizmetler", href: "#hizmetler" },
    { label: "Hakkımızda", href: "#hakkimizda" },
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
          ? "bg-[#09090b]/80 backdrop-blur-md shadow-sm border-b border-white/10"
          : "bg-[#09090b]/60 backdrop-blur-sm"
      }`}
    >
      <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="text-2xl font-bold text-[#fafafa] transition-colors hover:text-silver-main"
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
                className="text-base font-medium text-[#fafafa] transition-colors hover:text-silver-main"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* CTA Butonu */}
          <Link
            href="#iletisim"
            onClick={(e) => handleSmoothScroll(e, "#iletisim")}
            className="group relative flex items-center justify-center rounded-full bg-silver-gradient px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-silver-main/30 md:px-6 md:py-3"
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
