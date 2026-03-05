"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    let ticking = false;

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    // İlk yüklemede de state'i doğru ayarla
    handleScroll();

    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
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
            className="flex h-full items-center gap-1 text-2xl font-bold text-[#fafafa] transition-colors hover:text-silver-main"
            aria-label="Altınöz Bobinaj Ana Sayfa"
          >
            {/* Sol amblem: header yüksekliğinin yaklaşık %70'i */}
            <div className="relative h-12 w-12 md:h-14 md:w-14 overflow-hidden">
              <Image
                src="/favicon.svg"
                alt="Altınöz Bobinaj Amblem"
                fill
                className="object-contain filter brightness-0 invert"
                priority
              />
            </div>

            {/* Sağda yazı-logo (logo2.webp): header yüksekliğinin yaklaşık %90'ı */}
            <div className="relative h-16 w-36 md:h-18 md:w-48 overflow-hidden">
              <Image
                src="/logo2.webp"
                alt="Altınöz Bobinaj Logo"
                fill
                className="object-contain filter brightness-0 invert"
                priority
              />
            </div>
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
            className="group relative flex items-center justify-center rounded-xl bg-silver-gradient px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-silver-main/30 md:px-6 md:py-3"
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
