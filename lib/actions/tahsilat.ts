"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  tahsilatGuncelleSchema,
  tahsilatSchema,
} from "@/lib/validation/schemas";
import {
  type ActionState,
  veritabaniHatasi,
  zodHatasi,
} from "@/lib/actions/types";

/**
 * Tahsilat (vade) eylemleri.
 *
 * Anlaşılan tutar ile alınan para iki ayrı şey: anlaşılan tutar
 * segmentin üzerinde tek bir alan, tahsilat ise birden çok satır.
 * Müşteri parayı tek seferde ödemiyor ve her ödemenin KENDİ TARİHİ
 * aylık gelir hesabına giriyor.
 *
 * Yazma işlemleri veritabanı fonksiyonlarından geçiyor: silinmiş
 * segment ve gelecek tarih kontrolü orada, tek yerde.
 */

/* Tahsilat üç ekranı birden etkiliyor: segment sayfası (bakiye),
   Özet ve Raporlar (gelir). Üçü de tazelenmezse kullanıcı parayı
   girdikten sonra raporda göremiyor ve iki kez giriyor. */
function tahsilatSayfalari(segmentId: string) {
  revalidatePath(`/yonetim/segmentler/${segmentId}`);
  revalidatePath("/yonetim");
  revalidatePath("/yonetim/raporlar");
  revalidatePath("/yonetim/musteriler", "layout");
}

export async function tahsilatEkle(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = tahsilatSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("tahsilat_ekle", {
    p_segment_id: parsed.data.segment_id,
    p_tutar: parsed.data.amount,
    p_tarih: parsed.data.paid_on,
    p_not: parsed.data.note,
  });

  if (error) return veritabaniHatasi(error, "Tahsilat kaydedilemedi");

  tahsilatSayfalari(parsed.data.segment_id);
  return { status: "success", message: "Tahsilat kaydedildi" };
}

export async function tahsilatGuncelle(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = tahsilatGuncelleSchema.safeParse(
    Object.fromEntries(formData)
  );
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("tahsilat_guncelle", {
    p_id: parsed.data.id,
    p_tutar: parsed.data.amount,
    p_tarih: parsed.data.paid_on,
    p_not: parsed.data.note,
  });

  if (error) return veritabaniHatasi(error, "Tahsilat güncellenemedi");

  tahsilatSayfalari(parsed.data.segment_id);
  return { status: "success", message: "Tahsilat güncellendi" };
}

export async function tahsilatSil(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = formData.get("id");
  const segmentId = formData.get("segment_id");

  if (typeof id !== "string" || typeof segmentId !== "string") {
    return { status: "error", message: "Geçersiz istek" };
  }

  const supabase = await createClient();
  /* Yumuşak silme: para kaydı fiziksel olarak yok olmuyor. Yanlışlıkla
     silinen bir tahsilat SQL Editor'den geri getirilebiliyor. */
  const { error } = await supabase.rpc("kayit_sil", {
    p_tablo: "payments",
    p_id: id,
  });

  if (error) return veritabaniHatasi(error, "Tahsilat silinemedi");

  tahsilatSayfalari(segmentId);
  return { status: "success", message: "Tahsilat kaldırıldı" };
}
