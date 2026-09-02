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
export type MovementType =
  | "purchase_in"
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
};

export type Segment = {
  id: string;
  customer_id: string;
  segment_date: string;
  note: string | null;
  status: SegmentStatus;
  created_at: string;
  updated_at: string;
};

export type Job = {
  id: string;
  segment_id: string;
  title: string;
  description: string | null;
  status: JobStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
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
};

export type JobProduct = {
  id: string;
  job_id: string;
  product_id: string;
  qty_pieces_used: number;
  qty_grams_used: number;
  unit_cost_snapshot: number;
  created_at: string;
};

export type StockMovement = {
  id: string;
  product_id: string;
  job_id: string | null;
  movement_type: MovementType;
  qty_pieces_delta: number;
  qty_grams_delta: number;
  note: string | null;
  created_at: string;
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

/** complete_job() dönüş şekli */
export type CompleteJobResult = {
  job_id: string;
  qr_token: string;
  material_lines: number;
};

/** dashboard_summary() dönüş şekli */
export type DashboardOzet = {
  baslangic: string;
  bitis: string;
  brut_gelir: number;
  net_gelir: number;
  vergi: number;
  fatura_sayisi: number;
  malzeme_maliyeti: number;
  kar_zarar: number;
  tamamlanan_is: number;
  acik_is: number;
};

/** dashboard_by_customer() satır şekli */
export type DashboardMusteri = {
  customer_id: string;
  customer_name: string;
  net_gelir: number;
  malzeme_maliyeti: number;
  kar_zarar: number;
  tamamlanan_is: number;
};

/** monthly_trend() satır şekli — raporlar grafiği */
export type AylikTrend = {
  donem: string;
  net_gelir: number;
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
  materials: Array<{
    name: string;
    /* Müşteri sayfası hangi birimi yazacağını bilsin diye ürünün birimi
       de dönüyor. */
    unit: UnitType;
    qty_pieces: number;
    qty_grams: number;
  }>;
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
          Zamanlar | "phone" | "email" | "address" | "tax_number" | "notes"
        >;
        Update: Partial<Customer>;
        Relationships: [];
      };
      segments: {
        Row: Segment;
        Insert: InsertOf<
          Segment,
          Zamanlar | "segment_date" | "note" | "status"
        >;
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
        Insert: InsertOf<
          Job,
          Zamanlar | "description" | "status" | "completed_at"
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
          | "notes"
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
          | "unit_cost_snapshot"
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
          | "created_at"
          | "job_id"
          | "qty_pieces_delta"
          | "qty_grams_delta"
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
          | "parsed_at"
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
    };
    Functions: {
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
        Args: { p_job_id: string; p_allow_negative?: boolean };
        Returns: CompleteJobResult;
      };
      revert_job_completion: {
        Args: { p_job_id: string };
        Returns: { job_id: string; reverted_lines: number };
      };
      apply_stock_movement: {
        /* Tek miktar: ürünün birimi hangi kolona yazılacağını belirliyor,
           çağıran birim seçmiyor. */
        Args: {
          p_product_id: string;
          p_movement_type: MovementType;
          p_miktar: number;
          p_note?: string | null;
        };
        Returns: { product_id: string; birim: "adet" | "gram"; miktar: number };
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
