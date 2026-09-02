import { createClient } from "@/lib/supabase/server";
import type { AramaSonucu } from "@/lib/supabase/database.types";
import PanelArama from "@/components/panel/PanelArama";
import AramaSonuclari from "@/components/panel/AramaSonuclari";
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
export default async function OzetSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ ara?: string }>;
}) {
  const { ara } = await searchParams;
  const terim = (ara ?? "").trim();
  const aramaVar = terim.length > 0;
  const supabase = await createClient();

  const [acikIsler, eksiStoklar] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, title, status, created_at, segments(segment_date, customers(name))"
      )
      .neq("status", "completed")
      .is("deleted_at", null)
      /* Silinmiş segmentin işi açık işler listesinde görünmemeli. */
      .is("segments.deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("products")
      .select("id, name, unit_type_default, qty_pieces, qty_grams")
      .is("deleted_at", null)
      .or("qty_pieces.lt.0,qty_grams.lt.0"),
  ]);

  /* Arama yapılmadıysa sorgu hiç gönderilmiyor: her sayfa açılışına
     gereksiz bir gidiş-dönüş eklemenin anlamı yok. */
  const aramaSonuc = aramaVar
    ? await supabase.rpc("panel_arama", { p_terim: terim, p_limit: 30 })
    : null;
  const sonuclar = (aramaSonuc?.data ?? []) as AramaSonucu[];

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
        <div className="mb-4">
          <PanelArama varsayilan={terim} />
        </div>

        {/* Arama yapıldığında açık iş listesi yerine sonuçlar öne geçiyor:
            kullanıcı bir şey aradıysa onu görmek istiyor. */}
        {aramaVar && (
          <div className="mb-6">
            <Bolum
              baslik={`Arama sonuçları${
                sonuclar.length > 0 ? ` (${sonuclar.length})` : ""
              }`}
              aciklama="Müşteri ve motor adında arandı"
            >
              {aramaSonuc?.error ? (
                <Uyari tur="hata" baslik="Arama yapılamadı">
                  <code>supabase/kurulum-tumu.sql</code> dosyasını Supabase SQL
                  Editor&apos;de çalıştırın.
                </Uyari>
              ) : (
                <AramaSonuclari terim={terim} sonuclar={sonuclar} />
              )}
            </Bolum>
          </div>
        )}

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
                    <Miktar
                      birim={u.unit_type_default}
                      adet={u.qty_pieces}
                      gram={Number(u.qty_grams)}
                    />
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
