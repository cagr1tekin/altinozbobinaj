import { createClient } from "@/lib/supabase/server";
import type { AramaSonucu } from "@/lib/supabase/database.types";
import { aralikCoz, aralikEtiketi } from "@/lib/donem";
import PanelArama from "@/components/panel/PanelArama";
import AramaSonuclari from "@/components/panel/AramaSonuclari";
import DonemSecici from "@/components/panel/DonemSecici";
import {
  Bolum,
  BosDurum,
  ButonLink,
  Icerik,
  IsDurumu,
  IslemTuru,
  Liste,
  ListeSatiri,
  Miktar,
  UstCubuk,
  Uyari,
  formatTarih,
  islemleriSirala,
} from "@/components/panel/ui";

/**
 * Özet — günlük iş ekranı.
 *
 * Atölyede en sık sorulan soru "şu an elimde ne var". Finansal rakamlar ve
 * grafikler Raporlar sekmesinde.
 *
 * Tarih filtresi TAMAMLANAN işlere uygulanıyor, açık işlere değil.
 * Bu bilinçli: iki ay önce açılmış ve hâlâ bitmemiş bir iş, unutulmuş
 * demektir ve Özet'ten kaybolması gereken en son şeydir. Filtre listeyi
 * sınırlamak için var; açık işleri sınırlamak amaca ters düşerdi.
 */
type Segment = { segment_date: string; customers: { name: string } | null };

export default async function OzetSayfasi({
  searchParams,
}: {
  searchParams: Promise<{
    ara?: string;
    donem?: string;
    bas?: string;
    bit?: string;
  }>;
}) {
  const { ara, donem, bas, bit } = await searchParams;
  const terim = (ara ?? "").trim();
  const aramaVar = terim.length > 0;
  const aralik = aralikCoz({ donem, bas, bit });
  const supabase = await createClient();

  const [acikIsler, tamamlananIsler, eksiStoklar] = await Promise.all([
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
      .from("jobs")
      .select(
        "id, title, status, completed_at, created_at, service_types, segments(segment_date, customers(name))"
      )
      .eq("status", "completed")
      .is("deleted_at", null)
      .is("segments.deleted_at", null)
      /* Aralık tamamlanma tarihine göre: iş ne zaman bitti sorusu, ne
         zaman açıldı sorusundan farklı ve burada bitiş önemli.
         `bitis` gün sonuna kadar kapsanmalı — completed_at timestamptz
         olduğu için tarihin kendisi 00:00'ı işaret ediyor ve o günün
         işleri dışarıda kalıyordu. */
      .gte("completed_at", `${aralik.baslangic}T00:00:00`)
      .lte("completed_at", `${aralik.bitis}T23:59:59.999`)
      .order("completed_at", { ascending: false })
      .limit(100),
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
  const bitenler = tamamlananIsler.data ?? [];
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
            sirali.length > 0
              ? "Tamamlanmamış tüm işler — tarih filtresinden etkilenmez"
              : undefined
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
                const segment = is.segments as unknown as Segment | null;
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

        {/* Tamamlanan işler — tarih aralığına bağlı.
            Filtre bu bölümün ÜSTÜNDE: neyi etkilediği yanında dursun. */}
        <Bolum
          baslik={`Tamamlanan işler${
            bitenler.length > 0 ? ` (${bitenler.length})` : ""
          }`}
          aciklama={aralikEtiketi(aralik)}
        >
          <div className="mb-3">
            <DonemSecici
              temelYol="/yonetim"
              aktifDonem={aralik.donem}
              baslangic={aralik.baslangic}
              bitis={aralik.bitis}
              /* Arama terimi korunuyor: dönem değiştirmek aramayı
                 sıfırlarsa kullanıcı terimi yeniden yazmak zorunda. */
              korunan={{ ara: terim || undefined }}
            />
          </div>

          {bitenler.length === 0 ? (
            <BosDurum
              baslik="Bu aralıkta tamamlanan iş yok"
              aciklama="Daha geniş bir tarih aralığı seçmeyi deneyin."
            />
          ) : (
            <Liste>
              {bitenler.map((is) => {
                const segment = is.segments as unknown as Segment | null;
                return (
                  <ListeSatiri
                    key={is.id}
                    href={`/yonetim/isler/${is.id}`}
                    baslik={is.title}
                    altBilgi={`${segment?.customers?.name ?? "—"} · ${formatTarih(
                      is.completed_at
                    )}`}
                    sag={
                      /* Yapılan işlem rozeti: tamamlanan işte "ne
                         yapıldı" sorusu durumdan daha bilgilendirici —
                         durum zaten hepsinde "Tamamlandı". */
                      <span className="flex flex-wrap justify-end gap-1">
                        {islemleriSirala(is.service_types ?? []).map((t) => (
                          <IslemTuru key={t} tur={t} />
                        ))}
                      </span>
                    }
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
