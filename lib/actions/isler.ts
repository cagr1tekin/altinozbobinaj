"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isMalzemeSchema,
  isSchema,
  isDurumSchema,
  isTamamlaSchema,
} from "@/lib/validation/schemas";
import {
  type ActionState,
  veritabaniHatasi,
  zodHatasi,
} from "@/lib/actions/types";

export async function isOlustur(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = isSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();

  /* Yeni iş doğrudan "devam ediyor" başlıyor: sahada ayrıca "başlat"
     demek gereksiz bir adımdı. Veritabanı varsayılanı da 0004
     migration'ında in_progress yapıldı; burada açıkça gönderilmesi,
     varsayılan uygulanmamış bir ortamda da aynı davranışı garantiliyor. */
  const { data, error } = await supabase
    .from("jobs")
    .insert({ ...parsed.data, status: "in_progress" })
    .select("id, segment_id")
    .single();

  if (error) return veritabaniHatasi(error, "İş oluşturulamadı");

  revalidatePath(`/yonetim/segmentler/${data.segment_id}`);
  redirect(`/yonetim/isler/${data.id}`);
}

export async function isDurumDegistir(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = isDurumSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();

  /* completed_at, veritabanındaki CHECK kısıtı gereği status ile tutarlı
     olmalı. Buradan yalnızca pending/in_progress'e geçilebiliyor
     (isDurumSchema bunu zorluyor), tamamlama isTamamla ile yapılıyor. */
  const { error } = await supabase
    .from("jobs")
    .update({ status: parsed.data.status, completed_at: null })
    .eq("id", parsed.data.job_id);

  if (error) return veritabaniHatasi(error, "İş durumu değiştirilemedi");

  revalidatePath(`/yonetim/isler/${parsed.data.job_id}`);
  return { status: "success", message: "İş durumu güncellendi" };
}

export async function isMalzemeEkle(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = isMalzemeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();

  /* add_job_product() alış fiyatını o anki hâliyle unit_cost_snapshot'a
     yazıyor (PRD Soru 3) ve tamamlanmış işe ekleme yapılmasını engelliyor. */
  const { error } = await supabase.rpc("add_job_product", {
    p_job_id: parsed.data.job_id,
    p_product_id: parsed.data.product_id,
    p_miktar: parsed.data.miktar,
  });

  if (error) return veritabaniHatasi(error, "Malzeme eklenemedi");

  revalidatePath(`/yonetim/isler/${parsed.data.job_id}`);
  return { status: "success", message: "Malzeme işe eklendi" };
}

export async function isMalzemeSil(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = formData.get("id");
  const jobId = formData.get("job_id");

  if (typeof id !== "string" || typeof jobId !== "string") {
    return { status: "error", message: "Geçersiz istek" };
  }

  const supabase = await createClient();

  // Tamamlanmış işin malzemesi silinirse stok düşümü ile kayıt tutarsız kalır
  const { data: job } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", jobId)
    .single();

  if (job?.status === "completed") {
    return {
      status: "error",
      message:
        "Tamamlanmış işin malzemesi silinemez. Önce tamamlamayı geri alın.",
    };
  }

  const { error } = await supabase.from("job_products").delete().eq("id", id);
  if (error) return veritabaniHatasi(error, "Malzeme silinemedi");

  revalidatePath(`/yonetim/isler/${jobId}`);
  return { status: "success", message: "Malzeme kaldırıldı" };
}

export async function isTamamla(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = isTamamlaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const jobId = parsed.data.job_id;

  const supabase = await createClient();

  /* Stok düşümü, hareket kaydı, durum değişimi ve QR üretimi tek
     transaction'da complete_job() içinde yapılıyor. Bunu uygulama
     katmanında sırayla yapmak eşzamanlı isteklerde stoğu bozuyor. */
  const { data, error } = await supabase.rpc("complete_job", {
    p_job_id: jobId,
    p_service_type: parsed.data.service_type,
    // Kullanıcı "stok yetersiz" uyarısını görüp yine de devam etmeyi seçtiyse
    p_allow_negative: parsed.data.allow_negative,
  });

  if (error) return veritabaniHatasi(error, "İş tamamlanamadı");

  revalidatePath(`/yonetim/isler/${jobId}`);
  revalidatePath("/yonetim");

  const sonuc = data as { qr_token?: string; material_lines?: number } | null;
  const malzemeSayisi = sonuc?.material_lines ?? 0;

  return {
    status: "success",
    message:
      malzemeSayisi > 0
        ? `İş tamamlandı, ${malzemeSayisi} malzeme stoktan düşüldü.`
        : "İş tamamlandı. Bu işe malzeme girilmemişti, stok değişmedi.",
  };
}

export async function isTamamlamaGeriAl(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const jobId = formData.get("job_id");
  if (typeof jobId !== "string") {
    return { status: "error", message: "İş bulunamadı" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revert_job_completion", {
    p_job_id: jobId,
  });

  if (error) return veritabaniHatasi(error, "Tamamlama geri alınamadı");

  revalidatePath(`/yonetim/isler/${jobId}`);
  revalidatePath("/yonetim");

  const sonuc = data as { reverted_lines?: number } | null;
  return {
    status: "success",
    message: `Tamamlama geri alındı, ${sonuc?.reverted_lines ?? 0} malzeme stoğa iade edildi.`,
  };
}
