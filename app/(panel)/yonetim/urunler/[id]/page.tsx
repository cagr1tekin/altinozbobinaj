import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  BilgiSatiri,
  Bolum,
  BosDurum,
  Icerik,
  Kart,
  Liste,
  Miktar,
  UstCubuk,
  Uyari,
  formatPara,
  formatSayi,
  formatTarihSaat,
} from "@/components/panel/ui";
import EkleAcilir from "@/components/panel/EkleAcilir";
import StokHareketFormu from "@/components/panel/StokHareketFormu";
import UrunDuzenleFormu from "@/components/panel/UrunDuzenleFormu";

const BIRIM_ETIKET: Record<string, string> = {
  piece: "Adet",
  gram: "Gram",
};

/**
 * Hareket etiketleri.
 *
 * 'adjustment' artık üretilmiyor ama geçmiş kayıtlar taşıyor; etiketi
 * kaldırmak eski satırları okunamaz yapardı.
 */
const HAREKET_ETIKET: Record<string, string> = {
  purchase_in: "Stok girişi",
  manual_out: "Stok çıkışı",
  job_out: "İşe çıkış",
  job_revert: "İşten iade",
  adjustment: "Sayım düzeltmesi (artık kullanılmıyor)",
};

type Hareket = {
  hareket_id: string;
  zaman: string;
  tip: string;
  miktar: number;
  birim: "piece" | "gram";
  birim_fiyat: number | null;
  is_basligi: string | null;
  not_: string | null;
  bakiye: number;
};

export default async function UrunSayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: urun }, { data: gecmis, error: gecmisHatasi }] =
    await Promise.all([
      supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase.rpc("urun_stok_gecmisi", { p_product_id: id, p_limit: 200 }),
    ]);

  if (!urun) notFound();

  const hareketler = (gecmis ?? []) as Hareket[];
  const birim = urun.unit_type_default as "piece" | "gram";

  /* Son alım: fiyatın nereden geldiği sorusunun cevabı. Ürünün güncel
     fiyatı bu alımdan geliyor ve maliyet hesabı da onu kullanıyor. */
  const sonAlim = hareketler.find(
    (h) => h.tip === "purchase_in" && h.birim_fiyat !== null
  );

  return (
    <>
      <UstCubuk baslik={urun.name} geriHref="/yonetim/urunler" />

      <Icerik>
        <Bolum baslik="Ürün">
          <Kart>
            <BilgiSatiri
              etiket="Mevcut stok"
              deger={
                <Miktar
                  birim={birim}
                  adet={urun.qty_pieces}
                  gram={Number(urun.qty_grams)}
                />
              }
            />
            <BilgiSatiri
              etiket={birim === "gram" ? "Güncel fiyat (TL/kg)" : "Güncel fiyat"}
              deger={formatPara(urun.purchase_price)}
            />
            <BilgiSatiri
              etiket="Takip birimi"
              deger={BIRIM_ETIKET[birim] ?? birim}
            />
            {urun.sku && <BilgiSatiri etiket="Stok kodu" deger={urun.sku} />}
            {sonAlim && (
              <BilgiSatiri
                etiket="Son alım"
                deger={`${formatPara(sonAlim.birim_fiyat ?? 0)} · ${formatTarihSaat(
                  sonAlim.zaman
                )}`}
              />
            )}
          </Kart>
          {urun.notes && (
            <p className="mt-3 whitespace-pre-line text-sm text-pnl-muted">
              {urun.notes}
            </p>
          )}
        </Bolum>

        <Bolum
          baslik="Stok hareketi"
          aciklama="Girişte fiyat da girebilirsiniz; ürünün fiyatı güncellenir"
        >
          <Liste
            ekleme={
              <EkleAcilir etiket="Stok hareketi ekle">
                <StokHareketFormu urunler={[urun]} urunId={urun.id} />
              </EkleAcilir>
            }
          />
        </Bolum>

        <Bolum
          baslik="Stok geçmişi"
          aciklama="Bu ürünün tüm hareketleri — değiştirilemez"
        >
          {gecmisHatasi && (
            <div className="mb-4">
              <Uyari tur="hata" baslik="Geçmiş yüklenemedi">
                Migration 0014&apos;ün uygulandığını kontrol edin.
              </Uyari>
            </div>
          )}

          {hareketler.length === 0 ? (
            <BosDurum
              baslik="Henüz hareket yok"
              aciklama="Bu ürüne ait stok girişi veya çıkışı kaydedilmemiş."
            />
          ) : (
            <Liste>
              {hareketler.map((h) => (
                <li key={h.hareket_id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {HAREKET_ETIKET[h.tip] ?? h.tip}
                      </p>
                      <p className="mt-0.5 text-sm text-pnl-muted">
                        {formatTarihSaat(h.zaman)}
                        {h.birim_fiyat !== null &&
                          ` · ${formatPara(h.birim_fiyat)}`}
                      </p>
                      {(h.is_basligi || h.not_) && (
                        <p className="mt-0.5 truncate text-sm text-pnl-faint">
                          {h.is_basligi ?? h.not_}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {/* İşaret renkten bağımsız okunuyor: + / − her
                          zaman yazılı. */}
                      <p
                        className={`font-semibold tabular-nums ${
                          h.miktar > 0 ? "text-pnl-success" : "text-pnl-danger"
                        }`}
                      >
                        {h.miktar > 0 ? "+" : "−"}
                        {formatSayi(Math.abs(h.miktar))}
                      </p>
                      <p className="mt-0.5 text-sm tabular-nums text-pnl-muted">
                        kalan {formatSayi(h.bakiye)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </Liste>
          )}
        </Bolum>

        <Bolum
          baslik="Ürün bilgisi"
          aciklama="Fiyat buradan değişmez — fiyat stok girişinde girilir"
        >
          <Liste
            ekleme={
              <EkleAcilir etiket="Ürün bilgisini düzenle">
                <UrunDuzenleFormu urun={urun} />
              </EkleAcilir>
            }
          />
        </Bolum>
      </Icerik>
    </>
  );
}
