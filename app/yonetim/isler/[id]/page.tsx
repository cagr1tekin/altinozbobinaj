import Link from "next/link";
import { notFound } from "next/navigation";
import { QrCode } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/supabase/env";
import {
  BolumBasligi,
  IsDurumu,
  Kart,
  Miktar,
  formatPara,
  formatTarihSaat,
} from "@/components/yonetim/ui";
import { PdfBaglantilari } from "@/components/yonetim/PdfButonlari";
import MalzemeFormu from "@/components/yonetim/MalzemeFormu";
import MalzemeSilButonu from "@/components/yonetim/MalzemeSilButonu";
import TamamlamaPaneli from "@/components/yonetim/TamamlamaPaneli";
import IsDurumFormu from "@/components/yonetim/IsDurumFormu";

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

  /* Maliyet, ürünün takip birimine göre veritabanında hesaplanıyor
     (job_costs view'i). Adet ve kilogramı aynı fiyatla toplayan geçici
     çözüm 0004 migration'ı ile kaldırıldı. */
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

  /* Tamamlama öncesi stok kontrolü. Nihai karar veritabanında veriliyor;
     bu yalnızca kullanıcıya önden uyarı göstermek için. */
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
      <nav aria-label="Konum" className="mb-4 text-sm text-paper-muted">
        <Link href="/yonetim/musteriler" className="underline-offset-4 hover:underline">
          Müşteriler
        </Link>
        {musteri && (
          <>
            <span aria-hidden="true"> / </span>
            <Link
              href={`/yonetim/musteriler/${musteri.id}`}
              className="underline-offset-4 hover:underline"
            >
              {musteri.name}
            </Link>
          </>
        )}
        {segment && (
          <>
            <span aria-hidden="true"> / </span>
            <Link
              href={`/yonetim/segmentler/${segment.id}`}
              className="underline-offset-4 hover:underline"
            >
              Segment
            </Link>
          </>
        )}
        <span aria-hidden="true"> / </span>
        <span className="text-paper">{is.title}</span>
      </nav>

      <BolumBasligi
        baslik={is.title}
        aciklama={is.description ?? undefined}
        aksiyon={
          <div className="flex flex-wrap items-center gap-3">
            <IsDurumu durum={is.status} />
            {!tamamlandiMi && (
              <IsDurumFormu isId={is.id} mevcutDurum={is.status} />
            )}
          </div>
        }
      />

      {tamamlandiMi && (
        <p className="mb-6 text-sm text-paper-muted">
          Tamamlandı: {formatTarihSaat(is.completed_at)}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Kullanılan malzemeler */}
          <section aria-labelledby="malzemeler-basligi">
            <h2
              id="malzemeler-basligi"
              className="mb-4 font-display text-xl font-bold text-paper"
            >
              Kullanılan malzemeler
            </h2>

            {!tamamlandiMi && malzemeler.length > 0 && (
              <p className="mb-3 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-paper-muted">
                Bu malzemeler <strong className="text-paper">henüz stoktan
                düşülmedi</strong>. Düşüm, iş tamamlandığında yapılır.
              </p>
            )}

            {tamamlandiMi && malzemeler.length > 0 && (
              <p className="mb-3 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-paper-muted">
                Bu malzemeler{" "}
                <strong className="text-paper">stoktan düşüldü</strong>.
                Tamamlamayı geri alırsanız stoğa iade edilir.
              </p>
            )}

            {malzemeler.length === 0 ? (
              <Kart>
                <p className="text-sm text-paper-muted">
                  Bu işe henüz malzeme eklenmemiş.
                </p>
              </Kart>
            ) : (
              <Kart className="overflow-x-auto p-0">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-paper-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3">Malzeme</th>
                      <th scope="col" className="px-5 py-3">Kullanılan</th>
                      <th scope="col" className="px-5 py-3">Birim maliyet</th>
                      {!tamamlandiMi && (
                        <th scope="col" className="px-5 py-3">
                          <span className="sr-only">İşlem</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {malzemeler.map((m) => (
                      <tr key={m.id} className="border-b border-white/5 last:border-0">
                        <td className="px-5 py-3 text-paper">
                          {m.products?.name ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-paper-muted">
                          <Miktar
                            adet={m.qty_pieces_used}
                            kg={Number(m.qty_kg_used)}
                          />
                        </td>
                        <td className="px-5 py-3 text-paper-muted">
                          {formatPara(m.unit_cost_snapshot)}
                        </td>
                        {!tamamlandiMi && (
                          <td className="px-5 py-3 text-right">
                            <MalzemeSilButonu malzemeId={m.id} isId={is.id} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Kart>
            )}

            {malzemeler.length > 0 && (
              <p className="mt-3 text-sm text-paper-muted">
                Toplam malzeme maliyeti:{" "}
                <span className="font-medium text-paper">
                  {formatPara(toplamMaliyet)}
                </span>{" "}
                <span className="text-xs">
                  (her malzeme, işe eklendiği andaki alış fiyatıyla ve ürünün
                  takip birimine göre hesaplanır)
                </span>
              </p>
            )}
          </section>

          {/* QR kodu */}
          {tamamlandiMi && qr?.token && (
            <section aria-labelledby="qr-basligi">
              <h2
                id="qr-basligi"
                className="mb-4 font-display text-xl font-bold text-paper"
              >
                Malzeme şeffaflığı QR&apos;ı
              </h2>
              <Kart>
                <p className="text-sm text-paper-muted">
                  Bu adres müşteriye, işte kullanılan malzemeleri gösterir.
                  Alış fiyatı ve kâr bilgisi içermez.
                </p>
                <p className="mt-3 break-all rounded-lg border border-white/10 bg-ink px-3 py-2 font-mono text-xs text-paper">
                  {SITE_URL}/j/{qr.token}
                </p>
                <div className="mt-4">
                  <Link
                    href={`/yonetim/isler/${is.id}/etiket`}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-medium text-paper transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main"
                  >
                    <QrCode className="h-4 w-4" aria-hidden="true" />
                    Yazdırılabilir etiket
                  </Link>
                </div>
              </Kart>
            </section>
          )}
        </div>

        {/* Yan panel */}
        <div className="space-y-6">
          <Kart>
            <h2 className="mb-4 font-display text-lg font-bold text-paper">
              {tamamlandiMi ? "Tamamlama" : "İşi tamamla"}
            </h2>
            <TamamlamaPaneli
              isId={is.id}
              tamamlandiMi={tamamlandiMi}
              malzemeSayisi={malzemeler.length}
              stokUyarilari={stokUyarilari}
            />
          </Kart>

          {!tamamlandiMi && (
            <Kart>
              <h2 className="mb-4 font-display text-lg font-bold text-paper">
                Malzeme ekle
              </h2>
              <MalzemeFormu isId={is.id} urunler={urunler ?? []} />
            </Kart>
          )}

          <Kart>
            <h2 className="mb-1 font-display text-lg font-bold text-paper">
              Belgeler
            </h2>
            <p className="mb-4 text-sm text-paper-muted">
              Müşteri kopyasında alış fiyatı ve maliyet gösterilmez.
            </p>
            <PdfBaglantilari
              temelUrl={`/api/pdf/is?id=${is.id}`}
              etiket="İş belgesi (PDF)"
            />
          </Kart>
        </div>
      </div>
    </>
  );
}
