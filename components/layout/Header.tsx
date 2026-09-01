"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { handleAnchorClick, scrollToSection, HEADER_HEIGHT } from "@/lib/scroll";

const menuItems = [
  { label: "Hizmetler", href: "#hizmetler" },
  { label: "Hakkımızda", href: "#hakkimizda" },
  { label: "Referanslar", href: "#referanslar" },
  { label: "İletişim", href: "#iletisim" },
];

const sectionIds = ["hero", ...menuItems.map((item) => item.href.slice(1))];

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("hero");
  const shouldReduceMotion = useReducedMotion();

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

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Aktif bölüm takibi (scroll-spy). Header yüksekliği kadar üstten,
     ekranın alt %45'i kadar alttan daraltılmış bir bant kullanılıyor:
     böylece "aktif" bölüm her zaman ekranın üst-orta kısmındaki bölüm olur.

     Observer callback'i yalnızca durumu DEĞİŞEN bölümlerin entry'lerini
     veriyor; sadece o entry'ler arasından seçim yapmak yanlış bölümü aktif
     gösterebiliyor. Bu yüzden her bölümün bant içindeki kesişim alanı bir
     map'te tutulup maksimum olan seçiliyor. Oran (intersectionRatio) yerine
     alan kullanılıyor: bölüm yükseklikleri eşit değil, oran kısa bölümleri
     haksız şekilde öne çıkarıyor. */
  useEffect(() => {
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const areas = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const rect = entry.intersectionRect;
          areas.set(
            entry.target.id,
            entry.isIntersecting ? rect.width * rect.height : 0
          );
        }

        let bestId = "";
        let bestArea = 0;
        for (const [id, area] of areas) {
          if (area > bestArea) {
            bestArea = area;
            bestId = id;
          }
        }

        if (bestId) setActiveSection(bestId);
      },
      {
        rootMargin: `-${HEADER_HEIGHT}px 0px -45% 0px`,
        /* Yüksek bölümlerde oran hiç 0.5'e ulaşmadığı için sık eşik gerekli:
           bant içindeki alan değiştikçe callback tetiklenmeli. */
        threshold: Array.from({ length: 21 }, (_, i) => i / 20),
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Menü açıkken sayfayı kilitle, Escape ile kapat, md üstüne geçilirse kapat
  useEffect(() => {
    if (!isMenuOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMenuOpen(false);
    };

    // Panel md:hidden olduğu için, desktop genişliğine geçildiğinde panel
    // kaybolur; menüyü kapatmazsak body scroll kilidi asılı kalıyor.
    const desktopQuery = window.matchMedia("(min-width: 768px)");
    const onBreakpointChange = (e: MediaQueryListEvent) => {
      if (e.matches) setIsMenuOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    desktopQuery.addEventListener("change", onBreakpointChange);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      desktopQuery.removeEventListener("change", onBreakpointChange);
    };
  }, [isMenuOpen]);

  const handleMobileNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    e.preventDefault();
    setIsMenuOpen(false);
    // Panel kapanma animasyonu ile scroll'un çakışmasını önle
    window.setTimeout(() => scrollToSection(href), shouldReduceMotion ? 0 : 180);
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled || isMenuOpen
          ? "bg-ink/80 backdrop-blur-md shadow-sm border-b border-white/10"
          : "bg-ink/60 backdrop-blur-sm"
      }`}
    >
      <nav
        className="container mx-auto px-4 sm:px-6 lg:px-8"
        aria-label="Ana menü"
      >
        <div className="flex h-20 items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex h-full items-center gap-1 text-2xl font-bold text-paper transition-colors hover:text-silver-main"
            aria-label="Altınöz Bobinaj Ana Sayfa"
          >
            {/* Sol amblem: header yüksekliğinin yaklaşık %70'i */}
            <div className="relative h-12 w-12 overflow-hidden md:h-14 md:w-14">
              <Image
                src="/favicon.svg"
                alt="Altınöz Bobinaj Amblem"
                fill
                className="object-contain brightness-0 invert filter"
                priority
              />
            </div>

            {/* Sağda yazı-logo: header yüksekliğinin yaklaşık %90'ı */}
            <div className="relative h-16 w-36 overflow-hidden md:h-[4.5rem] md:w-48">
              <Image
                src="/logo2.webp"
                alt="Altınöz Bobinaj Logo"
                fill
                className="object-contain brightness-0 invert filter"
                priority
              />
            </div>
          </Link>

          {/* Menü - Desktop */}
          <ul className="hidden items-center gap-8 md:flex">
            {menuItems.map((item) => {
              const isActive = activeSection === item.href.slice(1);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={(e) => handleAnchorClick(e, item.href)}
                    aria-current={isActive ? "true" : undefined}
                    className={`relative block rounded py-1 text-base font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-silver-main ${
                      isActive
                        ? "text-paper"
                        : "text-paper/70 hover:text-paper"
                    }`}
                  >
                    {item.label}
                    {/* Aktif bölüm göstergesi */}
                    {isActive && (
                      <motion.span
                        layoutId="aktif-bolum"
                        transition={
                          shouldReduceMotion
                            ? { duration: 0 }
                            : { type: "spring", stiffness: 380, damping: 32 }
                        }
                        className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-silver-cta"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-2">
            {/* CTA Butonu */}
            <Link
              href="#iletisim"
              onClick={(e) => handleAnchorClick(e, "#iletisim")}
              className="group relative flex min-h-[44px] items-center justify-center rounded-xl bg-silver-cta px-4 py-2.5 text-sm font-semibold text-ink transition-all duration-300 hover:shadow-lg hover:shadow-silver-main/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-light motion-safe:hover:scale-105 md:px-6 md:py-3"
              aria-label="Teklif Al"
            >
              <span className="hidden sm:inline">Teklif Al</span>
              <span className="sm:hidden">Teklif</span>
            </Link>

            {/* Hamburger - sadece mobil */}
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-label={isMenuOpen ? "Menüyü kapat" : "Menüyü aç"}
              aria-expanded={isMenuOpen}
              aria-controls="mobil-menu"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-paper transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main md:hidden"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobil menü paneli */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            id="mobil-menu"
            initial={
              shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 1, height: "auto" }
            }
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-white/10 bg-ink/95 backdrop-blur-md md:hidden"
          >
            <ul className="container mx-auto flex flex-col gap-1 px-4 py-4 sm:px-6">
              {menuItems.map((item) => {
                const isActive = activeSection === item.href.slice(1);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={(e) => handleMobileNavClick(e, item.href)}
                      aria-current={isActive ? "true" : undefined}
                      className={`flex min-h-[48px] items-center gap-3 rounded-xl px-4 text-base font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main ${
                        isActive
                          ? "bg-white/5 text-paper"
                          : "text-paper/70 hover:bg-white/5 hover:text-paper"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                          isActive ? "bg-silver-light" : "bg-transparent"
                        }`}
                        aria-hidden="true"
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
              <li>
                <a
                  href="tel:+905425918372"
                  className="mt-2 flex min-h-[48px] items-center justify-center rounded-xl bg-silver-cta px-4 font-semibold text-ink"
                >
                  Hemen Ara: 0542 591 83 72
                </a>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
