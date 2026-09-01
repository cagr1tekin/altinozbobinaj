import { createClient } from "@/lib/supabase/server";
import type { PdfIs, PdfMusteri, PdfSegment } from "./belgeler";

/**
 * PDF şablonları için veri toplama.
 *
 * Sorgular kullanıcının kendi yetkisiyle (RLS altında) çalışıyor; giriş
 * yapmamış biri route'a ulaşsa bile boş sonuç döner. Route'lar ayrıca
 * oturumu açıkça kontrol ediyor.
 */

type HamMalzeme = {
  qty_pieces_used: number;
  qty_grams_used: number;
  unit_cost_snapshot: number;
  products: { name: string; unit_type_default: "piece" | "gram" } | null;
};

/* Ürün tek birimle izleniyor: adet ürününde gram kolonu, gram ürününde
   adet kolonu hep 0. PDF'te tek "Miktar" sütunu yazılıyor. */
function malzemeleriDonustur(ham: HamMalzeme[] | null) {
  return (ham ?? []).map((m) => {
    const birim = m.products?.unit_type_default ?? "piece";
    return {
      ad: m.products?.name ?? "—",
      birim,
      miktar:
        birim === "piece" ? m.qty_pieces_used : Number(m.qty_grams_used),
      birimMaliyet: Number(m.unit_cost_snapshot),
    };
  });
}

/** Birden çok işin maliyetini tek sorguda çeker (N+1 önlemek için). */
async function maliyetHaritasi(
  supabase: Awaited<ReturnType<typeof createClient>>,
  isIdler: string[]
): Promise<Map<string, number>> {
  if (isIdler.length === 0) return new Map();
  const { data } = await supabase
    .from("job_costs")
    .select("job_id, material_cost")
    .in("job_id", isIdler);

  return new Map(
    (data ?? []).map((r) => [r.job_id, Number(r.material_cost)])
  );
}

export async function isVerisi(isId: string): Promise<{
  musteri: PdfMusteri;
  segment: { tarih: string };
  is: PdfIs;
} | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("jobs")
    .select(
      `id, title, description, status, completed_at, created_at,
       segments(segment_date, customers(id, name, phone, email, address, tax_number)),
       job_products(qty_pieces_used, qty_grams_used, unit_cost_snapshot, products(name, unit_type_default)),
       qr_codes(token)`
    )
    .eq("id", isId)
    .maybeSingle();

  if (!data) return null;

  const segment = data.segments as unknown as {
    segment_date: string;
    customers: PdfHamMusteri | null;
  } | null;
  const m = segment?.customers;
  if (!segment || !m) return null;

  const maliyetler = await maliyetHaritasi(supabase, [data.id]);
  const qr = data.qr_codes as unknown as { token: string } | null;

  return {
    musteri: musteriDonustur(m),
    segment: { tarih: segment.segment_date },
    is: {
      id: data.id,
      baslik: data.title,
      aciklama: data.description,
      durum: data.status,
      tamamlanmaTarihi: data.completed_at,
      olusturmaTarihi: data.created_at,
      maliyet: maliyetler.get(data.id) ?? 0,
      malzemeler: malzemeleriDonustur(
        data.job_products as unknown as HamMalzeme[]
      ),
      qrToken: qr?.token ?? null,
    },
  };
}

type PdfHamMusteri = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_number: string | null;
};

function musteriDonustur(m: PdfHamMusteri): PdfMusteri {
  return {
    id: m.id,
    ad: m.name,
    telefon: m.phone,
    eposta: m.email,
    adres: m.address,
    vergiNo: m.tax_number,
  };
}

export async function segmentVerisi(segmentId: string): Promise<{
  musteri: PdfMusteri;
  segment: PdfSegment;
} | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("segments")
    .select(
      `id, segment_date, note, status,
       customers(id, name, phone, email, address, tax_number),
       jobs(id, title, description, status, completed_at, created_at,
            job_products(qty_pieces_used, qty_grams_used, unit_cost_snapshot, products(name, unit_type_default)))`
    )
    .eq("id", segmentId)
    .maybeSingle();

  if (!data) return null;
  const m = data.customers as unknown as PdfHamMusteri | null;
  if (!m) return null;

  const isler = (data.jobs ?? []) as unknown as Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    completed_at: string | null;
    created_at: string;
    job_products: HamMalzeme[];
  }>;

  const maliyetler = await maliyetHaritasi(
    supabase,
    isler.map((i) => i.id)
  );

  return {
    musteri: musteriDonustur(m),
    segment: {
      id: data.id,
      tarih: data.segment_date,
      not: data.note,
      durum: data.status,
      isler: isler
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((i) => ({
          id: i.id,
          baslik: i.title,
          aciklama: i.description,
          durum: i.status,
          tamamlanmaTarihi: i.completed_at,
          olusturmaTarihi: i.created_at,
          maliyet: maliyetler.get(i.id) ?? 0,
          malzemeler: malzemeleriDonustur(i.job_products),
        })),
    },
  };
}

export async function musteriVerisi(musteriId: string): Promise<{
  musteri: PdfMusteri;
  segmentler: PdfSegment[];
} | null> {
  const supabase = await createClient();

  const [{ data: m }, { data: segmentler }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone, email, address, tax_number")
      .eq("id", musteriId)
      .maybeSingle(),
    supabase
      .from("segments")
      .select(
        `id, segment_date, note, status,
         jobs(id, title, description, status, completed_at, created_at,
              job_products(qty_pieces_used, qty_grams_used, unit_cost_snapshot, products(name, unit_type_default)))`
      )
      .eq("customer_id", musteriId)
      .order("segment_date", { ascending: false }),
  ]);

  if (!m) return null;

  const ham = (segmentler ?? []) as unknown as Array<{
    id: string;
    segment_date: string;
    note: string | null;
    status: string;
    jobs: Array<{
      id: string;
      title: string;
      description: string | null;
      status: string;
      completed_at: string | null;
      created_at: string;
      job_products: HamMalzeme[];
    }>;
  }>;

  const tumIsIdler = ham.flatMap((s) => (s.jobs ?? []).map((i) => i.id));
  const maliyetler = await maliyetHaritasi(supabase, tumIsIdler);

  return {
    musteri: musteriDonustur(m),
    segmentler: ham.map((s) => ({
      id: s.id,
      tarih: s.segment_date,
      not: s.note,
      durum: s.status,
      isler: (s.jobs ?? [])
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((i) => ({
          id: i.id,
          baslik: i.title,
          aciklama: i.description,
          durum: i.status,
          tamamlanmaTarihi: i.completed_at,
          olusturmaTarihi: i.created_at,
          maliyet: maliyetler.get(i.id) ?? 0,
          malzemeler: malzemeleriDonustur(i.job_products),
        })),
    })),
  };
}

export async function donemVerisi(baslangic: string, bitis: string) {
  const supabase = await createClient();

  const [{ data: ozet, error }, { data: musteriler }] = await Promise.all([
    supabase.rpc("dashboard_summary", { p_start: baslangic, p_end: bitis }),
    supabase.rpc("dashboard_by_customer", { p_start: baslangic, p_end: bitis }),
  ]);

  if (error || !ozet) return null;

  const o = ozet as unknown as Record<string, number>;

  return {
    ozet: {
      brutGelir: Number(o.brut_gelir ?? 0),
      netGelir: Number(o.net_gelir ?? 0),
      vergi: Number(o.vergi ?? 0),
      faturaSayisi: Number(o.fatura_sayisi ?? 0),
      maliyet: Number(o.malzeme_maliyeti ?? 0),
      karZarar: Number(o.kar_zarar ?? 0),
      tamamlananIs: Number(o.tamamlanan_is ?? 0),
    },
    musteriler: (
      (musteriler ?? []) as unknown as Array<Record<string, string | number>>
    ).map((m) => ({
      ad: String(m.customer_name),
      netGelir: Number(m.net_gelir),
      maliyet: Number(m.malzeme_maliyeti),
      karZarar: Number(m.kar_zarar),
      isSayisi: Number(m.tamamlanan_is),
    })),
  };
}
