"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { faturaSchema } from "@/lib/validation/schemas";
import {
  type ActionState,
  veritabaniHatasi,
  zodHatasi,
} from "@/lib/actions/types";

export async function faturaOlustur(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = faturaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("invoices").insert(parsed.data);

  if (error) return veritabaniHatasi(error, "Fatura kaydedilemedi");

  revalidatePath("/yonetim/faturalar");
  revalidatePath("/yonetim");
  return { status: "success", message: "Fatura kaydedildi" };
}

export async function faturaSil(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string") {
    return { status: "error", message: "Fatura bulunamadı" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("invoices").delete().eq("id", id);

  if (error) return veritabaniHatasi(error, "Fatura silinemedi");

  revalidatePath("/yonetim/faturalar");
  revalidatePath("/yonetim");
  return { status: "success", message: "Fatura silindi" };
}
