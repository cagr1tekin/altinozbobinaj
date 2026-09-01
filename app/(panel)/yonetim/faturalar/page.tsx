import { createClient } from "@/lib/supabase/server";
import {
  Bolum,
  BosDurum,
  Icerik,
  Kart,
  UstCubuk,
  Uyari,
  formatPara,
  formatTarih,
} from "@/components/panel/ui";
import FaturaFormu from "@/components/panel/FaturaFormu";
import FaturaSilButonu from "@/components/panel/FaturaSilButonu";

export default async function FaturalarSayfasi() {
  const supabase = await createClient();

  const [{ data: faturalar, error }, { data: musteriler }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, invoice_no, gross_amount, net_amount, issue_date, customers(id, name)"
      )
      .order("issue_date", { ascending: false })
      .limit(100),
    supabase
      .from("customers")
      .select("id, name, segments(id, segment_date)")
      .order("name", { ascending: true }),
  ]);

  const liste = faturalar ?? [];
  const toplamNet = liste.reduce((a, f) => a + Number(f.net_amount), 0);

  return (
    <>
      <UstCubuk baslik="Faturalar" />

      <Icerik>
        {error && (
          <div className="mb-4">
            <Uyari tur="hata" baslik="Faturalar yüklenemedi">
              <code>supabase/kurulum-tumu.sql</code> dosyasının çalıştırıldığını
              kontrol edin.
            </Uyari>
          </div>
        )}

        <Bolum baslik="Yeni fatura">
          <Kart>
            <FaturaFormu
              musteriler={(musteriler ?? []).map((m) => ({
                id: m.id,
                name: m.name,
                segments: (m.segments ?? []) as {
                  id: string;
                  segment_date: string;
                }[],
              }))}
            />
          </Kart>
        </Bolum>

        <Bolum
          baslik="Kayıtlı faturalar"
          aciklama={
            liste.length > 0
              ? `${liste.length} fatura · toplam net ${formatPara(toplamNet)}`
              : undefined
          }
        >
          {liste.length === 0 ? (
            <BosDurum
              baslik="Henüz fatura yok"
              aciklama="Yukarıdaki formdan ilk faturayı girin. Girilen faturalar özet sayfasındaki kâr/zarar hesabına dahil olur."
            />
          ) : (
            <ul className="divide-y divide-pnl-line overflow-hidden rounded-lg border border-pnl-line bg-pnl-surface">
              {liste.map((f) => {
                const m = f.customers as unknown as { name: string } | null;
                return (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {m?.name ?? "—"}
                      </p>
                      <p className="mt-0.5 text-sm text-pnl-muted">
                        {formatTarih(f.issue_date)}
                        {f.invoice_no && ` · ${f.invoice_no}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">
                        {formatPara(f.net_amount)}
                      </p>
                      <p className="text-xs text-pnl-faint">net</p>
                    </div>
                    <FaturaSilButonu faturaId={f.id} />
                  </li>
                );
              })}
            </ul>
          )}
        </Bolum>
      </Icerik>
    </>
  );
}
