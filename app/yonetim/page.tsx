import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type {
  DashboardMusteri,
  DashboardOzet,
} from "@/lib/supabase/database.types";
import {
  BolumBasligi,
  ButonLink,
  IsDurumu,
  Kart,
  Miktar,
  formatPara,
  formatTarih,
} from "@/components/yonetim/ui";
import DonemSecici from "@/components/yonetim/DonemSecici";

/** ISO tarih (YYYY-MM-DD), yerel saate göre — toISOString UTC'ye kaydırıyor. */
function isoTarih(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function donemAralik(donem: string): { baslangic: string; bitis: string } {
  const bugun = new Date();
  const bitis = isoTarih(bugun);
  const bas = new Date(bugun);

  switch (donem) {
    case "yil":
      bas.setFullYear(bas.getFullYear() - 1);
      break;
    case "ceyrek":
      bas.setMonth(bas.getMonth() - 3);
      break;
    default:
      bas.setMonth(bas.getMonth() - 1);
  }
  return { baslangic: isoTarih(bas), bitis };
}

export default async function OzetSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string; bas?: string; bit?: string }>;
}) {
  const { donem = "ay", bas, bit } = await searchParams;
  const supabase = await createClient();

  /* Serbest aralık verilmişse onu kullan; yoksa hazır dönem. Geçersiz
     tarih gelirse hazır döneme düşülüyor — kullanıcıya hata göstermek
     yerine makul bir varsayılan daha iyi. */
  const gecerliTarih = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
  const aralik =
    gecerliTarih(bas) && gecerliTarih(bit) && bas! <= bit!
      ? { baslangic: bas!, bitis: bit! }
      : donemAralik(donem);

  const [ozetSonuc, musteriSonuc, sonIsler, eksiStoklar] = await Promise.all([
    supabase.rpc("dashboard_summary", {
      p_start: aralik.baslangic,
      p_end: aralik.bitis,
    }),
    supabase.rpc("dashboard_by_customer", {
      p_start: aralik.baslangic,
      p_end: aralik.bitis,
    }),
    supabase
      .from("jobs")
      .select("id, title, status, created_at, segments(id, customers(id, name))")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("products")
      .select("id, name, qty_pieces, qty_kg")
      .or("qty_pieces.lt.0,qty_kg.lt.0"),
  ]);

  const ozet = ozetSonuc.data as DashboardOzet | null;
  const musteriler = (musteriSonuc.data ?? []) as DashboardMusteri[];
  const eksiler = eksiStoklar.data ?? [];
  const kurulumEksik = Boolean(ozetSonuc.error);

  const karZarar = Number(ozet?.kar_zarar ?? 0);

  return (
    <>
      <BolumBasligi
        baslik="Özet"
        aciklama="Seçilen dönem için gelir, maliyet ve kâr/zarar."
        aksiyon={<ButonLink href="/yonetim/faturalar">Fatura Gir</ButonLink>}
      />

      {kurulumEksik ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-100">
          <p className="font-semibold">Dashboard fonksiyonları bulunamadı</p>
          <p className="mt-2">
            <code className="font-mono">
              supabase/migrations/0004_faz2_fatura_dashboard.sql
            </code>{" "}
            dosyasını Supabase SQL Editor&apos;de çalıştırın.
          </p>
        </div>
      ) : (
        <>
          <DonemSecici
            aktifDonem={donem}
            baslangic={aralik.baslangic}
            bitis={aralik.bitis}
          />

          {/* Ana metrikler */}
          <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kart>
              <dt className="text-sm text-paper-muted">Net gelir</dt>
              <dd className="mt-1 font-display text-2xl font-bold text-paper">
                {formatPara(ozet?.net_gelir ?? 0)}
              </dd>
              <dd className="mt-1 text-xs text-paper-muted">
                Brüt {formatPara(ozet?.brut_gelir ?? 0)} · {ozet?.fatura_sayisi ?? 0} fatura
              </dd>
            </Kart>

            <Kart>
              <dt className="text-sm text-paper-muted">Malzeme maliyeti</dt>
              <dd className="mt-1 font-display text-2xl font-bold text-paper">
                {formatPara(ozet?.malzeme_maliyeti ?? 0)}
              </dd>
              <dd className="mt-1 text-xs text-paper-muted">
                Tamamlanan işlerden
              </dd>
            </Kart>

            <Kart>
              <dt className="text-sm text-paper-muted">Kâr / Zarar</dt>
              {/* Renk tek başına gösterge değil: işaret ve etiket de var */}
              <dd
                className={`mt-1 font-display text-2xl font-bold ${
                  karZarar < 0 ? "text-amber-200" : "text-paper"
                }`}
              >
                {formatPara(karZarar)}
              </dd>
              <dd className="mt-1 text-xs text-paper-muted">
                {karZarar < 0 ? "Zarar" : "Kâr"} · net gelir − maliyet
              </dd>
            </Kart>

            <Kart>
              <dt className="text-sm text-paper-muted">İşler</dt>
              <dd className="mt-1 font-display text-2xl font-bold text-paper">
                {ozet?.tamamlanan_is ?? 0}
              </dd>
              <dd className="mt-1 text-xs text-paper-muted">
                dönemde tamamlandı · {ozet?.acik_is ?? 0} açık
              </dd>
            </Kart>
          </dl>

          {/* Müşteri kırılımı */}
          <h2 className="mb-4 mt-10 font-display text-xl font-bold text-paper">
            Müşteri bazlı kırılım
          </h2>

          {musteriler.length === 0 ? (
            <Kart>
              <p className="text-sm text-paper-muted">
                Bu dönemde faturası veya tamamlanmış işi olan müşteri yok.
              </p>
            </Kart>
          ) : (
            <Kart className="overflow-x-auto p-0">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-paper-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3">Müşteri</th>
                    <th scope="col" className="px-5 py-3 text-right">Net gelir</th>
                    <th scope="col" className="px-5 py-3 text-right">Maliyet</th>
                    <th scope="col" className="px-5 py-3 text-right">Kâr/Zarar</th>
                    <th scope="col" className="px-5 py-3 text-right">İş</th>
                  </tr>
                </thead>
                <tbody>
                  {musteriler.map((m) => (
                    <tr key={m.customer_id} className="border-b border-white/5 last:border-0">
                      <td className="px-5 py-3">
                        <Link
                          href={`/yonetim/musteriler/${m.customer_id}`}
                          className="text-paper underline-offset-4 hover:underline"
                        >
                          {m.customer_name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-right text-paper-muted">
                        {formatPara(m.net_gelir)}
                      </td>
                      <td className="px-5 py-3 text-right text-paper-muted">
                        {formatPara(m.malzeme_maliyeti)}
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-medium ${
                          Number(m.kar_zarar) < 0 ? "text-amber-200" : "text-paper"
                        }`}
                      >
                        {formatPara(m.kar_zarar)}
                      </td>
                      <td className="px-5 py-3 text-right text-paper-muted">
                        {m.tamamlanan_is}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Kart>
          )}
        </>
      )}

      {/* Eksi stok uyarısı */}
      {eksiler.length > 0 && (
        <div className="mt-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
          <h2 className="font-semibold text-amber-100">
            {eksiler.length} ürünün stoğu eksiye düşmüş
          </h2>
          <p className="mt-1 text-sm text-amber-100/80">
            Bu genellikle girilmemiş bir stok alımı anlamına gelir ve maliyet
            hesabını etkiler.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-amber-100">
            {eksiler.map((u) => (
              <li key={u.id}>
                <Link href="/yonetim/urunler" className="underline-offset-4 hover:underline">
                  {u.name}
                </Link>
                {" — "}
                <Miktar adet={u.qty_pieces} kg={Number(u.qty_kg)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Son işler */}
      <h2 className="mb-4 mt-10 font-display text-xl font-bold text-paper">
        Son işler
      </h2>

      {(sonIsler.data ?? []).length === 0 ? (
        <Kart>
          <p className="text-sm text-paper-muted">
            Henüz iş kaydı yok. Bir müşteri açıp segment ve iş ekleyerek
            başlayın.
          </p>
        </Kart>
      ) : (
        <Kart className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-paper-muted">
              <tr>
                <th scope="col" className="px-5 py-3">İş</th>
                <th scope="col" className="px-5 py-3">Müşteri</th>
                <th scope="col" className="px-5 py-3">Durum</th>
                <th scope="col" className="px-5 py-3">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {(sonIsler.data ?? []).map((is) => {
                const segment = is.segments as unknown as {
                  id: string;
                  customers: { id: string; name: string } | null;
                } | null;
                const musteri = segment?.customers ?? null;

                return (
                  <tr key={is.id} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-3">
                      <Link
                        href={`/yonetim/isler/${is.id}`}
                        className="font-medium text-paper underline-offset-4 hover:underline"
                      >
                        {is.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-paper-muted">
                      {musteri ? (
                        <Link
                          href={`/yonetim/musteriler/${musteri.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {musteri.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <IsDurumu durum={is.status} />
                    </td>
                    <td className="px-5 py-3 text-paper-muted">
                      {formatTarih(is.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Kart>
      )}
    </>
  );
}
