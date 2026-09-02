import Link from "next/link";
import { notFound } from "next/navigation";
import { QrCode } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/supabase/env";
import {
  Bolum,
  Icerik,
  IsDurumu,
  IslemTuru,
  Kart,
  Liste,
  Miktar,
  UstCubuk,
  Uyari,
  butonStilleri,
  formatPara,
  formatTarihSaat,
} from "@/components/panel/ui";
import { islemleriSirala } from "@/lib/bicim";
import { PdfBaglantilari } from "@/components/panel/PdfButonlari";
import EkleAcilir from "@/components/panel/EkleAcilir";
import MalzemeFormu from "@/components/panel/MalzemeFormu";
import MalzemeSilButonu from "@/components/panel/MalzemeSilButonu";
import TamamlamaPaneli from "@/components/panel/TamamlamaPaneli";
import IsDurumFormu from "@/components/panel/IsDurumFormu";

export default async function IsDetaySayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: is }, { data: urunler }] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        `id, title, description, status, completed_at, created_at, segment_id,
         service_types,
         segments(id, segment_date, customers(id, name)),
         job_products(id, qty_pieces_used, qty_grams_used, unit_cost_snapshot,
                      products(id, name, unit_type_default, qty_pieces, qty_grams)),
         qr_codes(token)`
      )
      .eq("id", id)
      .is("deleted_at", null)
      /* Silinmiş malzeme satırı listede ve maliyette görünmemeli. */
      .is("job_products.deleted_at", null)
      .maybeSingle(),
    supabase
      .from("products")
      .select("id, name, unit_type_default, qty_pieces, qty_grams")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);

  const { data: maliyetSatiri } = await supabase
    .from("job_costs")
    .select("material_cost")
    .eq("job_id", id)
    .maybeSingle();

  if (!is) notFound();

  const segment = is.segments as unknown as {
    id: string;
    segment_date: string;
    customers: { id: string; name: string } | null;
  } | null;
  const musteri = segment?.customers ?? null;

  const malzemeler = (is.job_products ?? []) as Array<{
    id: string;
    qty_pieces_used: number;
    qty_grams_used: number;
    unit_cost_snapshot: number;
    products: {
      id: string;
      name: string;
      qty_pieces: number;
      unit_type_default: "piece" | "gram";
      qty_grams: number;
    } | null;
  }>;

  const qr = is.qr_codes as unknown as { token: string } | null;
  const tamamlandiMi = is.status === "completed";
  const toplamMaliyet = Number(maliyetSatiri?.material_cost ?? 0);

  /* Tamamlama öncesi stok uyarısı. Nihai karar veritabanında veriliyor;
     bu yalnızca kullanıcıyı önden bilgilendirmek için. */
  const stokUyarilari = tamamlandiMi
    ? []
    : malzemeler
        .filter(
          (m) =>
            m.products !== null &&
            (m.products.unit_type_default === "piece"
              ? m.products.qty_pieces - m.qty_pieces_used < 0
              : Number(m.products.qty_grams) - Number(m.qty_grams_used) < 0)
        )
        .map((m) => ({
          urunAdi: m.products!.name,
          birim: m.products!.unit_type_default,
          gereken:
            m.products!.unit_type_default === "piece"
              ? m.qty_pieces_used
              : Number(m.qty_grams_used),
          mevcut:
            m.products!.unit_type_default === "piece"
              ? m.products!.qty_pieces
              : Number(m.products!.qty_grams),
        }));

  return (
    <>
      <UstCubuk
        baslik={is.title}
        geriHref={segment ? `/yonetim/segmentler/${segment.id}` : "/yonetim"}
        geriEtiket="Segment"
        eylem={
          /* Tamamlanmış işte hangi işlemin yapıldığı en üstte görünüyor:
             sonradan bakan biri için durum kadar önemli bir bilgi. */
          <span className="flex flex-wrap items-center gap-2">
            {/* Birden fazla işlem yapılmış olabilir; her biri ayrı rozet.
                Tek bir rozette birleştirmek uzun ve okunmaz oluyordu. */}
            {islemleriSirala(is.service_types ?? []).map((t) => (
              <IslemTuru key={t} tur={t} />
            ))}
            <IsDurumu durum={is.status} />
          </span>
        }
      />

      <Icerik>
        <p className="mb-4 text-sm text-pnl-muted">
          {musteri?.name}
          {is.description && ` · ${is.description}`}
          {tamamlandiMi && ` · Tamamlandı: ${formatTarihSaat(is.completed_at)}`}
        </p>

        {/* Ekranın ana eylemi en üstte — kullanıcı bu sayfaya çoğunlukla
            malzeme eklemek veya işi kapatmak için geliyor. */}
        <Bolum baslik={tamamlandiMi ? "Tamamlama" : "İşi tamamla"}>
          <Kart>
            <TamamlamaPaneli
              isId={is.id}
              tamamlandiMi={tamamlandiMi}
              malzemeSayisi={malzemeler.length}
              stokUyarilari={stokUyarilari}
            />
          </Kart>
        </Bolum>

        <Bolum baslik="Kullanılan malzemeler">
          {malzemeler.length > 0 && (
            <div className="mb-3">
              <Uyari tur="bilgi">
                {tamamlandiMi
                  ? "Bu malzemeler stoktan düşüldü. Tamamlamayı geri alırsanız iade edilir."
                  : "Bu malzemeler henüz stoktan düşülmedi. Düşüm, iş tamamlandığında yapılır."}
              </Uyari>
            </div>
          )}

          <Liste
            ekleme={
              !tamamlandiMi ? (
                <EkleAcilir
                  etiket="Malzeme ekle"
                  ilkAcik={malzemeler.length === 0}
                >
                  <MalzemeFormu isId={is.id} urunler={urunler ?? []} />
                </EkleAcilir>
              ) : undefined
            }
          >
            {malzemeler.length > 0 &&
              malzemeler.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {m.products?.name ?? "—"}
                    </p>
                    <p className="mt-0.5 text-sm text-pnl-muted">
                      <Miktar
                        birim={m.products?.unit_type_default ?? "piece"}
                        adet={m.qty_pieces_used}
                        gram={Number(m.qty_grams_used)}
                      />
                      {" · "}
                      {formatPara(m.unit_cost_snapshot)} birim
                    </p>
                  </div>
                  {!tamamlandiMi && (
                    <MalzemeSilButonu malzemeId={m.id} isId={is.id} />
                  )}
                </li>
              ))}
          </Liste>

          {malzemeler.length > 0 && (
            <p className="mt-3 text-sm text-pnl-muted">
              Toplam malzeme maliyeti:{" "}
              <span className="font-semibold text-pnl-text">
                {formatPara(toplamMaliyet)}
              </span>
            </p>
          )}

          {malzemeler.length === 0 && tamamlandiMi && (
            <p className="mt-3 text-sm text-pnl-muted">
              Bu işe malzeme eklenmemiş (yalnızca işçilik).
            </p>
          )}
        </Bolum>


        {tamamlandiMi && qr?.token && (
          <Bolum baslik="Malzeme şeffaflığı QR'ı">
            <Kart>
              <p className="text-sm text-pnl-muted">
                Müşteri bu kodu okutunca yalnızca kullanılan malzemeleri görür.
                Fiyat bilgisi görünmez.
              </p>
              <p className="mt-3 break-all rounded-lg bg-pnl-bg px-3 py-2 font-mono text-xs">
                {SITE_URL}/j/{qr.token}
              </p>
              <Link
                href={`/yonetim/isler/${is.id}/etiket`}
                className={`${butonStilleri.ikincil} mt-3 w-full`}
              >
                <QrCode className="h-5 w-5" aria-hidden="true" />
                Yazdırılabilir etiket
              </Link>
            </Kart>
          </Bolum>
        )}

        <Bolum baslik="Belgeler">
          <PdfBaglantilari
            temelUrl={`/api/pdf/is?id=${is.id}`}
            etiket="İş belgesi"
          />
        </Bolum>

        {!tamamlandiMi && (
          <Bolum>
            <IsDurumFormu isId={is.id} mevcutDurum={is.status} />
          </Bolum>
        )}
      </Icerik>
    </>
  );
}
