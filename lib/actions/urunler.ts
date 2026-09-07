"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  stokHareketSchema,
  urunSchema,
  urunStokEkleSchema,
} from "@/lib/validation/schemas";
import {
  type ActionState,
  veritabaniHatasi,
  zodHatasi,
} from "@/lib/actions/types";

/**
 * Yeni ürün + ilk stok girişi.
 *
 * Ürün tanımı ile ilk alım tek adımda: malzemeyi alan kişi "şunu şu
 * fiyata şu kadar aldım" diyor. İki ayrı ekranda iki ayrı adım olması
 * hem gereksizdi hem de fiyatı hiç girilmemiş ürün bırakabiliyordu.
 */
export async function urunStokEkle(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = urunStokEkleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();

  const { error } = await supabase.rpc("urun_ve_stok_ekle", {
    p_ad: parsed.data.name,
    p_birim: parsed.data.unit_type_default,
    p_miktar: parsed.data.miktar,
    p_fiyat: parsed.data.purchase_price,
    p_sku: parsed.data.sku,
    p_note: parsed.data.note,
  });

  if (error) return veritabaniHatasi(error, "Ürün eklenemedi");

  revalidatePath("/yonetim/urunler");
  return { status: "success", message: "Ürün ve ilk stok girişi kaydedildi" };
}

/**
 * Ürün bilgisi güncelleme — fiyat HARİÇ.
 *
 * Fiyat buradan değişmiyor: fiyatın değiştiği an bir alım anıdır ve o
 * alımın miktarı da vardır. Fiyatı stok hareketinden ayırmak, stok
 * geçmişinde karşılığı olmayan bir fiyat değişikliği bırakırdı.
 */
export async function urunGuncelle(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") {
    return { status: "error", message: "Ürün bulunamadı" };
  }

  const parsed = urunSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update(parsed.data)
    .eq("id", id);

  if (error) return veritabaniHatasi(error, "Ürün güncellenemedi");

  revalidatePath("/yonetim/urunler");
  return {
    status: "success",
    message: "Ürün güncellendi. Fiyat, stok girişinden değişir.",
  };
}

/**
 * Stok girişi / çıkışı.
 *
 * Hareket tipi sorulmuyor: miktarın işareti belirliyor (+ giriş,
 * − çıkış). Sayım düzeltmesi kaldırıldı.
 */
export async function stokHareketiUygula(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = stokHareketSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();

  /* products.qty_* alanlarına doğrudan UPDATE atmıyoruz: fonksiyon hem
     kilidi alıyor, hem stock_movements'a denetim kaydı yazıyor, hem
     fiyat verildiyse ürünün güncel fiyatını güncelliyor. */
  const { error } = await supabase.rpc("apply_stock_movement", {
    p_product_id: parsed.data.product_id,
    /* Tek miktar gönderiliyor; fonksiyon ürünün birimine bakıp doğru
       kolona yazıyor. Yanlış birime yazma ihtimali böylece kalmıyor. */
    p_miktar: parsed.data.miktar,
    p_fiyat: parsed.data.purchase_price,
    p_note: parsed.data.note,
  });

  if (error) return veritabaniHatasi(error, "Stok hareketi uygulanamadı");

  revalidatePath("/yonetim/urunler");

  const giris = parsed.data.miktar > 0;
  return {
    status: "success",
    message: giris
      ? parsed.data.purchase_price !== null
        ? "Stok girişi kaydedildi, ürünün fiyatı güncellendi"
        : "Stok girişi kaydedildi"
      : "Stok çıkışı kaydedildi",
  };
}
