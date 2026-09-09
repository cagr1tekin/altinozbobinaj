import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SegmentTahsilati } from "@/lib/supabase/database.types";
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
import SegmentAnlasilanFormu from "@/components/panel/SegmentAnlasilanFormu";
import TahsilatFormu from "@/components/panel/TahsilatFormu";
import TahsilatSatiri from "@/components/panel/TahsilatSatiri";

export default async function SegmentDetaySayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: segment }, { data: faturalar }, { data: bakiye }, tahsilatSonuc] =
    await Promise.all([
      supabase
        .from("segments")
        .select(
          "id, segment_date, note, status, customer_id, agreed_amount, customers(id, name), jobs(id, title, status, completed_at, created_at, agreed_amount)"
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
      /* Anlaşılan / tahsil edilen / kalan tek yerden: aynı hesabı
         sayfada tekrar yapmak, görünümle sayfanın ayrı düşmesi
         demekti. */
      supabase
        .from("segment_balances")
        .select("*")
        .eq("segment_id", id)
        .maybeSingle(),
      supabase.rpc("segment_tahsilatlari", { p_segment_id: id }),
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
    agreed_amount: number | null;
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
  const elleGirilen =
    segment.agreed_amount === null ? null : Number(segment.agreed_amount);

  const anlasilan =
    bakiye?.anlasilan === null || bakiye?.anlasilan === undefined
      ? null
      : Number(bakiye.anlasilan);
  const tahsilEdilen = Number(bakiye?.tahsil_edilen ?? 0);
  const kalan =
    bakiye?.kalan === null || bakiye?.kalan === undefined
      ? null
      : Number(bakiye.kalan);

  const tahsilatlar = (tahsilatSonuc.data ?? []) as SegmentTahsilati[];

  /* İşlere not olarak girilmiş tutarların toplamı. Segment tutarı hiç
     kaydedilmemişse forma varsayılan olarak öneriliyor. */
  const isTutarToplami = isler.reduce(
    (a, i) => a + (i.agreed_amount === null ? 0 : Number(i.agreed_amount)),
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
                    (is.status === "completed"
                      ? `Tamamlandı: ${formatTarih(is.completed_at)}`
                      : `Açıldı: ${formatTarih(is.created_at)}`) +
                    (is.agreed_amount !== null
                      ? ` · ${formatPara(is.agreed_amount)} (not)`
                      : "")
                  }
                  sag={<IsDurumu durum={is.status} />}
                />
              ))}
          </Liste>
        </Bolum>

        {/* ------------------------------------------------------------
            PARA — iki ayrı soru, iki ayrı bölüm

            1) Ne kadara anlaştık?  → fatura ya da elle girilen tutar
            2) Ne kadarını aldık?   → vadeler

            Eskiden tek bölümdü ve ikisi aynı sayılıyordu: fatura
            yüklemek "para alındı" demekti. Gerçekte anlaşılan para tek
            seferde ödenmiyor; ayrım bu yüzden ekranda da görünür.
            ------------------------------------------------------------ */}
        <Bolum
          baslik="Anlaşılan tutar"
          aciklama={
            anlasilan !== null
              ? faturaVar
                ? `${formatPara(anlasilan)} · ${faturaListesi.length} fatura`
                : `${formatPara(anlasilan)} · faturasız`
              : "Girilmedi"
          }
          bilgi={
            <>
              Müşteriyle konuşulan <strong>toplam</strong> para. Fatura
              yüklerseniz faturanın brüt tutarından gelir, yüklemezseniz elle
              girersiniz — ikisi de aynı şeyi söylediği için bir segmentte
              yalnızca biri olabilir. Bu bir <strong>alacak</strong> kaydı;
              alınan para aşağıdaki tahsilat bölümünde.
            </>
          }
        >
          <Liste
            ekleme={
              elleGirilen === null ? (
                <EkleAcilir
                  etiket="Fatura yükle"
                  ilkAcik={faturaListesi.length === 0 && anlasilan === null}
                >
                  <FaturaYukleFormu segmentId={segment.id} />
                </EkleAcilir>
              ) : (
                <div className="px-4 py-3 text-sm text-pnl-muted">
                  Elle tutar girildiği için fatura yüklenemiyor. Fatura
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
                    elleGirilen === null
                      ? "Faturasız — anlaşılan tutarı gir"
                      : "Anlaşılan tutarı düzenle"
                  }
                  ilkAcik={elleGirilen !== null}
                >
                  <SegmentAnlasilanFormu
                    segmentId={segment.id}
                    mevcutTutar={elleGirilen}
                    faturaVar={faturaVar}
                    faturaToplam={faturaToplam}
                    isToplami={isTutarToplami > 0 ? isTutarToplami : null}
                  />
                </EkleAcilir>
              }
            />
          </div>
        </Bolum>

        <Bolum
          baslik="Tahsilat"
          aciklama={
            <ParaOzeti
              anlasilan={anlasilan}
              tahsilEdilen={tahsilEdilen}
              kalan={kalan}
              vadeSayisi={tahsilatlar.length}
            />
          }
          bilgi={
            <>
              Fiilen alınan para. Anlaşılan tutar tek seferde ödenmek zorunda
              değil: her ödeme ayrı bir vade. Aylık gelir raporu{" "}
              <strong>vadenin tarihine</strong> bakıyor — paranın hangi ay
              kasaya girdiği. İşin tamamlanmasıyla ilgisi yok; tamamlanmamış
              işin parası peşin alınabilir, tamamlanmış işin parası aylar
              sonra gelebilir.
            </>
          }
        >
          <Liste
            ekleme={
              <EkleAcilir
                etiket={tahsilatlar.length === 0 ? "Tahsilat ekle" : "Vade ekle"}
                ilkAcik={false}
              >
                <TahsilatFormu segmentId={segment.id} kalan={kalan} />
              </EkleAcilir>
            }
          >
            {tahsilatlar.length > 0 &&
              tahsilatlar.map((t, i) => (
                <TahsilatSatiri
                  key={t.tahsilat_id}
                  tahsilat={t}
                  segmentId={segment.id}
                  sira={i + 1}
                />
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

/**
 * Tahsilat özeti — bölüm başlığının altındaki VERİ satırı.
 *
 * Üç rakam birlikte anlamlı: ne kadar anlaşıldı, ne kadarı alındı, ne
 * kaldı. Yalnızca "3 vade" yazmak asıl soruyu ("ne kadar borcu var")
 * cevapsız bırakırdı.
 */
function ParaOzeti({
  anlasilan,
  tahsilEdilen,
  kalan,
  vadeSayisi,
}: {
  anlasilan: number | null;
  tahsilEdilen: number;
  kalan: number | null;
  vadeSayisi: number;
}) {
  if (vadeSayisi === 0 && anlasilan === null) {
    return <>Henüz tahsilat girilmemiş</>;
  }

  return (
    <>
      {formatPara(tahsilEdilen)} alındı
      {vadeSayisi > 0 && ` · ${vadeSayisi} vade`}
      {/* Kalan yalnızca anlaşılan tutar biliniyorsa yazılıyor: tutar
          girilmemişken "0 kaldı" demek "borcu yok" demek olurdu, oysa
          doğrusu "borcu bilinmiyor". */}
      {kalan !== null && kalan > 0 && (
        <>
          {" · "}
          <span className="font-semibold text-pnl-warn">
            {formatPara(kalan)} kaldı
          </span>
        </>
      )}
      {kalan !== null && kalan === 0 && tahsilEdilen > 0 && " · kapandı"}
      {kalan !== null && kalan < 0 && (
        <>
          {" · "}
          <span className="font-semibold text-pnl-warn">
            {formatPara(-kalan)} fazla tahsilat
          </span>
        </>
      )}
      {anlasilan === null && vadeSayisi > 0 && " · anlaşılan tutar girilmemiş"}
    </>
  );
}
