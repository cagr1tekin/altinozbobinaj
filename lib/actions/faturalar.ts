"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { faturaOku } from "@/lib/fatura/ayristir";
import { type ActionState, veritabaniHatasi } from "@/lib/actions/types";

const MAX_BOYUT = 10 * 1024 * 1024; // 10 MB — Storage bucket limitiyle aynı

/**
 * Fatura PDF'ini yükler, tutarları okur ve segmente bağlar.
 *
 * Kullanıcı tercihi gereği önizleme yok: okuma başarılıysa doğrudan
 * kaydediliyor. Bu yüzden ayrıştırma tarafı sıkı — tutarlar birbirini
 * tutmuyorsa ya da alanlar okunamıyorsa kayıt yapılmıyor ve neden
 * okunamadığı söyleniyor.
 */
export async function faturaYukle(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const segmentId = formData.get("segment_id");
  const dosya = formData.get("dosya");

  if (typeof segmentId !== "string" || segmentId.length === 0) {
    return { status: "error", message: "Segment bulunamadı" };
  }
  if (!(dosya instanceof File) || dosya.size === 0) {
    return { status: "error", message: "Fatura dosyası seçilmedi" };
  }
  if (dosya.size > MAX_BOYUT) {
    return {
      status: "error",
      message: "Dosya 10 MB'tan büyük olamaz.",
    };
  }
  if (dosya.type && dosya.type !== "application/pdf") {
    return {
      status: "error",
      message: "Yalnızca PDF yüklenebilir. e-Fatura sağlayıcınızdan indirdiğiniz dosyayı seçin.",
    };
  }

  const supabase = await createClient();

  /* Segmentin hangi müşteriye ait olduğunu buradan alıyoruz; faturadaki
     ünvana güvenmiyoruz. Fatura zaten o segment için yükleniyor. */
  const { data: segment } = await supabase
    .from("segments")
    .select("id, customer_id")
    .eq("id", segmentId)
    .maybeSingle();

  if (!segment) return { status: "error", message: "Segment bulunamadı" };

  const baytlar = new Uint8Array(await dosya.arrayBuffer());
  const sonuc = await faturaOku(baytlar);

  if (sonuc.durum === "hata") {
    return { status: "error", message: sonuc.mesaj };
  }

  const a = sonuc.alanlar;

  /* Aynı fatura iki kez yüklenmesin. ETTN, GİB'in ürettiği benzersiz belge
     kimliği; veritabanında da unique index var ama kullanıcıya anlamlı
     mesaj verebilmek için önce kontrol ediyoruz. */
  if (a.ettn) {
    const { data: mevcut } = await supabase
      .from("invoices")
      .select("id, segment_id")
      .eq("ettn", a.ettn)
      .maybeSingle();

    if (mevcut) {
      return {
        status: "error",
        message:
          mevcut.segment_id === segmentId
            ? "Bu fatura bu segmente zaten yüklenmiş."
            : "Bu fatura başka bir segmente yüklenmiş.",
      };
    }
  }

  /* Dosya adı: tahmin edilemez olmalı ve çakışmamalı. Fatura numarası
     okunabildiyse ona göre adlandırılıyor, yoksa zaman damgası. */
  const guvenliAd = (a.faturaNo ?? `fatura-${Date.now()}`).replace(
    /[^A-Za-z0-9-]/g,
    ""
  );
  const yol = `${segment.customer_id}/${segmentId}/${guvenliAd}.pdf`;

  const { error: yuklemeHatasi } = await supabase.storage
    .from("faturalar")
    .upload(yol, baytlar, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (yuklemeHatasi) {
    return {
      status: "error",
      message:
        yuklemeHatasi.message.includes("exists")
          ? "Bu numarada bir fatura dosyası zaten yüklü."
          : "Dosya yüklenemedi. Storage bucket'ının oluşturulduğunu kontrol edin.",
    };
  }

  const { error } = await supabase.from("invoices").insert({
    customer_id: segment.customer_id,
    segment_id: segmentId,
    invoice_no: a.faturaNo,
    ettn: a.ettn,
    gross_amount: a.brutTutar!,
    net_amount: a.netTutar!,
    tax_amount: a.vergiTutar ?? 0,
    issue_date: a.tarih!,
    supplier_name: a.aliciUnvan,
    file_path: yol,
    parsed_at: new Date().toISOString(),
  });

  if (error) {
    /* Kayıt başarısızsa yüklenen dosya ortada kalmasın */
    await supabase.storage.from("faturalar").remove([yol]);
    return veritabaniHatasi(error, "Fatura kaydedilemedi");
  }

  revalidatePath(`/yonetim/segmentler/${segmentId}`);
  revalidatePath("/yonetim/raporlar");

  const tutar = new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
  }).format(a.brutTutar!);

  return {
    status: "success",
    message: `Fatura okundu ve kaydedildi: ${a.faturaNo ?? "numarasız"} · ${tutar}`,
  };
}

export async function faturaSil(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = formData.get("id");
  const segmentId = formData.get("segment_id");

  if (typeof id !== "string") {
    return { status: "error", message: "Fatura bulunamadı" };
  }

  const supabase = await createClient();

  const { data: fatura } = await supabase
    .from("invoices")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) return veritabaniHatasi(error, "Fatura silinemedi");

  /* Kayıt gittiyse dosya da gitmeli; aksi hâlde Storage'da sahipsiz
     dosyalar birikir. Dosya silinemezse kayıt yine de silinmiş olur. */
  if (fatura?.file_path) {
    await supabase.storage.from("faturalar").remove([fatura.file_path]);
  }

  if (typeof segmentId === "string") {
    revalidatePath(`/yonetim/segmentler/${segmentId}`);
  }
  revalidatePath("/yonetim/raporlar");

  return { status: "success", message: "Fatura silindi" };
}

/** Fatura PDF'i için kısa ömürlü imzalı bağlantı üretir. */
export async function faturaBaglantisi(
  yol: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("faturalar")
    .createSignedUrl(yol, 60 * 5); // 5 dakika
  return data?.signedUrl ?? null;
}
