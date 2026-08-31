import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  BolumBasligi,
  BosDurum,
  IsDurumu,
  Kart,
  SegmentDurumu,
  formatTarih,
} from "@/components/yonetim/ui";
import IsFormu from "@/components/yonetim/IsFormu";
import SegmentDurumButonu from "@/components/yonetim/SegmentDurumButonu";

export default async function SegmentDetaySayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: segment } = await supabase
    .from("segments")
    .select(
      "id, segment_date, note, status, customer_id, customers(id, name), jobs(id, title, status, completed_at, created_at)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!segment) notFound();

  const musteri = segment.customers as unknown as {
    id: string;
    name: string;
  } | null;
  const isler = (segment.jobs ?? []) as Array<{
    id: string;
    title: string;
    status: "pending" | "in_progress" | "completed";
    completed_at: string | null;
    created_at: string;
  }>;

  // Tamamlanmamış işler üstte: sahada ilgilenilmesi gerekenler önce görünsün
  const siraliIsler = [...isler].sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (a.status !== "completed" && b.status === "completed") return -1;
    return a.created_at.localeCompare(b.created_at);
  });

  const tamamlanan = isler.filter((i) => i.status === "completed").length;

  return (
    <>
      <nav aria-label="Konum" className="mb-4 text-sm text-paper-muted">
        <Link href="/yonetim/musteriler" className="underline-offset-4 hover:underline">
          Müşteriler
        </Link>
        <span aria-hidden="true"> / </span>
        {musteri && (
          <>
            <Link
              href={`/yonetim/musteriler/${musteri.id}`}
              className="underline-offset-4 hover:underline"
            >
              {musteri.name}
            </Link>
            <span aria-hidden="true"> / </span>
          </>
        )}
        <span className="text-paper">{formatTarih(segment.segment_date)}</span>
      </nav>

      <BolumBasligi
        baslik={`Segment · ${formatTarih(segment.segment_date)}`}
        aciklama={segment.note ?? undefined}
        aksiyon={
          <div className="flex items-center gap-3">
            <SegmentDurumu durum={segment.status} />
            <SegmentDurumButonu
              segmentId={segment.id}
              mevcutDurum={segment.status}
            />
          </div>
        }
      />

      <p className="mb-6 text-sm text-paper-muted">
        {isler.length} iş · {tamamlanan} tamamlandı
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section aria-labelledby="isler-basligi">
          <h2 id="isler-basligi" className="mb-4 font-display text-xl font-bold text-paper">
            İşler
          </h2>

          {siraliIsler.length === 0 ? (
            <BosDurum
              baslik="Bu segmentte iş yok"
              aciklama="Sağdaki formdan bu segmente iş kalemi ekleyin."
            />
          ) : (
            <ul className="space-y-3">
              {siraliIsler.map((is) => (
                <li key={is.id}>
                  <Link
                    href={`/yonetim/isler/${is.id}`}
                    className="block rounded-xl border border-white/10 bg-ink-soft/60 p-5 transition-colors hover:border-silver-main/40 hover:bg-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-paper">{is.title}</p>
                      <IsDurumu durum={is.status} />
                    </div>
                    <p className="mt-2 text-xs text-paper-muted">
                      {is.status === "completed"
                        ? `Tamamlandı: ${formatTarih(is.completed_at)}`
                        : `Açıldı: ${formatTarih(is.created_at)}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Kart className="h-fit">
          <h2 className="mb-4 font-display text-lg font-bold text-paper">
            Yeni iş
          </h2>
          <IsFormu segmentId={segment.id} />
        </Kart>
      </div>
    </>
  );
}
