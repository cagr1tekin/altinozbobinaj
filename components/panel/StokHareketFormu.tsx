"use client";

import { useState } from "react";
import type { Product } from "@/lib/supabase/database.types";
import { stokHareketiUygula } from "@/lib/actions/urunler";
import { Alan, Form, GonderButonu, girdiSinif } from "@/components/panel/Form";
import {
  birimAdi,
  birimOrnek,
  fiyatBirimi,
  formatPara,
  stokIsareti,
} from "@/components/panel/ui";

type StokUrunu = Pick<
  Product,
  "id" | "name" | "unit_type_default" | "purchase_price"
>;

/**
 * Stok girişi / çıkışı.
 *
 * Hareket tipi sorulmuyor: miktarın işareti belirliyor. Sahada karar
 * "kaç tane girdi/çıktı" sorusudur, "bu hareket hangi tipte" değil —
 * ve sayım düzeltmesi seçeneği bu yüzden tamamen kalktı.
 *
 * Fiyat yalnızca girişte açılıyor: çıkış bir satın alma değil, "kaça
 * çıktı" sorusu yok. Girişte fiyat girilirse ürünün güncel fiyatı da
 * güncelleniyor ve devam eden işlerin maliyeti o fiyatı izliyor.
 */
export default function StokHareketFormu({
  urunler,
  urunId: sabitUrunId,
}: {
  urunler: StokUrunu[];
  /** Ürün sayfasından açıldığında ürün sabit; seçim sorulmuyor. */
  urunId?: string;
}) {
  const [urunId, setUrunId] = useState(
    sabitUrunId ?? urunler[0]?.id ?? ""
  );
  /* Yön burada izleniyor: fiyat alanının görünürlüğü buna bağlı ve
     kullanıcı eksi işaretini elle yazmak zorunda kalmıyor. */
  const [giris, setGiris] = useState(true);

  const secili = urunler.find((u) => u.id === urunId) ?? urunler[0];
  const birim = secili?.unit_type_default ?? "piece";

  if (urunler.length === 0) {
    return (
      <p className="text-sm text-pnl-muted">
        Stok hareketi girmek için önce ürün tanımlayın.
      </p>
    );
  }

  return (
    <Form action={stokHareketiUygula}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            {sabitUrunId ? (
              <input type="hidden" name="product_id" value={sabitUrunId} />
            ) : (
              <Alan
                ad="product_id"
                etiket="Ürün"
                zorunlu
                hatalar={hatalar}
                deger={urunId}
                onChange={(e) => setUrunId(e.target.value)}
                secenekler={urunler.map((u) => ({
                  deger: u.id,
                  etiket: `${u.name} (${birimAdi(u.unit_type_default)})`,
                }))}
              />
            )}

            {/* Yön iki büyük düğme: mobilde tek dokunuşla seçiliyor ve
                hangisinin seçili olduğu renkten bağımsız olarak
                yazıdan da okunuyor. */}
            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-pnl-text">
                Ne yapıyorsunuz?
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { deger: true, etiket: "Stok girdi", alt: "Mal aldım" },
                  { deger: false, etiket: "Stok çıktı", alt: "Zayi / iade" },
                ].map((s) => {
                  const aktif = giris === s.deger;
                  return (
                    <button
                      key={s.etiket}
                      type="button"
                      onClick={() => setGiris(s.deger)}
                      aria-pressed={aktif}
                      className={`min-h-[56px] cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors ${
                        aktif
                          ? "border-pnl-primary bg-pnl-chip-info"
                          : "border-pnl-edge bg-pnl-surface hover:bg-pnl-chip-neutral"
                      }`}
                    >
                      <span className="block text-sm font-semibold">
                        {aktif ? "✓ " : ""}
                        {s.etiket}
                      </span>
                      <span className="block text-sm text-pnl-faint">
                        {s.alt}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Tek miktar alanı: birim ürüne göre belirleniyor, kullanıcı
                hangi kutuya yazacağını seçmek zorunda kalmıyor. İşaret
                yukarıdaki seçimden geliyor; kullanıcı eksi yazmıyor. */}
            <MiktarAlani
              birim={birim}
              giris={giris}
              hatalar={hatalar}
              ornek={birimOrnek(birim)}
            />

            {giris ? (
              <Alan
                ad="purchase_price"
                etiket={`Alış fiyatı (${fiyatBirimi(birim)})`}
                tip="number"
                adim="0.01"
                placeholder={
                  secili ? String(Number(secili.purchase_price)) : undefined
                }
                ipucu={
                  secili
                    ? `Boş bırakırsanız mevcut fiyat (${formatPara(
                        secili.purchase_price
                      )}) korunur. Girerseniz ürünün fiyatı güncellenir ve tamamlanmamış işlerin maliyeti yeni fiyattan hesaplanır.`
                    : undefined
                }
                hatalar={hatalar}
              />
            ) : (
              <p className="text-sm text-pnl-faint">
                Çıkış bir alım olmadığı için fiyat sorulmuyor.
              </p>
            )}

            <Alan
              ad="note"
              etiket="Not"
              placeholder={giris ? "Örn: Fatura #123" : "Örn: Hasarlı çıktı"}
              hatalar={hatalar}
            />
            <GonderButonu>
              {giris ? "Stok Girişini Kaydet" : "Stok Çıkışını Kaydet"}
            </GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}

/**
 * Miktar her zaman pozitif yazılıyor; işareti yön seçimi veriyor.
 *
 * Kullanıcıya "-3" yazdırmak sahada iki hataya yol açıyordu: eksiyi
 * unutmak (çıkış giriş olarak kaydediliyordu) ve girişe eksi yazmak.
 */
function MiktarAlani({
  birim,
  giris,
  ornek,
  hatalar,
}: {
  birim: "piece" | "gram";
  giris: boolean;
  ornek: string;
  hatalar?: Record<string, string[]>;
}) {
  const [ham, setHam] = useState("");
  /* İşaret kuralı lib/bicim.ts'te: test edilebilir olması gerekiyor,
     yanlış işaret sessizce ters yönde bir hareket yazardı. */
  const isaretli = stokIsareti(ham, giris);

  return (
    <div>
      <label
        htmlFor="alan-miktar-gorunen"
        className="mb-1.5 block text-sm font-medium text-pnl-text"
      >
        Miktar ({birimAdi(birim)}) <span className="text-pnl-danger" aria-hidden="true">*</span>
        <span className="sr-only"> (zorunlu)</span>
      </label>
      <input
        id="alan-miktar-gorunen"
        type="number"
        min="1"
        step="1"
        inputMode="numeric"
        required
        placeholder={ornek}
        value={ham}
        onChange={(e) => setHam(e.target.value.replace("-", ""))}
        /* Alan bileşenindeki aynı koruma: odaktaki sayı alanında fare
           tekerleği değeri sessizce değiştiriyor. */
        onWheel={(e) => (e.target as HTMLInputElement).blur()}
        aria-describedby="alan-miktar-ipucu"
        className={girdiSinif}
      />
      {/* Gönderilen asıl değer: işaret yön seçiminden geliyor. */}
      <input type="hidden" name="miktar" value={isaretli} />
      <p id="alan-miktar-ipucu" className="mt-1.5 text-sm text-pnl-faint">
        {giris
          ? "Stoğa eklenecek miktar"
          : "Stoktan düşülecek miktar — eksi işareti yazmanız gerekmiyor"}
      </p>
      {hatalar?.miktar?.[0] && (
        <p className="mt-1.5 text-sm font-medium text-pnl-danger">
          {hatalar.miktar[0]}
        </p>
      )}
    </div>
  );
}
