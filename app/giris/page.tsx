import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import GirisFormu from "./GirisFormu";

export const metadata: Metadata = {
  title: "Yönetim Girişi | Altınöz Bobinaj",
  // Panel arama sonuçlarında görünmemeli
  robots: { index: false, follow: false },
};

export default async function GirisSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ devam?: string }>;
}) {
  const { devam } = await searchParams;

  return (
    <section className="flex min-h-[70vh] items-center bg-ink py-16">
      <div className="container mx-auto max-w-md px-4 sm:px-6">
        <h1 className="font-display text-3xl font-bold text-paper">
          Yönetim Girişi
        </h1>
        <p className="mt-2 text-sm text-paper-muted">
          Bu alan yalnızca Altınöz Bobinaj personeli içindir.
        </p>

        {isSupabaseConfigured() ? (
          <div className="mt-8">
            <GirisFormu devam={devam} />
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-100">
            <p className="font-semibold">Supabase yapılandırılmamış</p>
            <p className="mt-2">
              Kök dizindeki <code className="font-mono">.env.example</code>{" "}
              dosyasını <code className="font-mono">.env</code> olarak
              kopyalayıp Supabase panelindeki Project Settings → API
              bilgileriyle doldurun, ardından sunucuyu yeniden başlatın.
            </p>
          </div>
        )}

        <p className="mt-8 text-sm">
          <Link
            href="/"
            className="text-silver-main underline-offset-4 hover:underline"
          >
            Ana sayfaya dön
          </Link>
        </p>
      </div>
    </section>
  );
}
