"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { stokHareketSchema, urunSchema } from "@/lib/validation/schemas";
import {
  type ActionState,
  veritabaniHatasi,
  zodHatasi,
} from "@/lib/actions/types";

export async function urunOlustur(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = urunSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();

  /* Stok miktarı burada 0 olarak başlıyor; ilk giriş apply_stock_movement
     ile yapılıyor ki hareket geçmişinde karşılığı olsun. */
  const { error } = await supabase.from("products").insert(parsed.data);

  if (error) return veritabaniHatasi(error, "Ürün kaydedilemedi");

  revalidatePath("/yonetim/urunler");
  return { status: "success", message: "Ürün eklendi" };
}

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

  /* Alış fiyatı değişmiş olabilir; geçmiş işlerin maliyeti etkilenmiyor
     çünkü job_products.unit_cost_snapshot o anki fiyatı saklıyor. */
  return {
    status: "success",
    message:
      "Ürün güncellendi. Fiyat değişikliği geçmiş işlerin maliyetini etkilemez.",
  };
}

export async function stokHareketiUygula(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = stokHareketSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();

  /* products.qty_* alanlarına doğrudan UPDATE atmıyoruz: fonksiyon hem
     kilidi alıyor hem stock_movements'a denetim kaydı yazıyor. */
  const { error } = await supabase.rpc("apply_stock_movement", {
    p_product_id: parsed.data.product_id,
    p_movement_type: parsed.data.movement_type,
    /* Tek miktar gönderiliyor; fonksiyon ürünün birimine bakıp doğru
       kolona yazıyor. Yanlış birime yazma ihtimali böylece kalmıyor. */
    p_miktar: parsed.data.miktar,
    p_note: parsed.data.note,
  });

  if (error) return veritabaniHatasi(error, "Stok hareketi uygulanamadı");

  revalidatePath("/yonetim/urunler");
  return {
    status: "success",
    message:
      parsed.data.movement_type === "purchase_in"
        ? "Stok girişi kaydedildi"
        : "Stok düzeltmesi kaydedildi",
  };
}
