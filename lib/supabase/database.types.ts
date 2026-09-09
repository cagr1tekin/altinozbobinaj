/**
 * Veritabanı tipleri.
 *
 * supabase/migrations/ altındaki şemayla elle eşleştirildi. Supabase CLI
 * kurulduktan sonra şu komutla yeniden üretilebilir:
 *
 *   npx supabase gen types typescript --project-id <proje-id> > lib/supabase/database.types.ts
 *
 * Şema değişirse bu dosya da güncellenmeli.
 *
 * Not: supabase-js şema tipini yapısal olarak doğruluyor. Views,
 * CompositeTypes ve tablo başına Relationships alanları eksikse tüm satır
 * tipleri sessizce `never`'a düşüyor; bu yüzden hepsi tanımlı.
 */

export type JobStatus = "pending" | "in_progress" | "completed";
export type SegmentStatus = "open" | "closed";
/* Her ürünün TEK birimi var: ya adet ya gram. "both" kaldırıldı — iki
   miktar alanını aynı anda göstermek atölyede tereddüt yaratıyordu. */
export type UnitType = "piece" | "gram";

/** Yapılan işlem. İş tamamlanırken zorunlu olarak seçiliyor. */
export type ServiceType = "winding" | "revision";
/* 'adjustment' (sayım düzeltmesi) 0014 ile üretilmiyor ama enum'dan
   SİLİNMEDİ: geçmiş hareketler onu taşıyor ve silmek onları okunamaz
   hâle getirirdi. Yeni hareketler purchase_in / manual_out. */
export type MovementType =
  | "purchase_in"
  | "manual_out"
  | "job_out"
  | "adjustment"
  | "job_revert";

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /* Yumuşak silme: dolu ise kayıt listelerde ve toplamlarda görünmez
     ama veritabanında durur. Fiziksel silme RLS ile engelli. */
  deleted_at: string | null;
};

export type Segment = {
  id: string;
  customer_id: string;
  segment_date: string;
  note: string | null;
  status: SegmentStatus;
  /* Müşteriyle ANLAŞILAN toplam tutar (fatura kesilmeyen işler için).
     Bir segmentte YA fatura YA bu tutar olur — ikisi de aynı şeyi,
     "toplam alınacak para"yı ifade ediyor.
     TAHSİL EDİLEN para burada DEĞİL: o `payments` tablosunda ve
     birden çok vadeye bölünebiliyor. */
  agreed_amount: number | null;
  created_at: string;
  updated_at: string;
  /* Yumuşak silme: dolu ise kayıt listelerde ve toplamlarda görünmez
     ama veritabanında durur. Fiziksel silme RLS ile engelli. */
  deleted_at: string | null;
};

export type Job = {
  id: string;
  segment_id: string;
  title: string;
  description: string | null;
  status: JobStatus;
  completed_at: string | null;
  /* Tamamlanmamış işte null; tamamlanmışta en az bir eleman (şema kısıtı).
     Dizi: bir ziyarette hem sarım hem revizyon yapılabiliyor. */
  service_types: ServiceType[] | null;
  /* İş başına anlaşılan tutar. YALNIZCA NOT: hiçbir tahsilat, kâr veya
     rapor hesabına girmiyor — para segment düzeyinde takip ediliyor.
     İşin durumundan bağımsız her zaman düzenlenebiliyor. */
  agreed_amount: number | null;
  created_at: string;
  updated_at: string;
  /* Yumuşak silme: dolu ise kayıt listelerde ve toplamlarda görünmez
     ama veritabanında durur. Fiziksel silme RLS ile engelli. */
  deleted_at: string | null;
};

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  purchase_price: number;
  unit_type_default: UnitType;
  qty_pieces: number;
  qty_grams: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /* Yumuşak silme: dolu ise kayıt listelerde ve toplamlarda görünmez
     ama veritabanında durur. Fiziksel silme RLS ile engelli. */
  deleted_at: string | null;
};

export type JobProduct = {
  id: string;
  job_id: string;
  product_id: string;
  qty_pieces_used: number;
  qty_grams_used: number;
  unit_cost_snapshot: number;
  created_at: string;
  /* Yumuşak silme: dolu ise kayıt listelerde ve toplamlarda görünmez
     ama veritabanında durur. Fiziksel silme RLS ile engelli. */
  deleted_at: string | null;
};

export type StockMovement = {
  id: string;
  /* Artan hareket sırası. created_at transaction başı zamanını aldığı
     için aynı transaction içindeki hareketleri sıralayamıyor; listeler
     ve yürüyen bakiye bu kolona göre sıralanıyor. */
  seq: number;
  product_id: string;
  job_id: string | null;
  movement_type: MovementType;
  qty_pieces_delta: number;
  qty_grams_delta: number;
  /* Bu alımda ödenen birim fiyat. Yalnızca girişlerde dolu. */
  unit_price: number | null;
  note: string | null;
  created_at: string;
};

/** urun_stok_gecmisi() satırı */
export type StokGecmisiSatiri = {
  hareket_id: string;
  zaman: string;
  tip: MovementType;
  miktar: number;
  birim: UnitType;
  birim_fiyat: number | null;
  is_basligi: string | null;
  not_: string | null;
  /** O hareketten sonraki stok — yürüyen bakiye */
  bakiye: number;
};

export type Invoice = {
  id: string;
  customer_id: string;
  segment_id: string | null;
  invoice_no: string | null;
  gross_amount: number;
  net_amount: number;
  tax_amount: number;
  issue_date: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  /* 0007: fatura PDF'inden okunan alanlar */
  file_path: string | null;
  ettn: string | null;
  supplier_name: string | null;
  parsed_at: string | null;
  /* Yumuşak silme: dolu ise kayıt listelerde ve toplamlarda görünmez
     ama veritabanında durur. Fiziksel silme RLS ile engelli. */
  deleted_at: string | null;
};

export type QrCode = {
  id: string;
  job_id: string;
  token: string;
  created_at: string;
};

export type PdfExport = {
  id: string;
  export_type: "customer" | "segment" | "job" | "period_report";
  reference_id: string | null;
  file_path: string | null;
  generated_by: string | null;
  generated_at: string;
};

/**
 * payments satırı — segment başına tahsilat (vade).
 *
 * Anlaşılan tutar tek seferde ödenmediği için bir segmentte birden çok
 * satır olabiliyor. `paid_on` paranın ele geçtiği gün: aylık gelir
 * hesabı fatura ya da segment tarihine değil buna bakıyor.
 */
export type Payment = {
  id: string;
  segment_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** segment_tahsilatlari() satır şekli */
export type SegmentTahsilati = {
  tahsilat_id: string;
  tutar: number;
  tarih: string;
  not_: string | null;
  girildi: string;
};

/** segment_balances satırı — segmentin para durumu tek satırda */
export type SegmentBakiyesi = {
  segment_id: string;
  customer_id: string;
  segment_date: string;
  fatura_sayisi: number;
  fatura_toplam: number;
  elle_girilen: number | null;
  /* Fatura varsa fatura brütü, yoksa elle girilen tutar. Hiç
     girilmemişse null — "borç yok" değil "borç bilinmiyor". */
  anlasilan: number | null;
  tahsil_edilen: number;
  vade_sayisi: number;
  son_tahsilat: string | null;
  /* anlasilan − tahsil_edilen. anlasilan null ise null. Negatifse
     fazla tahsilat var. */
  kalan: number | null;
};

/** complete_job() dönüş şekli */
export type CompleteJobResult = {
  job_id: string;
  qr_token: string;
  material_lines: number;
  service_types: ServiceType[];
};

/** dashboard_summary() dönüş şekli */
export type DashboardOzet = {
  baslangic: string;
  bitis: string;
  /* NAKİT: dönemde fiilen tahsil edilen para (ödeme tarihine göre).
     Ana gelir rakamı. */
  tahsilat: number;
  tahsilat_sayisi: number;
  /* TAHAKKUK: dönemde anlaşılan toplam (segment tarihine göre).
     Tahsil edilmiş olması gerekmiyor; farkı kalan alacağa gidiyor. */
  anlasilan_tutar: number;
  faturali_anlasilan: number;
  elden_anlasilan: number;
  fatura_sayisi: number;
  elden_sayisi: number;
  /* Fatura tarihine göre — vergi hangi ay beyan edilecekse o aya ait.
     Bilinçli olarak yukarıdakinden farklı bir eksen. */
  vergi: number;
  /* Dönem sonu itibarıyla açık bakiye. Akış değil, bakiye. */
  kalan_alacak: number;
  malzeme_maliyeti: number;
  /* tahsilat − malzeme_maliyeti. Nakit esaslı. */
  kar_zarar: number;
  tamamlanan_is: number;
  acik_is: number;
};

/** dashboard_by_customer() satır şekli */
export type DashboardMusteri = {
  customer_id: string;
  customer_name: string;
  tahsilat: number;
  malzeme_maliyeti: number;
  kar_zarar: number;
  /* "Kim bana ne kadar borçlu" — tahsilat takibinin asıl sorusu. */
  kalan_alacak: number;
  tamamlanan_is: number;
};

/** monthly_trend() satır şekli — raporlar grafiği */
export type AylikTrend = {
  donem: string;
  /* Ödeme tarihine göre: para hangi ay alındıysa o ayın geliri. */
  tahsilat: number;
  malzeme_maliyeti: number;
  kar_zarar: number;
};

/** panel_arama() satır şekli — arama sonuçları tek biçimde döner.
 *
 * Müşteri satırında segment ve iş alanları null kalıyor; arayüz her iki
 * türü aynı bileşenle çiziyor ve kırılımı (müşteri > segment > motor)
 * dolu alanlardan kuruyor. */
export type AramaSonucu = {
  tur: "musteri" | "is";
  kayit_id: string;
  musteri_id: string;
  musteri_adi: string;
  segment_id: string | null;
  segment_tarihi: string | null;
  is_id: string | null;
  is_basligi: string | null;
  is_durumu: JobStatus | null;
  siralama: string;
};

/** Denetim günlüğü eylem türü */
export type AuditAction = "insert" | "update" | "delete" | "pdf";

/** Denetim günlüğünde izlenen varlıklar */
export type AuditEntity =
  | "customer"
  | "segment"
  | "job"
  | "job_product"
  | "product"
  | "stock_movement"
  | "invoice"
  | "payment"
  | "report";

/** audit_log satırı — salt okunur, salt eklenir */
export type AuditKaydi = {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  /* Kullanıcı silinse bile günlük okunabilir kalsın diye kaydın içine
     kopyalanıyor; auth.users'a foreign key yok. */
  actor_email: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entity_id: string | null;
  label: string | null;
  details: Record<string, { eski: unknown; yeni: unknown }> | Record<string, unknown> | null;
};

/** stock_reconciliation() satır şekli */
export type StokFarki = {
  product_id: string;
  product_name: string;
  kayitli_adet: number;
  hareketlerden_adet: number;
  birim: UnitType;
  kayitli_gram: number;
  hareketlerden_gram: number;
};

/** public_job_by_token() dönüş şekli — ticari bilgi içermez */
export type PublicJobView = {
  job_title: string;
  completed_at: string | null;
  /* Tamamlanmış iş dönüyor, yani en az bir eleman var. */
  service_types: ServiceType[];
  /* YALNIZCA malzeme adı. Miktar bilinçli olarak dönmüyor: kullanılan
     bakır telin gramı işin maliyetini yaklaşık ele veriyor ve fonksiyon
     anon rolüne açık. Gösterilmeyecek veri hiç gönderilmemeli — arayüzde
     saklamak, ağ sekmesinden bakan biri için gizlemek değil. */
  materials: Array<{ name: string }>;
};

/** Sunucu tarafında üretilen alanlar insert'te opsiyonel olmalı */
type InsertOf<T, Opsiyonel extends keyof T> = Omit<T, Opsiyonel> &
  Partial<Pick<T, Opsiyonel>>;

type Zamanlar = "id" | "created_at" | "updated_at";

export type Database = {
  public: {
    Tables: {
      customers: {
        Row: Customer;
        Insert: InsertOf<
          Customer,
          Zamanlar | "phone" | "email" | "address" | "tax_number" | "notes" | "deleted_at">;
        Update: Partial<Customer>;
        Relationships: [];
      };
      segments: {
        Row: Segment;
        Insert: InsertOf<
          Segment,
          Zamanlar | "segment_date" | "note" | "status" | "agreed_amount" | "deleted_at">;
        Update: Partial<Segment>;
        Relationships: [
          {
            foreignKeyName: "segments_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: Job;
        /* service_types insert'te opsiyonel: iş açılırken henüz ne
           yapılacağı belli değil, tamamlanırken seçiliyor. Şema kısıtı
           yalnızca tamamlanmış işte dolu olmasını şart koşuyor. */
        Insert: InsertOf<
          Job,
          | Zamanlar
          | "description"
          | "status"
          | "completed_at"
          | "service_types"
          | "agreed_amount"
          | "deleted_at"
        >;
        Update: Partial<Job>;
        Relationships: [
          {
            foreignKeyName: "jobs_segment_id_fkey";
            columns: ["segment_id"];
            isOneToOne: false;
            referencedRelation: "segments";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: Product;
        Insert: InsertOf<
          Product,
          | Zamanlar
          | "sku"
          | "purchase_price"
          | "unit_type_default"
          | "qty_pieces"
          | "qty_grams"
          | "notes" | "deleted_at"
        >;
        Update: Partial<Product>;
        Relationships: [];
      };
      job_products: {
        Row: JobProduct;
        Insert: InsertOf<
          JobProduct,
          | "id"
          | "created_at"
          | "qty_pieces_used"
          | "qty_grams_used"
          | "unit_cost_snapshot" | "deleted_at"
        >;
        Update: Partial<JobProduct>;
        Relationships: [
          {
            foreignKeyName: "job_products_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_movements: {
        Row: StockMovement;
        Insert: InsertOf<
          StockMovement,
          | "id"
          | "seq"
          | "created_at"
          | "job_id"
          | "qty_pieces_delta"
          | "qty_grams_delta"
          | "unit_price"
          | "note"
        >;
        /* RLS bu tabloda UPDATE/DELETE vermiyor (denetim izi); tip
           tarafında da Partial bırakılıyor, engel veritabanında. */
        Update: Partial<StockMovement>;
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      /* Tahsilat. Insert/Update tipleri var ama uygulama bunlari
         DOGRUDAN kullanmiyor: yazma tahsilat_ekle() /
         tahsilat_guncelle() uzerinden geciyor, cunku silinmis segment
         ve gelecek tarih kontrolleri orada. */
      payments: {
        Row: Payment;
        Insert: InsertOf<Payment, Zamanlar | "paid_on" | "note" | "deleted_at">;
        Update: Partial<Payment>;
        Relationships: [
          {
            foreignKeyName: "payments_segment_id_fkey";
            columns: ["segment_id"];
            isOneToOne: false;
            referencedRelation: "segments";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: Invoice;
        Insert: InsertOf<
          Invoice,
          | Zamanlar
          | "segment_id"
          | "invoice_no"
          | "gross_amount"
          | "net_amount"
          | "tax_amount"
          | "issue_date"
          | "note"
          | "file_path"
          | "ettn"
          | "supplier_name"
          | "parsed_at" | "deleted_at"
        >;
        Update: Partial<Invoice>;
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_segment_id_fkey";
            columns: ["segment_id"];
            isOneToOne: false;
            referencedRelation: "segments";
            referencedColumns: ["id"];
          },
        ];
      };
      qr_codes: {
        Row: QrCode;
        Insert: InsertOf<QrCode, "id" | "created_at" | "token">;
        Update: Partial<QrCode>;
        Relationships: [
          {
            foreignKeyName: "qr_codes_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: true;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      pdf_exports: {
        Row: PdfExport;
        Insert: InsertOf<
          PdfExport,
          | "id"
          | "generated_at"
          | "reference_id"
          | "file_path"
          | "generated_by"
        >;
        Update: Partial<PdfExport>;
        Relationships: [];
      };
      audit_log: {
        Row: AuditKaydi;
        /* Uygulama günlüğe DOĞRUDAN yazmıyor: veri değişiklikleri
           trigger'dan, PDF gibi eylemler audit_kaydet() üzerinden geliyor.
           Insert/Update tipleri bilerek never. */
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      job_costs: {
        Row: {
          job_id: string;
          segment_id: string;
          material_cost: number;
        };
        Relationships: [];
      };
      segment_invoice_totals: {
        Row: {
          segment_id: string;
          fatura_sayisi: number;
          brut_toplam: number;
          net_toplam: number;
          vergi_toplam: number;
        };
        Relationships: [];
      };
      /* Segmentin para durumu tek satırda. Üç ekran ve PDF aynı hesabı
         yapmasın diye görünüme alındı. */
      segment_balances: {
        Row: SegmentBakiyesi;
        Relationships: [];
      };
    };
    Functions: {
      /* Yumuşak silme: fiziksel DELETE yetkisi RLS'te yok. */
      kayit_sil: {
        Args: {
          p_tablo:
            | "customers"
            | "segments"
            | "jobs"
            | "job_products"
            | "invoices"
            | "products"
            | "payments";
          p_id: string;
        };
        Returns: undefined;
      };
      giris_kaydet: {
        Args: {
          p_eposta: string | null;
          p_country: string | null;
          p_outcome: "allowed" | "blocked_country" | "unknown_country";
          p_ip_prefix?: string | null;
          p_user_agent?: string | null;
        };
        Returns: undefined;
      };
      panel_arama: {
        Args: { p_terim: string; p_limit?: number };
        Returns: AramaSonucu[];
      };
      /* Yalnizca veri degisikligi OLMAYAN eylemler icin (PDF alma gibi);
         veri degisiklikleri trigger'dan geliyor. */
      audit_kaydet: {
        Args: {
          p_entity: AuditEntity;
          p_entity_id: string | null;
          p_label: string | null;
          p_details?: Record<string, unknown> | null;
        };
        Returns: undefined;
      };
      complete_job: {
        /* İşlem türü ZORUNLU: opsiyonel değil, çünkü müşteriye gösterilen
           belgenin metni buna bağlı. */
        /* Tutar parametresi 0015'te KALKTI: işin tamamlanmasıyla
           paranın bağı yok. İş tutarı iş sayfasından her zaman
           düzenlenebilen bir not. */
        Args: {
          p_job_id: string;
          p_service_types: ServiceType[];
          p_allow_negative?: boolean;
        };
        Returns: CompleteJobResult;
      };
      revert_job_completion: {
        Args: { p_job_id: string };
        Returns: { job_id: string; reverted_lines: number };
      };
      apply_stock_movement: {
        /* Tek miktar: ürünün birimi hangi kolona yazılacağını belirliyor,
           çağıran birim seçmiyor. Hareket tipi de parametre değil —
           miktarın işareti belirliyor (+ giriş, − çıkış). */
        Args: {
          p_product_id: string;
          p_miktar: number;
          /* Yalnızca girişte anlamlı; verilirse ürünün fiyatı güncellenir. */
          p_fiyat?: number | null;
          p_note?: string | null;
        };
        Returns: {
          product_id: string;
          birim: "adet" | "gram";
          miktar: number;
          fiyat: number;
        };
      };
      urun_ve_stok_ekle: {
        /* Ürün tanımı + ilk alım tek adımda: bir ürünün fiyatı ancak
           alındığı anda belli oluyor. */
        Args: {
          p_ad: string;
          p_birim: UnitType;
          p_miktar: number;
          p_fiyat: number;
          p_sku?: string | null;
          p_note?: string | null;
        };
        Returns: {
          product_id: string;
          birim: "adet" | "gram";
          miktar: number;
          fiyat: number;
        };
      };
      urun_stok_gecmisi: {
        Args: { p_product_id: string; p_limit?: number };
        Returns: StokGecmisiSatiri[];
      };
      segment_anlasilan_yaz: {
        /* Müşteriyle anlaşılan toplam tutar (faturasız segment için).
           null = tutarı temizle, fatura yolunu aç. */
        Args: { p_segment_id: string; p_tutar: number | null };
        Returns: undefined;
      };
      tahsilat_ekle: {
        /* Yeni vade. p_tarih paranın ele geçtiği gün: aylık gelir buna
           göre hesaplanıyor, bu yüzden varsayılan bugün ama
           değiştirilebilir. Gelecek tarih reddediliyor. */
        Args: {
          p_segment_id: string;
          p_tutar: number;
          p_tarih?: string;
          p_not?: string | null;
        };
        Returns: string;
      };
      tahsilat_guncelle: {
        Args: {
          p_id: string;
          p_tutar: number;
          p_tarih: string;
          p_not?: string | null;
        };
        Returns: undefined;
      };
      segment_tahsilatlari: {
        Args: { p_segment_id: string };
        Returns: SegmentTahsilati[];
      };
      add_job_product: {
        Args: {
          p_job_id: string;
          p_product_id: string;
          p_miktar: number;
        };
        Returns: string;
      };
      public_job_by_token: {
        Args: { p_token: string };
        Returns: PublicJobView | null;
      };
      dashboard_summary: {
        Args: { p_start: string; p_end: string };
        Returns: DashboardOzet;
      };
      dashboard_by_customer: {
        Args: { p_start: string; p_end: string };
        Returns: DashboardMusteri[];
      };
      stock_reconciliation: {
        Args: Record<string, never>;
        Returns: StokFarki[];
      };
      monthly_trend: {
        Args: { p_ay_sayisi?: number };
        Returns: AylikTrend[];
      };
      refresh_monthly_summary: {
        Args: { p_donem: string };
        Returns: void;
      };
    };
    Enums: {
      job_status: JobStatus;
      segment_status: SegmentStatus;
      unit_type: UnitType;
      movement_type: MovementType;
    };
    CompositeTypes: Record<never, never>;
  };
};
