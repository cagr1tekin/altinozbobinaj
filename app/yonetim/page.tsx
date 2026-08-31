import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  BolumBasligi,
  ButonLink,
  IsDurumu,
  Kart,
  Miktar,
  formatTarih,
} from "@/components/yonetim/ui";

export default async function OzetSayfasi() {
  const supabase = await createClient();

  /* Sayımlar head:true ile yapılıyor: satır verisi çekilmiyor,
     yalnızca count dönüyor. */
  const [
    musteriSayisi,
    acikIsSayisi,
    tamamlananIsSayisi,
    urunSayisi,
    sonIsler,
    eksiStoklar,
  ] = await Promise.all([
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .neq("status", "completed"),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed"),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase
      .from("jobs")
      .select(
        "id, title, status, created_at, segments(id, customers(id, name))"
      )
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("products")
      .select("id, name, qty_pieces, qty_kg")
      .or("qty_pieces.lt.0,qty_kg.lt.0"),
  ]);

  const kartlar = [
    { etiket: "Müşteri", deger: musteriSayisi.count ?? 0 },
    { etiket: "Açık iş", deger: acikIsSayisi.count ?? 0 },
    { etiket: "Tamamlanan iş", deger: tamamlananIsSayisi.count ?? 0 },
    { etiket: "Ürün çeşidi", deger: urunSayisi.count ?? 0 },
  ];

  const eksiler = eksiStoklar.data ?? [];

  return (
    <>
      <BolumBasligi
        baslik="Özet"
        aciklama="Müşteri, iş ve stok durumuna genel bakış."
        aksiyon={<ButonLink href="/yonetim/musteriler/yeni">Yeni Müşteri</ButonLink>}
      />

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kartlar.map((k) => (
          <Kart key={k.etiket}>
            <dt className="text-sm text-paper-muted">{k.etiket}</dt>
            <dd className="mt-1 font-display text-3xl font-bold text-paper">
              {k.deger}
            </dd>
          </Kart>
        ))}
      </dl>

      {/* Eksi stok, girilmemiş bir alım kaydının işaretidir; sessiz
          kalmak maliyet hesabını bozar. */}
      {eksiler.length > 0 && (
        <div className="mt-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
          <h2 className="font-semibold text-amber-100">
            {eksiler.length} ürünün stoğu eksiye düşmüş
          </h2>
          <p className="mt-1 text-sm text-amber-100/80">
            Bu genellikle girilmemiş bir stok alımı anlamına gelir. Ürünler
            sayfasından stok girişi yapın.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-amber-100">
            {eksiler.map((u) => (
              <li key={u.id}>
                <Link
                  href="/yonetim/urunler"
                  className="underline-offset-4 hover:underline"
                >
                  {u.name}
                </Link>
                {" — "}
                <Miktar adet={u.qty_pieces} kg={u.qty_kg} />
              </li>
            ))}
          </ul>
        </div>
      )}

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
