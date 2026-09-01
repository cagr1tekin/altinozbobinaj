import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Bolum,
  BosDurum,
  Icerik,
  IsDurumu,
  Liste,
  ListeSatiri,
  SegmentDurumu,
  UstCubuk,
  formatTarih,
} from "@/components/panel/ui";
import { PdfBaglantilari } from "@/components/panel/PdfButonlari";
import IsFormu from "@/components/panel/IsFormu";
import SegmentDurumButonu from "@/components/panel/SegmentDurumButonu";

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

  /* Tamamlanmamış işler üstte: sahada ilgilenilmesi gerekenler önce görünsün */
  const siraliIsler = [...isler].sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (a.status !== "completed" && b.status === "completed") return -1;
    return a.created_at.localeCompare(b.created_at);
  });

  const tamamlanan = isler.filter((i) => i.status === "completed").length;

  return (
    <>
      <UstCubuk
        baslik={formatTarih(segment.segment_date)}
        geriHref={musteri ? `/yonetim/musteriler/${musteri.id}` : "/yonetim/musteriler"}
        geriEtiket={musteri?.name ?? "Müşteriler"}
        eylem={<SegmentDurumu durum={segment.status} />}
      />

      <Icerik>
        <p className="mb-4 text-sm text-pnl-muted">
          {musteri?.name && <span className="font-medium">{musteri.name}</span>}
          {musteri?.name && " · "}
          {isler.length} iş · {tamamlanan} tamamlandı
          {segment.note && ` · ${segment.note}`}
        </p>

        <Bolum baslik="Yeni iş">
          <div className="rounded-lg border border-pnl-line bg-pnl-surface p-4">
            <IsFormu segmentId={segment.id} />
          </div>
        </Bolum>

        <Bolum baslik="İşler">
          {siraliIsler.length === 0 ? (
            <BosDurum
              baslik="Bu segmentte iş yok"
              aciklama="Yukarıdaki formdan iş kalemi ekleyin."
            />
          ) : (
            <Liste>
              {siraliIsler.map((is) => (
                <ListeSatiri
                  key={is.id}
                  href={`/yonetim/isler/${is.id}`}
                  baslik={is.title}
                  altBilgi={
                    is.status === "completed"
                      ? `Tamamlandı: ${formatTarih(is.completed_at)}`
                      : `Açıldı: ${formatTarih(is.created_at)}`
                  }
                  sag={<IsDurumu durum={is.status} />}
                />
              ))}
            </Liste>
          )}
        </Bolum>

        <Bolum baslik="Belgeler">
          <PdfBaglantilari
            temelUrl={`/api/pdf/segment?id=${segment.id}`}
            etiket="Segment belgesi"
          />
        </Bolum>

        <Bolum>
          <SegmentDurumButonu
            segmentId={segment.id}
            mevcutDurum={segment.status}
          />
        </Bolum>
      </Icerik>
    </>
  );
}
