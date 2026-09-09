import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Bolum,
  Icerik,
  Liste,
  ListeSatiri,
  SegmentDurumu,
  UstCubuk,
  formatPara,
  formatTarih,
} from "@/components/panel/ui";
import { PdfBaglantilari } from "@/components/panel/PdfButonlari";
import { aralikCoz } from "@/lib/donem";
import EkleAcilir from "@/components/panel/EkleAcilir";
import MusteriFormu from "@/components/panel/MusteriFormu";
import SegmentFormu from "@/components/panel/SegmentFormu";

export default async function MusteriDetaySayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  /* PDF tarih alanlarının başlangıç değeri. Son 1 yıl: müşteri
     belgesinde en sık istenen "bu yıl ne yaptık" ve son 1 ay çoğu
     müşteride boş çıkardı — aynı müşteri her ay gelmiyor. */
  const pdfAralik = aralikCoz({ donem: "yil" });

  const [{ data: musteri }, { data: segmentler }, { data: bakiyeler }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("segments")
        .select("id, segment_date, note, status, jobs(id, status)")
        .eq("customer_id", id)
        .is("deleted_at", null)
        /* Silinmiş iş, segmentin "açık iş" sayacında görünmemeli. */
        .is("jobs.deleted_at", null)
        .order("segment_date", { ascending: false }),
      /* "Bu müşteri bana ne kadar borçlu" bu ekranın en sık sorulan
         sorusu; her segmente girip bakmak gerekmemeli. */
      supabase
        .from("segment_balances")
        .select("segment_id, kalan")
        .eq("customer_id", id),
    ]);

  if (!musteri) notFound();

  const liste = segmentler ?? [];

  const kalanlar = new Map(
    (bakiyeler ?? []).map((b) => [
      b.segment_id,
      b.kalan === null ? null : Number(b.kalan),
    ])
  );

  /* Fazla tahsilat başka bir segmentin borcunu kapatmıyor: negatifler
     sıfıra çekiliyor, yoksa toplam borç olduğundan küçük görünürdü. */
  const toplamAlacak = [...kalanlar.values()].reduce<number>(
    (a, k) => a + Math.max(k ?? 0, 0),
    0
  );

  return (
    <>
      <UstCubuk
        baslik={musteri.name}
        geriHref="/yonetim/musteriler"
        geriEtiket="Müşteriler"
      />

      <Icerik>
        <Bolum
          baslik="Segmentler"
          aciklama={
            toplamAlacak > 0
              ? `${liste.length} geliş · ${formatPara(toplamAlacak)} açık alacak`
              : `${liste.length} geliş`
          }
          bilgi="Müşterinin her gelişi bir segment: o gün bıraktığı bütün işler ve o iş grubunun parası birlikte takip ediliyor. Sağdaki rakam o segmentten kalan borç."
        >
          <Liste
            ekleme={
              <EkleAcilir
                etiket="Yeni segment aç"
                ilkAcik={liste.length === 0}
              >
                <SegmentFormu musteriId={musteri.id} />
              </EkleAcilir>
            }
          >
            {liste.length > 0 &&
              liste.map((s) => {
                const isler = (s.jobs ?? []) as Array<{ status: string }>;
                const tamamlanan = isler.filter(
                  (i) => i.status === "completed"
                ).length;
                const kalan = kalanlar.get(s.id) ?? null;
                return (
                  <ListeSatiri
                    key={s.id}
                    href={`/yonetim/segmentler/${s.id}`}
                    baslik={formatTarih(s.segment_date)}
                    altBilgi={
                      s.note
                        ? `${s.note} · ${isler.length} iş`
                        : `${isler.length} iş · ${tamamlanan} tamamlandı`
                    }
                    sag={
                      <span className="flex flex-col items-end gap-1">
                        <SegmentDurumu durum={s.status} />
                        {/* Kalan yalnızca borç varken yazılıyor. "0 TL"
                            yazmak, anlaşılan tutarı hiç girilmemiş bir
                            segmentte "borcu yok" demek olurdu. */}
                        {kalan !== null && kalan > 0 && (
                          <span className="text-sm font-semibold text-pnl-warn">
                            {formatPara(kalan)} kaldı
                          </span>
                        )}
                      </span>
                    }
                  />
                );
              })}
          </Liste>
        </Bolum>

        <Bolum
          baslik="Belgeler"
          bilgi="Varsayılan olarak tüm geçmişi içerir. Belirli bir dönemi almak isterseniz 'Tarih aralığı seçerek al' bölümünü açın; aralıkla alınan belge hangi dönemi kapsadığını başlığında yazar."
        >
          <PdfBaglantilari
            temelUrl={`/api/pdf/musteri?id=${musteri.id}`}
            etiket="Müşteri belgesi"
            /* Varsayılan aralık son 1 yıl: müşteri belgesinde en sık
               istenen "bu yıl ne yaptık" ve son 1 ay çoğu müşteride boş
               çıkıyor (aynı müşteri her ay gelmiyor). */
            tarihAraligi={pdfAralik}
          />
        </Bolum>

        {/* Düzenleme en altta: nadiren kullanılıyor, üstte yer kaplamamalı */}
        <Bolum baslik="Müşteri bilgileri">
          <Liste
            ekleme={
              <EkleAcilir etiket="Bilgileri düzenle">
                <MusteriFormu musteri={musteri} />
              </EkleAcilir>
            }
          />
        </Bolum>
      </Icerik>
    </>
  );
}
