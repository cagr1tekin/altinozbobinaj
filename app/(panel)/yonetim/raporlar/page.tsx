import { createClient } from "@/lib/supabase/server";
import type {
  AuditKaydi,
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
import { aralikCoz } from "@/lib/donem";
import KarZararGrafigi from "@/components/panel/KarZararGrafigi";
import Bilgi from "@/components/panel/Bilgi";
import DenetimGunlugu from "@/components/panel/DenetimGunlugu";

/* Hareket geçmişinde gösterilen kayıt sayısı. Tamamını çekmek sayfayı
   zamanla yavaşlatır; günlük kullanımda son hareketler yeterli. */
const DENETIM_LIMIT = 50;

export default async function RaporlarSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ donem?: string; bas?: string; bit?: string }>;
}) {
  const { donem, bas, bit } = await searchParams;
  const supabase = await createClient();

  /* Aralık çözümlemesi lib/donem.ts'te: Özet, Raporlar ve PDF route'ları
     aynı kuralı uygulamalı, yoksa aynı bağlantı üç ekranda farklı
     aralık gösteriyor. */
  const aralik = aralikCoz({ donem, bas, bit });

  const [ozetSonuc, musteriSonuc, trendSonuc, denetimSonuc] = await Promise.all([
    supabase.rpc("dashboard_summary", {
      p_start: aralik.baslangic,
      p_end: aralik.bitis,
    }),
    supabase.rpc("dashboard_by_customer", {
      p_start: aralik.baslangic,
      p_end: aralik.bitis,
    }),
    supabase.rpc("monthly_trend", { p_ay_sayisi: 12 }),
    /* Hareket geçmişi dönemden bağımsız: "en son ne oldu" sorusu tarih
       aralığıyla değil zamanla ilgili. */
    supabase
      .from("audit_log")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(DENETIM_LIMIT),
  ]);

  const ozet = ozetSonuc.data as DashboardOzet | null;
  const musteriler = (musteriSonuc.data ?? []) as DashboardMusteri[];
  const trend = (trendSonuc.data ?? []) as AylikTrend[];
  const denetim = (denetimSonuc.data ?? []) as AuditKaydi[];
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
                aktifDonem={aralik.donem}
                baslangic={aralik.baslangic}
                bitis={aralik.bitis}
              />
            </div>

            {/* Gelir NAKİT esaslı: dönemde eline geçen para. Yanındaki
                "kalan alacak" kartı olmadan bu rakam yanıltıcı olurdu —
                yapılmış ama tahsil edilmemiş iş kayıp gibi görünürdü. */}
            <div className="mb-2 grid grid-cols-2 gap-3">
              <OzetKarti
                etiket="Tahsilat"
                deger={formatPara(ozet?.tahsilat ?? 0)}
                alt={`${ozet?.tahsilat_sayisi ?? 0} vade`}
              />
              <OzetKarti
                etiket="Kalan alacak"
                deger={formatPara(ozet?.kalan_alacak ?? 0)}
                alt="Dönem sonu itibarıyla"
                vurgu={(ozet?.kalan_alacak ?? 0) > 0 ? "uyari" : "normal"}
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
                alt="Tahsilat − gider"
                vurgu={karZarar < 0 ? "uyari" : "normal"}
              />
            </div>

            <div className="mb-6 flex items-start gap-1">
              <p className="text-sm text-pnl-muted">
                Dönemde {formatPara(ozet?.anlasilan_tutar ?? 0)} anlaşıldı
                {(ozet?.elden_sayisi ?? 0) > 0 &&
                  ` (${formatPara(ozet?.faturali_anlasilan ?? 0)} faturalı, ${formatPara(
                    ozet?.elden_anlasilan ?? 0
                  )} faturasız)`}
                {" · "}
                {ozet?.tamamlanan_is ?? 0} iş tamamlandı, {ozet?.acik_is ?? 0}{" "}
                iş açık
              </p>
              <Bilgi ad="Gelir hesabı">
                <strong>Tahsilat</strong> dönemde fiilen eline geçen para;
                ölçüt vadenin tarihi, fatura tarihi değil. Kâr/zarar da bu
                rakamdan hesaplanıyor — &quot;bu ay kasaya ne girdi&quot;
                sorusunun cevabı.
                <br />
                <strong>Anlaşılan</strong> dönemde konuşulan toplam. Tahsil
                edilmemiş kısmı <strong>kalan alacak</strong> olarak
                duruyor; kalan alacak bir bakiye, dönemin akışı değil, o
                yüzden daha eski aylardan devreden borçları da içerir.
              </Bilgi>
            </div>

            <Bolum
              baslik="Aylık seyir"
              bilgi="Her ay tahsil edilen para eksi o ay tamamlanan işlerin malzeme gideri. Para hangi ay alındıysa o aya yazılıyor."
            >
              <KarZararGrafigi veri={trend} />
            </Bolum>

            <Bolum
              baslik="Müşteri bazlı"
              bilgi="Sağdaki rakam kâr/zarar (tahsilat − malzeme gideri). Alt satırdaki 'alacak', o müşterinin bugüne kadar birikmiş ödenmemiş borcu — dönemden bağımsız."
            >
              {musteriler.length === 0 ? (
                <p className="rounded-lg border border-pnl-line bg-pnl-surface p-4 text-sm text-pnl-muted">
                  Bu dönemde tahsilatı, tamamlanmış işi veya açık alacağı
                  olan müşteri yok.
                </p>
              ) : (
                <Liste>
                  {musteriler.map((m) => (
                    <ListeSatiri
                      key={m.customer_id}
                      href={`/yonetim/musteriler/${m.customer_id}`}
                      baslik={m.customer_name}
                      altBilgi={
                        `${formatPara(m.tahsilat)} tahsilat · ${formatPara(
                          m.malzeme_maliyeti
                        )} gider · ${m.tamamlanan_is} iş` +
                        (Number(m.kalan_alacak) > 0
                          ? ` · ${formatPara(m.kalan_alacak)} alacak`
                          : "")
                      }
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

            {/* En altta: günlük iş akışının parçası değil, "ne oldu"
                sorusuna bakılan yer. */}
            <Bolum baslik="Hareket geçmişi" bilgi="Kim ne zaman ne yaptı.">
              <DenetimGunlugu
                kayitlar={denetim}
                eksik={Boolean(denetimSonuc.error)}
              />
            </Bolum>
          </>
        )}
      </Icerik>
    </>
  );
}
