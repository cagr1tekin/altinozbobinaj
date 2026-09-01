import Link from "next/link";
import { notFound } from "next/navigation";
import { QrCode } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/supabase/env";
import {
  Bolum,
  Icerik,
  IsDurumu,
  Kart,
  Miktar,
  UstCubuk,
  Uyari,
  butonStilleri,
  formatPara,
  formatTarihSaat,
} from "@/components/panel/ui";
import { PdfBaglantilari } from "@/components/panel/PdfButonlari";
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
         segments(id, segment_date, customers(id, name)),
         job_products(id, qty_pieces_used, qty_kg_used, unit_cost_snapshot,
                      products(id, name, qty_pieces, qty_kg)),
         qr_codes(token)`
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("products")
      .select("id, name, qty_pieces, qty_kg")
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
    qty_kg_used: number;
    unit_cost_snapshot: number;
    products: {
      id: string;
      name: string;
      qty_pieces: number;
      qty_kg: number;
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
            (m.products.qty_pieces - m.qty_pieces_used < 0 ||
              Number(m.products.qty_kg) - Number(m.qty_kg_used) < 0)
        )
        .map((m) => ({
          urunAdi: m.products!.name,
          gerekenAdet: m.qty_pieces_used,
          gerekenKg: Number(m.qty_kg_used),
          mevcutAdet: m.products!.qty_pieces,
          mevcutKg: Number(m.products!.qty_kg),
        }));

  return (
    <>
      <UstCubuk
        baslik={is.title}
        geriHref={segment ? `/yonetim/segmentler/${segment.id}` : "/yonetim"}
        geriEtiket="Segment"
        eylem={<IsDurumu durum={is.status} />}
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

          {malzemeler.length === 0 ? (
            <Kart>
              <p className="text-sm text-pnl-muted">
                Bu işe henüz malzeme eklenmemiş.
              </p>
            </Kart>
          ) : (
            <>
              <ul className="divide-y divide-pnl-line overflow-hidden rounded-lg border border-pnl-line bg-pnl-surface">
                {malzemeler.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {m.products?.name ?? "—"}
                      </p>
                      <p className="mt-0.5 text-sm text-pnl-muted">
                        <Miktar
                          adet={m.qty_pieces_used}
                          kg={Number(m.qty_kg_used)}
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
              </ul>

              <p className="mt-3 text-sm text-pnl-muted">
                Toplam malzeme maliyeti:{" "}
                <span className="font-semibold text-pnl-text">
                  {formatPara(toplamMaliyet)}
                </span>
              </p>
            </>
          )}
        </Bolum>

        {!tamamlandiMi && (
          <Bolum baslik="Malzeme ekle">
            <Kart>
              <MalzemeFormu isId={is.id} urunler={urunler ?? []} />
            </Kart>
          </Bolum>
        )}

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
