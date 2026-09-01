import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Bolum,
  BosDurum,
  Icerik,
  Liste,
  ListeSatiri,
  SegmentDurumu,
  UstCubuk,
  formatTarih,
} from "@/components/panel/ui";
import { PdfBaglantilari } from "@/components/panel/PdfButonlari";
import MusteriFormu from "@/components/panel/MusteriFormu";
import SegmentFormu from "@/components/panel/SegmentFormu";

export default async function MusteriDetaySayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: musteri }, { data: segmentler }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("segments")
      .select("id, segment_date, note, status, jobs(id, status)")
      .eq("customer_id", id)
      .order("segment_date", { ascending: false }),
  ]);

  if (!musteri) notFound();

  const liste = segmentler ?? [];

  return (
    <>
      <UstCubuk
        baslik={musteri.name}
        geriHref="/yonetim/musteriler"
        geriEtiket="Müşteriler"
      />

      <Icerik>
        {/* Ana eylem en üstte: bu sayfaya gelme sebebi genellikle yeni iş girmek */}
        <Bolum baslik="Yeni segment" aciklama="Bugün gelen işler için grup aç">
          <div className="rounded-lg border border-pnl-line bg-pnl-surface p-4">
            <SegmentFormu musteriId={musteri.id} />
          </div>
        </Bolum>

        <Bolum baslik="Segmentler">
          {liste.length === 0 ? (
            <BosDurum
              baslik="Henüz segment yok"
              aciklama="Segment, müşterinin bir ziyarette bıraktığı iş grubudur. Yukarıdaki formdan ilkini açabilirsiniz."
            />
          ) : (
            <Liste>
              {liste.map((s) => {
                const isler = (s.jobs ?? []) as Array<{ status: string }>;
                const tamamlanan = isler.filter(
                  (i) => i.status === "completed"
                ).length;
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
                    sag={<SegmentDurumu durum={s.status} />}
                  />
                );
              })}
            </Liste>
          )}
        </Bolum>

        <Bolum baslik="Belgeler">
          <PdfBaglantilari
            temelUrl={`/api/pdf/musteri?id=${musteri.id}`}
            etiket="Müşteri belgesi"
          />
        </Bolum>

        {/* Düzenleme en altta: nadiren kullanılıyor, üstte yer kaplamamalı */}
        <Bolum baslik="Müşteri bilgileri">
          <div className="rounded-lg border border-pnl-line bg-pnl-surface p-4">
            <MusteriFormu musteri={musteri} />
          </div>
        </Bolum>
      </Icerik>
    </>
  );
}
