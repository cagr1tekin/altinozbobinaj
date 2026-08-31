import { createClient } from "@/lib/supabase/server";
import {
  BolumBasligi,
  BosDurum,
  Kart,
  formatPara,
  formatTarih,
} from "@/components/yonetim/ui";
import FaturaFormu from "@/components/yonetim/FaturaFormu";
import FaturaSilButonu from "@/components/yonetim/FaturaSilButonu";

export default async function FaturalarSayfasi() {
  const supabase = await createClient();

  const [{ data: faturalar, error }, { data: musteriler }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_no, gross_amount, net_amount, tax_amount, issue_date, note, customers(id, name)")
      .order("issue_date", { ascending: false })
      .limit(200),
    supabase
      .from("customers")
      .select("id, name, segments(id, segment_date)")
      .order("name", { ascending: true }),
  ]);

  const liste = faturalar ?? [];
  const toplamNet = liste.reduce((a, f) => a + Number(f.net_amount), 0);

  return (
    <>
      <BolumBasligi
        baslik="Faturalar"
        aciklama="Kâr/zarar hesabı net tutar üzerinden yapılır. Tahsilat takibi kapsam dışıdır."
      />

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Faturalar yüklenemedi. 0004 numaralı migration&apos;ın uygulandığını
          kontrol edin.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div>
          {liste.length === 0 ? (
            <BosDurum
              baslik="Henüz fatura yok"
              aciklama="Sağdaki formdan ilk faturayı girin. Girilen faturalar özet sayfasındaki gelir ve kâr/zarar hesabına dahil olur."
            />
          ) : (
            <>
              <Kart className="overflow-x-auto p-0">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-paper-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3">Tarih</th>
                      <th scope="col" className="px-5 py-3">Müşteri</th>
                      <th scope="col" className="px-5 py-3">Fatura no</th>
                      <th scope="col" className="px-5 py-3 text-right">Net</th>
                      <th scope="col" className="px-5 py-3 text-right">Brüt</th>
                      <th scope="col" className="px-5 py-3">
                        <span className="sr-only">İşlem</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((f) => {
                      const m = f.customers as unknown as { id: string; name: string } | null;
                      return (
                        <tr key={f.id} className="border-b border-white/5 last:border-0">
                          <td className="px-5 py-3 text-paper-muted">{formatTarih(f.issue_date)}</td>
                          <td className="px-5 py-3 text-paper">{m?.name ?? "—"}</td>
                          <td className="px-5 py-3 font-mono text-xs text-paper-muted">
                            {f.invoice_no ?? "—"}
                          </td>
                          <td className="px-5 py-3 text-right text-paper">
                            {formatPara(f.net_amount)}
                          </td>
                          <td className="px-5 py-3 text-right text-paper-muted">
                            {formatPara(f.gross_amount)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <FaturaSilButonu faturaId={f.id} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Kart>

              <p className="mt-3 text-sm text-paper-muted">
                {liste.length} fatura · toplam net{" "}
                <span className="font-medium text-paper">{formatPara(toplamNet)}</span>
              </p>
            </>
          )}
        </div>

        <Kart className="h-fit">
          <h2 className="mb-4 font-display text-lg font-bold text-paper">
            Yeni fatura
          </h2>
          <FaturaFormu
            musteriler={(musteriler ?? []).map((m) => ({
              id: m.id,
              name: m.name,
              segments: (m.segments ?? []) as { id: string; segment_date: string }[],
            }))}
          />
        </Kart>
      </div>
    </>
  );
}
