import { createClient } from "@/lib/supabase/server";
import {
  Bolum,
  BosDurum,
  ButonLink,
  Icerik,
  IsDurumu,
  Liste,
  ListeSatiri,
  Miktar,
  UstCubuk,
  Uyari,
  formatTarih,
} from "@/components/panel/ui";

/**
 * Özet — açık işler.
 *
 * Atölyede en sık sorulan soru "şu an elimde ne var". Finansal rakamlar ve
 * grafikler Raporlar sekmesinde; burası günlük iş ekranı.
 *
 * İleride kısayollar da bu sayfaya eklenecek.
 */
export default async function OzetSayfasi() {
  const supabase = await createClient();

  const [acikIsler, eksiStoklar] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, title, status, created_at, segments(segment_date, customers(name))"
      )
      .neq("status", "completed")
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("products")
      .select("id, name, qty_pieces, qty_kg")
      .or("qty_pieces.lt.0,qty_kg.lt.0"),
  ]);

  const isler = acikIsler.data ?? [];
  const eksiler = eksiStoklar.data ?? [];
  const kurulumEksik = Boolean(acikIsler.error);

  /* Devam edenler bekleyenlerin üstünde: sırada olan iş önce görünmeli */
  const sirali = [...isler].sort((a, b) => {
    if (a.status === b.status) return a.created_at.localeCompare(b.created_at);
    return a.status === "in_progress" ? -1 : 1;
  });

  return (
    <>
      <UstCubuk baslik="Özet" />

      <Icerik>
        {kurulumEksik && (
          <div className="mb-4">
            <Uyari tur="hata" baslik="Veriler yüklenemedi">
              Supabase bağlantısını ve <code>supabase/kurulum-tumu.sql</code>{" "}
              dosyasının çalıştırıldığını kontrol edin.
            </Uyari>
          </div>
        )}

        {eksiler.length > 0 && (
          <div className="mb-6">
            <Uyari baslik={`${eksiler.length} üründe stok eksiye düşmüş`}>
              <p>Genellikle girilmemiş bir stok alımı anlamına gelir.</p>
              <ul className="mt-2 space-y-1">
                {eksiler.map((u) => (
                  <li key={u.id}>
                    {u.name} —{" "}
                    <Miktar adet={u.qty_pieces} kg={Number(u.qty_kg)} />
                  </li>
                ))}
              </ul>
            </Uyari>
          </div>
        )}

        <Bolum
          baslik={`Açık işler${sirali.length > 0 ? ` (${sirali.length})` : ""}`}
          aciklama={
            sirali.length > 0 ? "Tamamlanmamış tüm işler" : undefined
          }
        >
          {sirali.length === 0 ? (
            <BosDurum
              baslik="Açık iş yok"
              aciklama="Tüm işler tamamlanmış. Yeni iş eklemek için müşteriye gidip segment açın."
              eylem={
                <ButonLink href="/yonetim/musteriler">Müşteriler</ButonLink>
              }
            />
          ) : (
            <Liste>
              {sirali.map((is) => {
                const segment = is.segments as unknown as {
                  segment_date: string;
                  customers: { name: string } | null;
                } | null;
                return (
                  <ListeSatiri
                    key={is.id}
                    href={`/yonetim/isler/${is.id}`}
                    baslik={is.title}
                    altBilgi={`${segment?.customers?.name ?? "—"} · ${formatTarih(
                      segment?.segment_date ?? is.created_at
                    )}`}
                    sag={<IsDurumu durum={is.status} />}
                  />
                );
              })}
            </Liste>
          )}
        </Bolum>
      </Icerik>
    </>
  );
}
