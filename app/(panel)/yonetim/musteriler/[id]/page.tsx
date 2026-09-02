import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Bolum,
  Icerik,
  Liste,
  ListeSatiri,
  SegmentDurumu,
  UstCubuk,
  formatTarih,
} from "@/components/panel/ui";
import { PdfBaglantilari } from "@/components/panel/PdfButonlari";
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

  const [{ data: musteri }, { data: segmentler }] = await Promise.all([
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
        <Bolum baslik="Segmentler" aciklama="Her ziyaret bir segment">
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
        </Bolum>

        <Bolum baslik="Belgeler">
          <PdfBaglantilari
            temelUrl={`/api/pdf/musteri?id=${musteri.id}`}
            etiket="Müşteri belgesi"
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
