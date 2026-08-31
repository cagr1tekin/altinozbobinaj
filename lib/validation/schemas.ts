import { z } from "zod";

/**
 * Form doğrulama şemaları.
 *
 * Veritabanındaki CHECK kısıtlarıyla kasıtlı olarak örtüşüyor: veritabanı
 * son savunma hattı, burası kullanıcıya anlaşılır Türkçe hata verebilmek
 * için ilk hat. İkisinden biri eksik olursa ya kötü hata mesajı ya da
 * bozuk veri oluşuyor.
 */

const zorunluMetin = (alan: string, max = 200) =>
  z
    .string()
    .trim()
    .min(1, `${alan} zorunlu`)
    .max(max, `${alan} en fazla ${max} karakter olabilir`);

const opsiyonelMetin = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter olabilir`)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

/** Boş string'i 0 sayan, virgüllü ondalık kabul eden sayı alanı */
const sayi = (alan: string, { tamsayi = false } = {}) =>
  z
    .string()
    .trim()
    .transform((v) => Number(v.length === 0 ? "0" : v.replace(",", ".")))
    .refine((v) => Number.isFinite(v), { message: `${alan} sayı olmalı` })
    .refine((v) => v >= 0, { message: `${alan} negatif olamaz` })
    .refine((v) => !tamsayi || Number.isInteger(v), {
      message: `${alan} tam sayı olmalı`,
    });

export const musteriSchema = z.object({
  name: zorunluMetin("Müşteri adı"),
  phone: opsiyonelMetin(40),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || z.string().email().safeParse(v).success, {
      message: "Geçerli bir e-posta girin",
    }),
  address: opsiyonelMetin(500),
  tax_number: opsiyonelMetin(40),
  notes: opsiyonelMetin(2000),
});

export const segmentSchema = z.object({
  customer_id: z.string().uuid("Müşteri seçilmedi"),
  segment_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih GG.AA.YYYY biçiminde seçilmeli"),
  note: opsiyonelMetin(1000),
});

export const isSchema = z.object({
  segment_id: z.string().uuid("Segment seçilmedi"),
  title: zorunluMetin("İş başlığı"),
  description: opsiyonelMetin(2000),
});

export const isDurumSchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum(["pending", "in_progress"], {
    message: "Tamamlama ayrı akışla yapılır",
  }),
});

export const urunSchema = z.object({
  name: zorunluMetin("Ürün adı"),
  sku: opsiyonelMetin(60),
  purchase_price: sayi("Alış fiyatı"),
  unit_type_default: z.enum(["piece", "kg", "both"]),
  notes: opsiyonelMetin(1000),
});

export const stokHareketSchema = z
  .object({
    product_id: z.string().uuid("Ürün seçilmedi"),
    movement_type: z.enum(["purchase_in", "adjustment"], {
      message: "Geçersiz hareket tipi",
    }),
    // Düzeltme hareketinde eksi girilebilmeli, bu yüzden ham string alıp
    // ayrıca parse ediyoruz (sayi() negatife izin vermiyor).
    qty_pieces_delta: z
      .string()
      .trim()
      .transform((v) => Number(v.length === 0 ? "0" : v.replace(",", ".")))
      .refine((v) => Number.isFinite(v), { message: "Adet sayı olmalı" })
      .refine((v) => Number.isInteger(v), { message: "Adet tam sayı olmalı" }),
    qty_kg_delta: z
      .string()
      .trim()
      .transform((v) => Number(v.length === 0 ? "0" : v.replace(",", ".")))
      .refine((v) => Number.isFinite(v), { message: "Kilogram sayı olmalı" }),
    note: opsiyonelMetin(500),
  })
  .refine((d) => d.qty_pieces_delta !== 0 || d.qty_kg_delta !== 0, {
    message: "Adet veya kilogram alanlarından en az biri girilmeli",
    path: ["qty_pieces_delta"],
  })
  .refine(
    (d) =>
      d.movement_type !== "purchase_in" ||
      (d.qty_pieces_delta >= 0 && d.qty_kg_delta >= 0),
    {
      message: "Stok girişinde miktar negatif olamaz",
      path: ["qty_pieces_delta"],
    }
  );

export const isMalzemeSchema = z
  .object({
    job_id: z.string().uuid(),
    product_id: z.string().uuid("Ürün seçilmedi"),
    qty_pieces: sayi("Adet", { tamsayi: true }),
    qty_kg: sayi("Kilogram"),
  })
  .refine((d) => d.qty_pieces > 0 || d.qty_kg > 0, {
    message: "Adet veya kilogram alanlarından en az biri girilmeli",
    path: ["qty_pieces"],
  });

export type MusteriInput = z.infer<typeof musteriSchema>;
export type SegmentInput = z.infer<typeof segmentSchema>;
export type IsInput = z.infer<typeof isSchema>;
export type UrunInput = z.infer<typeof urunSchema>;
export type StokHareketInput = z.infer<typeof stokHareketSchema>;
export type IsMalzemeInput = z.infer<typeof isMalzemeSchema>;
