import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { PublicJobView } from "@/lib/supabase/database.types";
import { formatTarih } from "@/components/panel/ui";

export const metadata: Metadata = {
  title: "İşinizde Kullanılan Malzemeler | Altınöz Bobinaj",
  /* Token tahmin edilemez ama yine de indekslenmemeli */
  robots: { index: false, follow: false },
};

export default async function QrMalzemeSayfasi({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isSupabaseConfigured()) notFound();

  const supabase = await createClient();

  /* public_job_by_token security definer: anon rolunun tablolara erisimi
     yok, veri yalnizca bu fonksiyonun dondurdugu alanlar kadar gorunur.
     Alis fiyati, maliyet ve musteri kimligi bilincli olarak disarida. */
  const { data, error } = await supabase.rpc("public_job_by_token", {
    p_token: token,
  });

  if (error || !data) notFound();
  const is = data as unknown as PublicJobView;

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <p className="text-sm font-medium text-pnl-primary-dark">
        Altınöz Bobinaj
      </p>
      <h1 className="mt-1 text-xl font-semibold">{is.job_title}</h1>
      {is.completed_at && (
        <p className="mt-1 text-sm text-pnl-muted">
          Tamamlanma: {formatTarih(is.completed_at)}
        </p>
      )}

      <h2 className="mb-3 mt-8 text-base font-semibold">
        Kullanılan malzemeler
      </h2>

      {is.materials.length === 0 ? (
        <p className="rounded-lg border border-pnl-line bg-pnl-surface p-4 text-sm text-pnl-muted">
          Bu iş yalnızca işçilik içermektedir; malzeme kullanılmamıştır.
        </p>
      ) : (
        <ul className="divide-y divide-pnl-line overflow-hidden rounded-lg border border-pnl-line bg-pnl-surface">
          {is.materials.map((m, i) => (
            <li key={`${m.name}-${i}`} className="px-4 py-3">
              <span className="font-medium">{m.name}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 border-t border-pnl-line pt-6 text-sm text-pnl-muted">
        <p>Sorularınız için:</p>
        <p className="mt-2">
          <a
            href="tel:+905425918372"
            className="font-medium text-pnl-primary-dark underline-offset-4 hover:underline"
          >
            0542 591 83 72
          </a>
        </p>
        <p className="mt-3">
          <Link
            href="/"
            className="text-pnl-primary-dark underline-offset-4 hover:underline"
          >
            altinozbobinaj.com
          </Link>
        </p>
      </div>
    </main>
  );
}
