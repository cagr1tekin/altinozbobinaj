import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Bolum,
  Icerik,
  IsDurumu,
  Liste,
  ListeSatiri,
  SegmentDurumu,
  UstCubuk,
  formatPara,
  formatTarih,
} from "@/components/panel/ui";
import { PdfBaglantilari } from "@/components/panel/PdfButonlari";
import EkleAcilir from "@/components/panel/EkleAcilir";
import IsFormu from "@/components/panel/IsFormu";
import SegmentDurumButonu from "@/components/panel/SegmentDurumButonu";
import FaturaYukleFormu from "@/components/panel/FaturaYukleFormu";
import FaturaSatiri from "@/components/panel/FaturaSatiri";

export default async function SegmentDetaySayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: segment }, { data: faturalar }] = await Promise.all([
    supabase
      .from("segments")
      .select(
        "id, segment_date, note, status, customer_id, customers(id, name), jobs(id, title, status, completed_at, created_at)"
      )
      .eq("id", id)
      .is("deleted_at", null)
      /* Gömülü filtre: silinmiş iş segment listesinde görünmeye devam
         ederdi. PostgREST'te iç içe tabloya "tablo.kolon" ile filtre
         uygulanıyor. */
      .is("jobs.deleted_at", null)
      .maybeSingle(),
    supabase
      .from("invoices")
      .select(
        "id, invoice_no, issue_date, net_amount, gross_amount, supplier_name"
      )
      .eq("segment_id", id)
      .is("deleted_at", null)
      .order("issue_date", { ascending: false }),
  ]);

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
  const faturaListesi = faturalar ?? [];
  const faturaToplam = faturaListesi.reduce(
    (a, f) => a + Number(f.gross_amount),
    0
  );

  return (
    <>
      <UstCubuk
        baslik={formatTarih(segment.segment_date)}
        geriHref={
          musteri ? `/yonetim/musteriler/${musteri.id}` : "/yonetim/musteriler"
        }
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

        <Bolum baslik="İşler">
          <Liste
            ekleme={
              <EkleAcilir etiket="Yeni iş ekle" ilkAcik={isler.length === 0}>
                <IsFormu segmentId={segment.id} />
              </EkleAcilir>
            }
          >
            {siraliIsler.length > 0 &&
              siraliIsler.map((is) => (
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
        </Bolum>

        {/* Fatura segmentin karşılığı: müşteri bir gelişte birden fazla iş
            bırakıyor, hepsine tek fatura kesiliyor. */}
        <Bolum
          baslik="Fatura"
          aciklama={
            faturaListesi.length > 0
              ? `${faturaListesi.length} fatura · toplam ${formatPara(faturaToplam)}`
              : undefined
          }
        >
          <Liste
            ekleme={
              <EkleAcilir
                etiket="Fatura yükle"
                ilkAcik={faturaListesi.length === 0}
              >
                <FaturaYukleFormu segmentId={segment.id} />
              </EkleAcilir>
            }
          >
            {faturaListesi.length > 0 &&
              faturaListesi.map((f) => (
                <FaturaSatiri key={f.id} fatura={f} segmentId={segment.id} />
              ))}
          </Liste>
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
