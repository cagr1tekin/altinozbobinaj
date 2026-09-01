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
  unit_type_default: z.enum(["piece", "gram"]),
  notes: opsiyonelMetin(1000),
});

/* Miktar tek alan: ürünün birimi (adet / gram) hangi kolona yazılacağını
   belirliyor, kullanıcı birim seçmiyor. İkisi de tam sayı olduğu için
   ondalık kabul edilmiyor — virgüllü giriş başlı başına bir hata kaynağıydı. */
export const stokHareketSchema = z.object({
  product_id: z.string().uuid("Ürün seçilmedi"),
  movement_type: z.enum(["purchase_in", "adjustment"], {
    message: "Geçersiz hareket tipi",
  }),
  // Düzeltme hareketinde eksi girilebilmeli, bu yüzden sayi() kullanılmıyor.
  miktar: z
    .string()
    .trim()
    .transform((v) => Number(v.length === 0 ? "0" : v))
    .refine((v) => Number.isFinite(v), { message: "Miktar sayı olmalı" })
    .refine((v) => Number.isInteger(v), {
      message: "Miktar tam sayı olmalı (ondalık girilemez)",
    })
    .refine((v) => v !== 0, { message: "Miktar girilmeli" }),
  note: opsiyonelMetin(500),
}).refine(
  (d) => d.movement_type !== "purchase_in" || d.miktar > 0,
  { message: "Stok girişinde miktar eksi olamaz", path: ["miktar"] }
);

export const isMalzemeSchema = z.object({
  job_id: z.string().uuid(),
  product_id: z.string().uuid("Ürün seçilmedi"),
  miktar: sayi("Miktar", { tamsayi: true }).refine((v) => v > 0, {
    message: "Miktar sıfırdan büyük olmalı",
  }),
});

/* Fatura tutarlari: brut = net + vergi olmali. Muhasebe kaydinin kendi
   icinde tutarsiz olmasi, dashboard'daki kar/zarar hesabini sessizce
   bozuyor; bu yuzden girise izin verilmiyor. */
export const faturaSchema = z
  .object({
    customer_id: z.string().uuid("Müşteri seçilmedi"),
    segment_id: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null))
      .refine((v) => v === null || z.string().uuid().safeParse(v).success, {
        message: "Geçersiz segment",
      }),
    invoice_no: opsiyonelMetin(60),
    gross_amount: sayi("Brüt tutar"),
    net_amount: sayi("Net tutar"),
    tax_amount: sayi("Vergi"),
    issue_date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih seçilmeli"),
    note: opsiyonelMetin(1000),
  })
  .refine((d) => d.net_amount <= d.gross_amount, {
    message: "Net tutar brüt tutardan büyük olamaz",
    path: ["net_amount"],
  })
  .refine(
    (d) => Math.abs(d.gross_amount - (d.net_amount + d.tax_amount)) < 0.01,
    {
      message: "Brüt tutar, net tutar ile verginin toplamına eşit olmalı",
      path: ["gross_amount"],
    }
  );

/* Dashboard tarih araligi */
export const donemSchema = z
  .object({
    baslangic: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    bitis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((d) => d.baslangic <= d.bitis, {
    message: "Başlangıç tarihi bitişten sonra olamaz",
    path: ["baslangic"],
  });

export type FaturaInput = z.infer<typeof faturaSchema>;
export type MusteriInput = z.infer<typeof musteriSchema>;
export type SegmentInput = z.infer<typeof segmentSchema>;
export type IsInput = z.infer<typeof isSchema>;
export type UrunInput = z.infer<typeof urunSchema>;
export type StokHareketInput = z.infer<typeof stokHareketSchema>;
export type IsMalzemeInput = z.infer<typeof isMalzemeSchema>;
