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
export type UnitType = "piece" | "kg" | "both";
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
  qty_kg: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type JobProduct = {
  id: string;
  job_id: string;
  product_id: string;
  qty_pieces_used: number;
  qty_kg_used: number;
  unit_cost_snapshot: number;
  created_at: string;
};

export type StockMovement = {
  id: string;
  product_id: string;
  job_id: string | null;
  movement_type: MovementType;
  qty_pieces_delta: number;
  qty_kg_delta: number;
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

/** public_job_by_token() dönüş şekli — ticari bilgi içermez */
export type PublicJobView = {
  job_title: string;
  completed_at: string | null;
  materials: Array<{
    name: string;
    qty_pieces: number;
    qty_kg: number;
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
          | "qty_kg"
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
          | "qty_kg_used"
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
          | "qty_kg_delta"
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
    };
    Views: Record<never, never>;
    Functions: {
      complete_job: {
        Args: { p_job_id: string; p_allow_negative?: boolean };
        Returns: CompleteJobResult;
      };
      revert_job_completion: {
        Args: { p_job_id: string };
        Returns: { job_id: string; reverted_lines: number };
      };
      apply_stock_movement: {
        Args: {
          p_product_id: string;
          p_movement_type: MovementType;
          p_qty_pieces_delta?: number;
          p_qty_kg_delta?: number;
          p_note?: string | null;
        };
        Returns: { product_id: string; qty_pieces: number; qty_kg: number };
      };
      add_job_product: {
        Args: {
          p_job_id: string;
          p_product_id: string;
          p_qty_pieces?: number;
          p_qty_kg?: number;
        };
        Returns: string;
      };
      public_job_by_token: {
        Args: { p_token: string };
        Returns: PublicJobView | null;
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
