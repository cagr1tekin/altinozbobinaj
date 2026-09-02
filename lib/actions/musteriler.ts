"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { musteriSchema, segmentSchema } from "@/lib/validation/schemas";
import {
  type ActionState,
  veritabaniHatasi,
  zodHatasi,
} from "@/lib/actions/types";

export async function musteriOlustur(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = musteriSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) return veritabaniHatasi(error, "Müşteri kaydedilemedi");

  revalidatePath("/yonetim/musteriler");
  redirect(`/yonetim/musteriler/${data.id}`);
}

export async function musteriGuncelle(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    return { status: "error", message: "Müşteri bulunamadı" };
  }

  const parsed = musteriSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update(parsed.data)
    .eq("id", id);

  if (error) return veritabaniHatasi(error, "Müşteri güncellenemedi");

  revalidatePath(`/yonetim/musteriler/${id}`);
  revalidatePath("/yonetim/musteriler");
  return { status: "success", message: "Müşteri bilgileri güncellendi" };
}

export async function musteriSil(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") {
    return { status: "error", message: "Müşteri bulunamadı" };
  }

  const supabase = await createClient();
  /* Fiziksel silme YOK: RLS'te DELETE yetkisi kaldirildi ve kayit_sil()
     yalnizca isaretliyor. Musteri listelerden ve raporlardan kalkiyor ama
     gecmisi veritabaninda duruyor — yanlislikla silinen geri getirilebilir. */
  const { error } = await supabase.rpc("kayit_sil", {
    p_tablo: "customers",
    p_id: id,
  });

  // Faturası olan müşteri silinemez (invoices.customer_id on delete restrict).
  // Bu bilinçli: muhasebe kaydı müşteriyle birlikte yok olmamalı.
  if (error) return veritabaniHatasi(error, "Müşteri silinemedi");

  revalidatePath("/yonetim/musteriler");
  redirect("/yonetim/musteriler");
}

export async function segmentOlustur(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = segmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("segments")
    .insert(parsed.data)
    .select("id, customer_id")
    .single();

  if (error) return veritabaniHatasi(error, "Segment oluşturulamadı");

  revalidatePath(`/yonetim/musteriler/${data.customer_id}`);
  redirect(`/yonetim/segmentler/${data.id}`);
}

export async function segmentDurumDegistir(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = formData.get("id");
  const status = formData.get("status");

  if (typeof id !== "string" || (status !== "open" && status !== "closed")) {
    return { status: "error", message: "Geçersiz istek" };
  }

  const supabase = await createClient();

  /* PRD Bölüm 11 / Soru 2: segment, içindeki işler bitmeden kapatılabilir mi?
     Kapatma engellenmiyor ama açık iş varsa uyarı döndürülüyor — sahada
     "kalanı sonra yaparız" durumu gerçek, ama sessizce kapatmak da
     takibi bozuyor. */
  const { count: acikIsler } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("segment_id", id)
    .neq("status", "completed")
    .is("deleted_at", null);

  const { error } = await supabase
    .from("segments")
    .update({ status })
    .eq("id", id);

  if (error) return veritabaniHatasi(error, "Segment durumu değiştirilemedi");

  revalidatePath(`/yonetim/segmentler/${id}`);

  if (status === "closed" && (acikIsler ?? 0) > 0) {
    return {
      status: "success",
      message: `Segment kapatıldı, ancak ${acikIsler} iş hâlâ tamamlanmamış.`,
    };
  }

  return {
    status: "success",
    message: status === "closed" ? "Segment kapatıldı" : "Segment yeniden açıldı",
  };
}
