import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Uyari } from "@/components/panel/ui";
import GirisFormu from "./GirisFormu";

export const metadata: Metadata = {
  title: "Giriş | Altınöz Bobinaj",
  robots: { index: false, follow: false },
};

export default async function GirisSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ devam?: string }>;
}) {
  const { devam } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        {/* Marka dokunuşu: logo + ad.
            Panel tokenlarında kalıyoruz — landing'in koyu teması ve
            display fontu buraya gelmiyor. Sebebi işlevsel: personel giriş
            yapıp hemen panele düşüyor, koyu→açık geçişi her girişte gözü
            yorar. Logo markayı belli etmeye yetiyor.

            Logo koyu zemin için tasarlandığı (beyaz) için açık zeminde
            ters çevriliyor: `invert` olmadan beyaz üstünde beyaz kalıyor. */}
        <div className="relative mx-auto h-14 w-40">
          <Image
            src="/logo2.webp"
            alt="Altınöz Bobinaj"
            fill
            priority
            sizes="160px"
            className="object-contain invert filter"
          />
        </div>

        <h1 className="mt-6 text-center text-2xl font-semibold">
          Yönetim Paneli
        </h1>
        <p className="mt-1 text-center text-pnl-muted">
          Devam etmek için giriş yapın
        </p>

        {isSupabaseConfigured() ? (
          <div className="mt-8">
            <GirisFormu devam={devam} />
          </div>
        ) : (
          <div className="mt-8">
            <Uyari baslik="Supabase yapılandırılmamış">
              <code>.env.example</code> dosyasını <code>.env</code> olarak
              kopyalayıp Supabase bilgileriyle doldurun, sonra sunucuyu yeniden
              başlatın.
            </Uyari>
          </div>
        )}

        {/* Dokunma hedefi 48px: tasarim sisteminin kurali inline
            linkler icin de gecerli tutuluyor. */}
        <p className="mt-6">
          <Link
            href="/"
            className="inline-flex min-h-[48px] items-center text-pnl-primary-dark underline-offset-4 hover:underline"
          >
            Ana sayfaya dön
          </Link>
        </p>
      </div>
    </div>
  );
}
