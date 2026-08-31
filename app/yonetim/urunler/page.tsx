import { createClient } from "@/lib/supabase/server";
import {
  BolumBasligi,
  BosDurum,
  Kart,
  formatKg,
  formatPara,
} from "@/components/yonetim/ui";
import UrunFormu from "@/components/yonetim/UrunFormu";
import StokHareketFormu from "@/components/yonetim/StokHareketFormu";

const BIRIM_ETIKET: Record<string, string> = {
  piece: "Adet",
  kg: "Kilogram",
  both: "Adet + Kilogram",
};

export default async function UrunlerSayfasi() {
  const supabase = await createClient();

  const [{ data: urunler, error }, { data: hareketler }] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true }),
    supabase
      .from("stock_movements")
      .select("id, movement_type, qty_pieces_delta, qty_kg_delta, note, created_at, products(name)")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const liste = urunler ?? [];

  return (
    <>
      <BolumBasligi
        baslik="Ürünler & Stok"
        aciklama="Adet ve kilogram bağımsız izlenir; aralarında otomatik dönüşüm yapılmaz."
      />

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Ürünler yüklenemedi. Supabase bağlantısını ve migration&apos;ların
          uygulandığını kontrol edin.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {liste.length === 0 ? (
            <BosDurum
              baslik="Henüz ürün yok"
              aciklama="Sağdaki formdan ilk ürünü tanımlayın. Stok miktarı 0 olarak başlar; girişi ayrıca stok hareketi olarak kaydedersiniz."
            />
          ) : (
            <Kart className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-paper-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3">Ürün</th>
                    <th scope="col" className="px-5 py-3">Birim</th>
                    <th scope="col" className="px-5 py-3">Alış fiyatı</th>
                    <th scope="col" className="px-5 py-3">Stok</th>
                  </tr>
                </thead>
                <tbody>
                  {liste.map((u) => {
                    const eksi = u.qty_pieces < 0 || Number(u.qty_kg) < 0;
                    return (
                      <tr key={u.id} className="border-b border-white/5 last:border-0">
                        <td className="px-5 py-3">
                          <span className="font-medium text-paper">{u.name}</span>
                          {u.sku && (
                            <span className="ml-2 font-mono text-xs text-paper-muted">
                              {u.sku}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-paper-muted">
                          {BIRIM_ETIKET[u.unit_type_default] ?? u.unit_type_default}
                        </td>
                        <td className="px-5 py-3 text-paper-muted">
                          {formatPara(u.purchase_price)}
                        </td>
                        <td className={`px-5 py-3 ${eksi ? "text-amber-200" : "text-paper-muted"}`}>
                          {u.qty_pieces} adet · {formatKg(u.qty_kg)} kg
                          {eksi && (
                            <span className="ml-2 text-xs font-medium">(eksi!)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Kart>
          )}

          {/* Denetim izi: stock_movements güncellenemez/silinemez (RLS) */}
          {(hareketler ?? []).length > 0 && (
            <section aria-labelledby="hareketler-basligi">
              <h2 id="hareketler-basligi" className="mb-4 font-display text-xl font-bold text-paper">
                Son stok hareketleri
              </h2>
              <Kart className="overflow-x-auto p-0">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-paper-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3">Ürün</th>
                      <th scope="col" className="px-5 py-3">Tip</th>
                      <th scope="col" className="px-5 py-3">Değişim</th>
                      <th scope="col" className="px-5 py-3">Not</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(hareketler ?? []).map((h) => {
                      const urun = h.products as unknown as { name: string } | null;
                      const tip: Record<string, string> = {
                        purchase_in: "Giriş",
                        job_out: "İşe çıkış",
                        adjustment: "Düzeltme",
                        job_revert: "İade",
                      };
                      return (
                        <tr key={h.id} className="border-b border-white/5 last:border-0">
                          <td className="px-5 py-3 text-paper">{urun?.name ?? "—"}</td>
                          <td className="px-5 py-3 text-paper-muted">
                            {tip[h.movement_type] ?? h.movement_type}
                          </td>
                          <td className="px-5 py-3 text-paper-muted">
                            {h.qty_pieces_delta !== 0 && `${h.qty_pieces_delta > 0 ? "+" : ""}${h.qty_pieces_delta} adet`}
                            {h.qty_pieces_delta !== 0 && Number(h.qty_kg_delta) !== 0 && " · "}
                            {Number(h.qty_kg_delta) !== 0 && `${Number(h.qty_kg_delta) > 0 ? "+" : ""}${formatKg(h.qty_kg_delta)} kg`}
                          </td>
                          <td className="px-5 py-3 text-paper-muted">{h.note ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Kart>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <Kart>
            <h2 className="mb-4 font-display text-lg font-bold text-paper">
              Yeni ürün
            </h2>
            <UrunFormu />
          </Kart>

          <Kart>
            <h2 className="mb-4 font-display text-lg font-bold text-paper">
              Stok hareketi
            </h2>
            <StokHareketFormu urunler={liste} />
          </Kart>
        </div>
      </div>
    </>
  );
}
