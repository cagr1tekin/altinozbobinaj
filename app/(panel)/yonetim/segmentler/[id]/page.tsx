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
import SegmentTutarFormu from "@/components/panel/SegmentTutarFormu";

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
        "id, segment_date, note, status, customer_id, charged_amount, customers(id, name), jobs(id, title, status, completed_at, created_at)"
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
  const faturaVar = faturaListesi.length > 0;
  const eldenTutar =
    segment.charged_amount === null ? null : Number(segment.charged_amount);

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

        {/* Ciro segmentin karşılığı: müşteri bir gelişte birden fazla iş
            bırakıyor, hepsinin bedeli tek seferde alınıyor.

            YA fatura YA elden tutar — ikisi birden aynı parayı iki kez
            saydırırdı. Kural veritabanında; buradaki düzen o kuralı
            görünür kılıyor: hangisi doluysa öbürü kapanıyor. */}
        <Bolum
          baslik="Ciro"
          aciklama={
            faturaVar
              ? `${faturaListesi.length} fatura · toplam ${formatPara(faturaToplam)}`
              : eldenTutar !== null
                ? `Elden alındı · ${formatPara(eldenTutar)}`
                : "Fatura yükleyin ya da alınan tutarı girin"
          }
        >
          <Liste
            ekleme={
              eldenTutar === null ? (
                <EkleAcilir
                  etiket="Fatura yükle"
                  ilkAcik={faturaListesi.length === 0}
                >
                  <FaturaYukleFormu segmentId={segment.id} />
                </EkleAcilir>
              ) : (
                <div className="px-4 py-3 text-sm text-pnl-muted">
                  Elden tutar girildiği için fatura yüklenemiyor. Fatura
                  kesilecekse aşağıdan tutarı boşaltın.
                </div>
              )
            }
          >
            {faturaListesi.length > 0 &&
              faturaListesi.map((f) => (
                <FaturaSatiri key={f.id} fatura={f} segmentId={segment.id} />
              ))}
          </Liste>

          <div className="mt-3">
            <Liste
              ekleme={
                <EkleAcilir
                  etiket={
                    eldenTutar === null
                      ? "Faturasız — alınan tutarı gir"
                      : "Alınan tutarı düzenle"
                  }
                  ilkAcik={eldenTutar !== null}
                >
                  <SegmentTutarFormu
                    segmentId={segment.id}
                    mevcutTutar={eldenTutar}
                    faturaVar={faturaVar}
                    faturaToplam={faturaToplam}
                  />
                </EkleAcilir>
              }
            />
          </div>
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
