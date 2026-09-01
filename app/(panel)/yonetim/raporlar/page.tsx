import { createClient } from "@/lib/supabase/server";
import type {
  AylikTrend,
  DashboardMusteri,
  DashboardOzet,
} from "@/lib/supabase/database.types";
import {
  Bolum,
  ButonLink,
  Icerik,
  Liste,
  ListeSatiri,
  OzetKarti,
  UstCubuk,
  Uyari,
  formatPara,
} from "@/components/panel/ui";
import DonemSecici from "@/components/panel/DonemSecici";
import KarZararGrafigi from "@/components/panel/KarZararGrafigi";

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

export default async function RaporlarSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string; bas?: string; bit?: string }>;
}) {
  const { donem = "ay", bas, bit } = await searchParams;
  const supabase = await createClient();

  const gecerli = (v?: string) => Boolean(v && TARIH_BICIMI.test(v));
  const aralik =
    gecerli(bas) && gecerli(bit) && bas! <= bit!
      ? { baslangic: bas!, bitis: bit! }
      : donemAralik(donem);

  const [ozetSonuc, musteriSonuc, trendSonuc] = await Promise.all([
    supabase.rpc("dashboard_summary", {
      p_start: aralik.baslangic,
      p_end: aralik.bitis,
    }),
    supabase.rpc("dashboard_by_customer", {
      p_start: aralik.baslangic,
      p_end: aralik.bitis,
    }),
    supabase.rpc("monthly_trend", { p_ay_sayisi: 12 }),
  ]);

  const ozet = ozetSonuc.data as DashboardOzet | null;
  const musteriler = (musteriSonuc.data ?? []) as DashboardMusteri[];
  const trend = (trendSonuc.data ?? []) as AylikTrend[];
  const kurulumEksik = Boolean(ozetSonuc.error);
  const karZarar = Number(ozet?.kar_zarar ?? 0);

  return (
    <>
      <UstCubuk baslik="Raporlar" />

      <Icerik>
        {kurulumEksik ? (
          <Uyari baslik="Rapor fonksiyonları bulunamadı">
            <code>supabase/kurulum-tumu.sql</code> dosyasını Supabase SQL
            Editor&apos;de çalıştırın.
          </Uyari>
        ) : (
          <>
            <div className="mb-4">
              <DonemSecici
                temelYol="/yonetim/raporlar"
                aktifDonem={donem}
                baslangic={aralik.baslangic}
                bitis={aralik.bitis}
              />
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3">
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

            <Bolum baslik="Aylık seyir">
              <KarZararGrafigi veri={trend} />
            </Bolum>

            <Bolum baslik="Müşteri bazlı">
              {musteriler.length === 0 ? (
                <p className="rounded-lg border border-pnl-line bg-pnl-surface p-4 text-sm text-pnl-muted">
                  Bu dönemde faturası veya tamamlanmış işi olan müşteri yok.
                </p>
              ) : (
                <Liste>
                  {musteriler.map((m) => (
                    <ListeSatiri
                      key={m.customer_id}
                      href={`/yonetim/musteriler/${m.customer_id}`}
                      baslik={m.customer_name}
                      altBilgi={`${formatPara(m.net_gelir)} gelir · ${formatPara(
                        m.malzeme_maliyeti
                      )} gider · ${m.tamamlanan_is} iş`}
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
              )}
            </Bolum>

            <Bolum baslik="Belgeler">
              <ButonLink
                href={`/api/pdf/donem?bas=${aralik.baslangic}&bit=${aralik.bitis}`}
                tur="ikincil"
                tamGenislik
              >
                Dönem raporunu indir (PDF)
              </ButonLink>
            </Bolum>
          </>
        )}
      </Icerik>
    </>
  );
}
