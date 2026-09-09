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

/**
 * Boş bırakılabilen para alanı: boş = "girilmedi" (null), dolu = tutar.
 *
 * `sayi()` boşu 0 sayıyor, burada olmaz: "0 TL alındı" ile "tutar
 * girilmedi" farklı şeyler ve ciro hesabı bu ayrıma bakıyor.
 */
const opsiyonelTutar = (alan: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) =>
      v === undefined || v.length === 0 ? null : Number(v.replace(",", "."))
    )
    .refine((v) => v === null || Number.isFinite(v), {
      message: `${alan} sayı olmalı`,
    })
    .refine((v) => v === null || v >= 0, {
      message: `${alan} negatif olamaz`,
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
  /* İş açılırken girilebilen tutar. İş sayfasındaki "İş tutarı"
     alanıyla AYNI ŞEY: aynı kolona (jobs.agreed_amount) yazıyor.
     Not niteliğinde — hiçbir tahsilat veya rapor hesabına girmiyor. */
  agreed_amount: opsiyonelTutar("İş tutarı"),
});

/* Tamamlanmış iş dahil her an düzenlenebilen iş tutarı notu. Boş
   göndermek notu siliyor. */
export const isTutarSchema = z.object({
  job_id: z.string().uuid("İş bulunamadı"),
  agreed_amount: opsiyonelTutar("İş tutarı"),
});

export const isDurumSchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum(["pending", "in_progress"], {
    message: "Tamamlama ayrı akışla yapılır",
  }),
});

/* Ürün tanımı artık fiyat sormuyor: fiyat alım anında belli oluyor,
   ürün tanımlanırken değil. Yeni ürün stok girişiyle birlikte
   tanımlanıyor (urunStokEkle), var olan ürünün fiyatı her stok
   girişinde güncelleniyor. */
export const urunSchema = z.object({
  name: zorunluMetin("Ürün adı"),
  sku: opsiyonelMetin(60),
  unit_type_default: z.enum(["piece", "gram"]),
  notes: opsiyonelMetin(1000),
});

/* Yeni ürün + ilk stok girişi tek formda. Miktar zorunlu: ürünü stok
   girmeden tanımlamak, fiyatı olmayan bir ürün bırakırdı. */
export const urunStokEkleSchema = z.object({
  name: zorunluMetin("Ürün adı"),
  sku: opsiyonelMetin(60),
  unit_type_default: z.enum(["piece", "gram"]),
  miktar: sayi("Miktar", { tamsayi: true }).refine((v) => v > 0, {
    message: "Miktar sıfırdan büyük olmalı",
  }),
  purchase_price: sayi("Alış fiyatı"),
  note: opsiyonelMetin(500),
});

/* Miktar tek alan: ürünün birimi (adet / gram) hangi kolona yazılacağını
   belirliyor, kullanıcı birim seçmiyor. İkisi de tam sayı olduğu için
   ondalık kabul edilmiyor — virgüllü giriş başlı başına bir hata kaynağıydı. */
export const stokHareketSchema = z
  .object({
    product_id: z.string().uuid("Ürün seçilmedi"),
    /* Hareket tipi artık sorulmuyor: miktarın işareti belirliyor.
       "Giriş mi düzeltme mi" kararı kullanıcıdan kalktı; sayım
       düzeltmesi de böylece tamamen kapandı. Eksi girilebildiği için
       sayi() kullanılmıyor. */
    miktar: z
      .string()
      .trim()
      .transform((v) => Number(v.length === 0 ? "0" : v))
      .refine((v) => Number.isFinite(v), { message: "Miktar sayı olmalı" })
      .refine((v) => Number.isInteger(v), {
        message: "Miktar tam sayı olmalı (ondalık girilemez)",
      })
      .refine((v) => v !== 0, { message: "Miktar girilmeli" }),
    /* Fiyat yalnızca girişte anlamlı; çıkış bir satın alma değil. */
    purchase_price: opsiyonelTutar("Alış fiyatı"),
    note: opsiyonelMetin(500),
  })
  .refine((d) => !(d.miktar < 0 && d.purchase_price !== null), {
    message: "Stok çıkışında fiyat girilmez",
    path: ["purchase_price"],
  });

/* İş tamamlama: en az bir işlem ZORUNLU.
   Bir motora aynı ziyarette hem sarım hem revizyon yapılabildiği için
   çoklu seçim. Form tarafında da zorunlu ama eylem doğrudan
   çağrılabilir; asıl kural burada ve veritabanı kısıtında. */
export const isTamamlaSchema = z.object({
  job_id: z.string().uuid("İş bulunamadı"),
  /* Aynı isimli birden çok checkbox geliyor; FormData.getAll ile okunuyor
     (Object.fromEntries yalnızca SON değeri verir, ilk seçim sessizce
     kaybolurdu). */
  service_types: z
    .array(z.enum(["winding", "revision"]))
    .min(1, "En az bir işlem seçin: motor sarımı ve/veya revizyon")
    /* Tekrar gelmesi beklenmiyor ama gelirse müşteri belgesinde
       "motor sarımı ve motor sarımı" yazardı. */
    .transform((v) => Array.from(new Set(v))),
  /* Tutar alanı BİLİNÇLİ olarak yok: para ile işin tamamlanması
     arasında bağ kurulmuyor. İş tutarı iş sayfasından her zaman
     düzenlenebilen ayrı bir not. */
  allow_negative: z
    .string()
    .optional()
    .transform((v) => v === "1"),
});

/* Müşteriyle anlaşılan TOPLAM tutar (faturasız segment için). Boş
   göndermek tutarı temizliyor, böylece fatura yolu açılabiliyor.
   Tahsil edilen para bu alanda DEĞİL. */
export const segmentAnlasilanSchema = z.object({
  segment_id: z.string().uuid("Segment bulunamadı"),
  agreed_amount: opsiyonelTutar("Anlaşılan tutar"),
});

/**
 * Tahsilat (vade).
 *
 * Tutar ZORUNLU ve sıfırdan büyük: opsiyonelTutar burada yanlış olurdu,
 * boş bir tahsilat kaydı bir şey ifade etmiyor.
 *
 * Tarih de zorunlu — aylık gelir buna göre hesaplanıyor ve "hangi gün
 * alındı" sorusunun boş kalması raporu sessizce bozar. Form bugünü
 * hazır getiriyor, kullanıcı geriye alabiliyor.
 */
const tahsilatTutari = z
  .string()
  .trim()
  .min(1, "Tahsilat tutarı girilmeli")
  .transform((v) => Number(v.replace(",", ".")))
  .refine((v) => Number.isFinite(v), { message: "Tutar sayı olmalı" })
  .refine((v) => v > 0, { message: "Tutar sıfırdan büyük olmalı" });

const tahsilatTarihi = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tahsilat tarihi seçilmeli")
  /* Gelecek tarih reddediliyor: "alınan para"nın tanımı geriye dönük.
     İleri tarihli bir vade PLANLANMIŞ ödemedir; gelir hesabına girse
     o ay olmayan para gelmiş gibi görünürdü. Kural veritabanında da
     var, burası anlaşılır Türkçe hata için. */
  .refine(
    (v) => {
      const b = new Date();
      const bugun = `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(b.getDate()).padStart(2, "0")}`;
      return v <= bugun;
    },
    { message: "Tahsilat tarihi gelecekte olamaz" }
  );

export const tahsilatSchema = z.object({
  segment_id: z.string().uuid("Segment bulunamadı"),
  amount: tahsilatTutari,
  paid_on: tahsilatTarihi,
  note: opsiyonelMetin(300),
});

export const tahsilatGuncelleSchema = z.object({
  id: z.string().uuid("Tahsilat bulunamadı"),
  segment_id: z.string().uuid("Segment bulunamadı"),
  amount: tahsilatTutari,
  paid_on: tahsilatTarihi,
  note: opsiyonelMetin(300),
});

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
export type TahsilatInput = z.infer<typeof tahsilatSchema>;
export type UrunInput = z.infer<typeof urunSchema>;
export type StokHareketInput = z.infer<typeof stokHareketSchema>;
export type UrunStokEkleInput = z.infer<typeof urunStokEkleSchema>;
export type IsMalzemeInput = z.infer<typeof isMalzemeSchema>;
