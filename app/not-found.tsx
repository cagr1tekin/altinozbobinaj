import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Phone } from "lucide-react";

export const metadata: Metadata = {
  title: "Sayfa Bulunamadı | Altınöz Bobinaj",
  description:
    "Aradığınız sayfa bulunamadı. Altınöz Bobinaj ana sayfasına dönerek bobinaj ve motor sarımı hizmetlerimizi inceleyebilirsiniz.",
  /* robots burada tanımlanmıyor: Next.js not-found sayfasına zaten
     otomatik noindex ekliyor ve ikinci bir meta etiketi oluşuyordu. */
};

export default function NotFound() {
  return (
    <section className="flex min-h-[70vh] items-center bg-ink py-16">
      <div className="container mx-auto px-4 text-center sm:px-6 lg:px-8">
        <p className="bg-silver-gradient bg-clip-text font-display text-6xl font-bold text-transparent sm:text-7xl">
          404
        </p>

        <h1 className="mt-4 font-display text-3xl font-bold text-paper sm:text-4xl">
          Aradığınız sayfa bulunamadı
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-paper-muted sm:text-lg">
          Bağlantı taşınmış veya hiç var olmamış olabilir. Ana sayfadan
          hizmetlerimize ulaşabilir ya da doğrudan bizi arayabilirsiniz.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/"
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-silver-cta px-8 text-base font-semibold text-ink transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-light motion-safe:hover:scale-105"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            Ana Sayfaya Dön
          </Link>

          <a
            href="tel:+905425918372"
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border-2 border-silver-main px-8 text-base font-semibold text-silver-main transition-all duration-300 hover:bg-silver-main hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-light"
          >
            <Phone className="h-5 w-5" aria-hidden="true" />
            0542 591 83 72
          </a>
        </div>
      </div>
    </section>
  );
}
