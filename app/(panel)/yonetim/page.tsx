import { createClient } from "@/lib/supabase/server";
import type {
  DashboardMusteri,
  DashboardOzet,
} from "@/lib/supabase/database.types";
import {
  Bolum,
  BosDurum,
  ButonLink,
  Icerik,
  IsDurumu,
  Liste,
  ListeSatiri,
  Miktar,
  OzetKarti,
  UstCubuk,
  Uyari,
  formatPara,
  formatTarih,
} from "@/components/panel/ui";
import DonemSecici from "@/components/panel/DonemSecici";

/** ISO tarih, yerel saate göre — toISOString UTC'ye kaydırıyor. */
function isoTarih(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function donemAralik(donem: string): { baslangic: string; bitis: string } {
  const bugun = new Date();
  const bas = new Date(bugun);
  if (donem === "yil") bas.setFullYear(bas.getFullYear() - 1);
  else if (donem === "ceyrek") bas.setMonth(bas.getMonth() - 3);
  else bas.setMonth(bas.getMonth() - 1);
  return { baslangic: isoTarih(bas), bitis: isoTarih(bugun) };
}

const TARIH_BICIMI = /^\d{4}-\d{2}-\d{2}$/;

export default async function OzetSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string; bas?: string; bit?: string }>;
}) {
  const { donem = "ay", bas, bit } = await searchParams;
  const supabase = await createClient();

  /* Serbest aralık geçersizse hazır döneme düşülüyor — kullanıcıya hata
     göstermek yerine makul bir varsayılan daha iyi. */
  const gecerli = (v?: string) => Boolean(v && TARIH_BICIMI.test(v));
  const aralik =
    gecerli(bas) && gecerli(bit) && bas! <= bit!
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
      .select("id, title, status, created_at, segments(customers(name))")
      .order("created_at", { ascending: false })
      .limit(5),
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
      <UstCubuk baslik="Özet" />

      <Icerik>
        {kurulumEksik ? (
          <Uyari baslik="Dashboard fonksiyonları bulunamadı">
            <code>supabase/kurulum-tumu.sql</code> dosyasını Supabase SQL
            Editor&apos;de çalıştırın.
          </Uyari>
        ) : (
          <>
            <div className="mb-4">
              <DonemSecici
                aktifDonem={donem}
                baslangic={aralik.baslangic}
                bitis={aralik.bitis}
              />
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <OzetKarti
                etiket="Net gelir"
                deger={formatPara(ozet?.net_gelir ?? 0)}
                alt={`${ozet?.fatura_sayisi ?? 0} fatura`}
              />
              <OzetKarti
                etiket="Malzeme gideri"
                deger={formatPara(ozet?.malzeme_maliyeti ?? 0)}
                alt="Tamamlanan işlerden"
              />
              {/* Kâr/zarar renkle DEĞİL etiketle ayrışıyor; renk destekleyici */}
              <OzetKarti
                etiket={karZarar < 0 ? "Zarar" : "Kâr"}
                deger={formatPara(karZarar)}
                alt="Net gelir − gider"
                vurgu={karZarar < 0 ? "uyari" : "normal"}
              />
              <OzetKarti
                etiket="Tamamlanan iş"
                deger={ozet?.tamamlanan_is ?? 0}
                alt={`${ozet?.acik_is ?? 0} iş açık`}
              />
            </div>

            <div className="mb-6">
              <ButonLink
                href={`/api/pdf/donem?bas=${aralik.baslangic}&bit=${aralik.bitis}`}
                tur="ikincil"
                tamGenislik
              >
                Dönem raporunu indir (PDF)
              </ButonLink>
            </div>

            {musteriler.length > 0 && (
              <Bolum baslik="Müşteri bazlı">
                <Liste>
                  {musteriler.map((m) => (
                    <ListeSatiri
                      key={m.customer_id}
                      href={`/yonetim/musteriler/${m.customer_id}`}
                      baslik={m.customer_name}
                      altBilgi={`${formatPara(m.net_gelir)} gelir · ${m.tamamlanan_is} iş`}
                      sag={
                        <span
                          className={`font-semibold ${
                            Number(m.kar_zarar) < 0
                              ? "text-pnl-warn"
                              : "text-pnl-text"
                          }`}
                        >
                          {formatPara(m.kar_zarar)}
                        </span>
                      }
                    />
                  ))}
                </Liste>
              </Bolum>
            )}
          </>
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

        <Bolum baslik="Son işler">
          {(sonIsler.data ?? []).length === 0 ? (
            <BosDurum
              baslik="Henüz iş kaydı yok"
              aciklama="Bir müşteri açıp segment ve iş ekleyerek başlayın."
              eylem={<ButonLink href="/yonetim/musteriler">Müşteriler</ButonLink>}
            />
          ) : (
            <Liste>
              {(sonIsler.data ?? []).map((is) => {
                const segment = is.segments as unknown as {
                  customers: { name: string } | null;
                } | null;
                return (
                  <ListeSatiri
                    key={is.id}
                    href={`/yonetim/isler/${is.id}`}
                    baslik={is.title}
                    altBilgi={`${segment?.customers?.name ?? "—"} · ${formatTarih(
                      is.created_at
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
