import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { PublicJobView } from "@/lib/supabase/database.types";

export const metadata: Metadata = {
  title: "İşinizde Kullanılan Malzemeler | Altınöz Bobinaj",
  /* Token tahmin edilemez ama yine de indekslenmemeli: arama sonuçlarında
     çıkması, linki bilmeyen birinin ulaşmasına yol açar. */
  robots: { index: false, follow: false },
};

function formatKg(deger: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(deger);
}

export default async function QrMalzemeSayfasi({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!isSupabaseConfigured()) notFound();

  const supabase = await createClient();

  /* public_job_by_token() security definer: anon rolunun tablolara hic
     erisimi yok, yalnizca bu fonksiyonun dondurdugu alanlar gorunur.
     Alis fiyati, maliyet ve musteri kimligi bilincli olarak disarida. */
  const { data, error } = await supabase.rpc("public_job_by_token", {
    p_token: token,
  });

  if (error || !data) notFound();

  const is = data as unknown as PublicJobView;

  return (
    <main className="min-h-screen bg-ink py-12">
      <div className="container mx-auto max-w-lg px-4 sm:px-6">
        <p className="text-xs uppercase tracking-widest text-silver-main">
          Altınöz Bobinaj
        </p>

        <h1 className="mt-2 font-display text-2xl font-bold text-paper sm:text-3xl">
          {is.job_title}
        </h1>

        <p className="mt-3 text-sm text-paper-muted">
          Bu işte kullanılan malzemeler aşağıda listelenmiştir.
        </p>

        <section aria-labelledby="malzeme-basligi" className="mt-8">
          <h2 id="malzeme-basligi" className="mb-4 font-display text-lg font-bold text-paper">
            Kullanılan malzemeler
          </h2>

          {is.materials.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-ink-soft/60 p-5 text-sm text-paper-muted">
              Bu iş yalnızca işçilik içermektedir; malzeme kullanılmamıştır.
            </p>
          ) : (
            <ul className="space-y-2">
              {is.materials.map((m, i) => (
                <li
                  key={`${m.name}-${i}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-white/10 bg-ink-soft/60 px-5 py-4"
                >
                  <span className="font-medium text-paper">{m.name}</span>
                  <span className="text-sm text-paper-muted">
                    {m.qty_pieces > 0 && `${m.qty_pieces} adet`}
                    {m.qty_pieces > 0 && Number(m.qty_kg) > 0 && " · "}
                    {Number(m.qty_kg) > 0 && `${formatKg(Number(m.qty_kg))} kg`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-10 border-t border-white/10 pt-6 text-sm text-paper-muted">
          <p>Sorularınız için bize ulaşabilirsiniz:</p>
          <p className="mt-2">
            <a
              href="tel:+905425918372"
              className="text-silver-main underline-offset-4 hover:underline"
            >
              0542 591 83 72
            </a>
          </p>
          <p className="mt-4">
            <Link href="/" className="text-silver-main underline-offset-4 hover:underline">
              altinozbobinaj.com
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
