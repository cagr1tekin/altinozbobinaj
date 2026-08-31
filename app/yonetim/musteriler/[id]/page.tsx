import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  BolumBasligi,
  BosDurum,
  Kart,
  SegmentDurumu,
  formatTarih,
} from "@/components/yonetim/ui";
import { PdfBaglantilari } from "@/components/yonetim/PdfButonlari";
import MusteriFormu from "@/components/yonetim/MusteriFormu";
import SegmentFormu from "@/components/yonetim/SegmentFormu";

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

  return (
    <>
      <nav aria-label="Konum" className="mb-4 text-sm text-paper-muted">
        <Link
          href="/yonetim/musteriler"
          className="underline-offset-4 hover:underline"
        >
          Müşteriler
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-paper">{musteri.name}</span>
      </nav>

      <BolumBasligi
        baslik={musteri.name}
        aciklama={
          musteri.phone
            ? `Telefon: ${musteri.phone}`
            : "Telefon bilgisi girilmemiş"
        }
        aksiyon={
          <PdfBaglantilari
            temelUrl={`/api/pdf/musteri?id=${musteri.id}`}
            etiket="Müşteri belgesi (PDF)"
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Segmentler */}
        <section aria-labelledby="segmentler-basligi">
          <h2
            id="segmentler-basligi"
            className="mb-4 font-display text-xl font-bold text-paper"
          >
            Segmentler
          </h2>

          {(segmentler ?? []).length === 0 ? (
            <BosDurum
              baslik="Henüz segment yok"
              aciklama="Segment, müşterinin bir ziyarette bıraktığı iş grubudur. Sağdaki formdan ilk segmenti açabilirsiniz."
            />
          ) : (
            <ul className="space-y-3">
              {(segmentler ?? []).map((s) => {
                const isler = (s.jobs ?? []) as Array<{
                  id: string;
                  status: string;
                }>;
                const tamamlanan = isler.filter(
                  (i) => i.status === "completed"
                ).length;

                return (
                  <li key={s.id}>
                    <Link
                      href={`/yonetim/segmentler/${s.id}`}
                      className="block rounded-xl border border-white/10 bg-ink-soft/60 p-5 transition-colors hover:border-silver-main/40 hover:bg-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-medium text-paper">
                          {formatTarih(s.segment_date)}
                        </p>
                        <SegmentDurumu durum={s.status} />
                      </div>
                      {s.note && (
                        <p className="mt-1 text-sm text-paper-muted">{s.note}</p>
                      )}
                      <p className="mt-2 text-xs text-paper-muted">
                        {isler.length} iş · {tamamlanan} tamamlandı
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Yan panel */}
        <div className="space-y-6">
          <Kart>
            <h2 className="mb-4 font-display text-lg font-bold text-paper">
              Yeni segment
            </h2>
            <SegmentFormu musteriId={musteri.id} />
          </Kart>

          <Kart>
            <h2 className="mb-4 font-display text-lg font-bold text-paper">
              Müşteri bilgileri
            </h2>
            <MusteriFormu musteri={musteri} />
          </Kart>
        </div>
      </div>
    </>
  );
}
