import type { ZodError } from "zod";

/**
 * Server action'ların ortak dönüş tipi.
 *
 * Hata durumunda exception atmak yerine bunu döndürüyoruz: form
 * bileşenleri useActionState ile alan bazlı hataları gösterebiliyor.
 */
export type ActionState =
  | { status: "idle" }
  | { status: "success"; message?: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

export const idleState: ActionState = { status: "idle" };

export function zodHatasi(error: ZodError): ActionState {
  const flat = error.flatten();
  const fieldErrors = flat.fieldErrors as Record<string, string[] | undefined>;

  const ilkHata =
    Object.values(fieldErrors).flatMap((v) => v ?? [])[0] ??
    flat.formErrors[0] ??
    "Girilen bilgiler geçersiz";

  return {
    status: "error",
    message: ilkHata,
    fieldErrors: Object.fromEntries(
      Object.entries(fieldErrors).filter(
        (girdi): girdi is [string, string[]] => Array.isArray(girdi[1])
      )
    ),
  };
}

/**
 * Postgres hatalarını kullanıcıya gösterilebilir mesaja çevirir.
 *
 * RAISE EXCEPTION ile attığımız Türkçe mesajlar doğrudan gösterilebilir;
 * altyapı hataları (bağlantı, yetki) kullanıcıya ham hâliyle
 * gösterilmemeli çünkü şema detayı sızdırabilir.
 */
export function veritabaniHatasi(
  error: { message?: string; code?: string } | null,
  varsayilan = "İşlem tamamlanamadı"
): ActionState {
  if (!error) return { status: "error", message: varsayilan };

  const kod = error.code ?? "";
  const mesaj = error.message ?? "";

  // Fonksiyonlarımızın attığı iş kuralı hataları
  const isKuraliKodlari = [
    "P0002", // no_data_found
    "22023", // invalid_parameter_value
    "23514", // check_violation
    "23505", // unique_violation
    "23503", // foreign_key_violation
  ];

  if (isKuraliKodlari.includes(kod)) {
    if (kod === "23505") {
      return {
        status: "error",
        message: mesaj.includes("invoice_no")
          ? "Bu fatura numarası zaten kayıtlı"
          : "Bu kayıt zaten mevcut",
      };
    }
    if (kod === "23503") {
      return {
        status: "error",
        message:
          "Bu kayıt başka kayıtlar tarafından kullanıldığı için silinemiyor",
      };
    }
    // plpgsql RAISE mesajları zaten Türkçe ve kullanıcıya yönelik
    return { status: "error", message: mesaj || varsayilan };
  }

  // Yetki hatası: oturum düşmüş olabilir
  if (kod === "42501" || kod === "PGRST301") {
    return {
      status: "error",
      message: "Bu işlem için yetkiniz yok veya oturumunuz sona ermiş",
    };
  }

  return { status: "error", message: varsayilan };
}
