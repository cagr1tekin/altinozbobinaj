import { createClient } from "@/lib/supabase/server";
import type { StokFarki } from "@/lib/supabase/database.types";
import {
  Bolum,
  Icerik,
  Liste,
  Miktar,
  UstCubuk,
  Uyari,
  formatPara,
  formatSayi,
} from "@/components/panel/ui";
import EkleAcilir from "@/components/panel/EkleAcilir";
import UrunFormu from "@/components/panel/UrunFormu";
import StokHareketFormu from "@/components/panel/StokHareketFormu";

const BIRIM_ETIKET: Record<string, string> = {
  piece: "Adet",
  gram: "Gram",
};

const HAREKET_ETIKET: Record<string, string> = {
  purchase_in: "Giriş",
  job_out: "İşe çıkış",
  adjustment: "Düzeltme",
  job_revert: "İade",
};

export default async function UrunlerSayfasi() {
  const supabase = await createClient();

  const [{ data: urunler, error }, { data: hareketler }, { data: farklar }] =
    await Promise.all([
      supabase.from("products").select("*").order("name", { ascending: true }),
      supabase
        .from("stock_movements")
        .select(
          "id, movement_type, qty_pieces_delta, qty_grams_delta, note, created_at, products(name, unit_type_default)"
        )
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.rpc("stock_reconciliation"),
    ]);

  const liste = urunler ?? [];
  const hareketListesi = hareketler ?? [];
  const stokFarklari = (farklar ?? []) as StokFarki[];

  return (
    <>
      <UstCubuk baslik="Ürünler & Stok" />

      <Icerik>
        {error && (
          <div className="mb-4">
            <Uyari tur="hata" baslik="Ürünler yüklenemedi">
              Supabase bağlantısını ve migration&apos;ların uygulandığını
              kontrol edin.
            </Uyari>
          </div>
        )}

        {stokFarklari.length > 0 && (
          <div className="mb-4">
            <Uyari
              baslik={`${stokFarklari.length} üründe kayıt hareket geçmişiyle uyuşmuyor`}
            >
              <p>
                Stok alanı fonksiyon dışından değiştirilmiş olabilir. Doğru
                kaynak hareket geçmişidir; farkı sayım düzeltmesiyle kapatın.
              </p>
              <ul className="mt-2 space-y-1">
                {stokFarklari.map((f) => (
                  <li key={f.product_id}>
                    <span className="font-medium">{f.product_name}</span>:
                    kayıtlı{" "}
                    {f.birim === "piece"
                      ? `${formatSayi(f.kayitli_adet)} adet`
                      : `${formatSayi(f.kayitli_gram)} gram`}{" "}
                    — hareketlerden{" "}
                    {f.birim === "piece"
                      ? `${formatSayi(f.hareketlerden_adet)} adet`
                      : `${formatSayi(f.hareketlerden_gram)} gram`}
                  </li>
                ))}
              </ul>
            </Uyari>
          </div>
        )}

        <Bolum
          baslik="Ürünler"
          aciklama="Stok 0 başlar; girişi hareket olarak kaydedin"
        >
          <Liste
            ekleme={
              <EkleAcilir etiket="Yeni ürün ekle" ilkAcik={liste.length === 0}>
                <UrunFormu />
              </EkleAcilir>
            }
          >
            {liste.length > 0 &&
              liste.map((u) => {
                const eksi =
                  u.unit_type_default === "piece"
                    ? u.qty_pieces < 0
                    : Number(u.qty_grams) < 0;
                return (
                  <li key={u.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{u.name}</p>
                        <p className="mt-0.5 text-sm text-pnl-muted">
                          {BIRIM_ETIKET[u.unit_type_default] ??
                            u.unit_type_default}
                          {" · "}
                          {formatPara(u.purchase_price)}
                          {u.sku && ` · ${u.sku}`}
                        </p>
                      </div>
                      <p
                        className={`shrink-0 text-right font-semibold ${
                          eksi ? "text-pnl-warn" : ""
                        }`}
                      >
                        <Miktar
                          birim={u.unit_type_default}
                          adet={u.qty_pieces}
                          gram={Number(u.qty_grams)}
                        />
                        {eksi && (
                          <span className="block text-xs font-medium">
                            eksi stok
                          </span>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
          </Liste>
        </Bolum>

        <Bolum
          baslik="Stok hareketleri"
          aciklama="Denetim izi — değiştirilemez"
        >
          <Liste
            ekleme={
              <EkleAcilir etiket="Stok hareketi ekle">
                <StokHareketFormu urunler={liste} />
              </EkleAcilir>
            }
          >
            {hareketListesi.length > 0 &&
              hareketListesi.map((h) => {
                const urun = h.products as unknown as {
                  name: string;
                  unit_type_default: "piece" | "gram";
                } | null;
                /* Hareket ürünün kendi biriminde: adet ürününde gram
                   kolonu hep 0 kalıyor, tersi de geçerli. */
                const gramMi = urun?.unit_type_default !== "piece";
                const delta = gramMi
                  ? Number(h.qty_grams_delta)
                  : h.qty_pieces_delta;
                return (
                  <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {urun?.name ?? "—"}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-pnl-muted">
                        {HAREKET_ETIKET[h.movement_type] ?? h.movement_type}
                        {h.note && ` · ${h.note}`}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium">
                      {`${delta > 0 ? "+" : ""}${formatSayi(delta)} ${
                        gramMi ? "gram" : "adet"
                      }`}
                    </p>
                  </li>
                );
              })}
          </Liste>
        </Bolum>
      </Icerik>
    </>
  );
}
