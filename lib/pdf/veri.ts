import { createClient } from "@/lib/supabase/server";
import type {
  PdfIs,
  PdfMusteri,
  PdfPara,
  PdfSegment,
  PdfVade,
} from "./belgeler";

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

type HamIs = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  agreed_amount: number | string | null;
  job_products: HamMalzeme[];
};

/* Segment ve müşteri belgeleri aynı dönüşümü yapıyordu; iki kopya
   birbirinden ayrı düşerse belgeler farklı veri gösterir. */
function islerDonustur(
  ham: HamIs[],
  maliyetler: Map<string, number>
): PdfIs[] {
  return [...ham]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((i) => ({
      id: i.id,
      baslik: i.title,
      aciklama: i.description,
      durum: i.status,
      tamamlanmaTarihi: i.completed_at,
      olusturmaTarihi: i.created_at,
      maliyet: maliyetler.get(i.id) ?? 0,
      isTutari: i.agreed_amount === null ? null : Number(i.agreed_amount),
      malzemeler: malzemeleriDonustur(i.job_products),
    }));
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

/**
 * Segmentlerin para durumunu tek sorguda çeker.
 *
 * `segment_balances` görünümü anlaşılan / tahsil edilen / kalan hesabını
 * zaten yapıyor; burada tekrar hesaplamak, panelin gösterdiği rakamla
 * belgenin yazdığı rakamın ayrı düşmesi demek olurdu.
 *
 * Vadeler ayrı bir sorgu: bakiye satır başına tek satır, vadeler ise
 * segment başına birden çok.
 */
async function paraHaritasi(
  supabase: Awaited<ReturnType<typeof createClient>>,
  segmentIdler: string[]
): Promise<Map<string, PdfPara>> {
  if (segmentIdler.length === 0) return new Map();

  const [{ data: bakiyeler }, { data: vadeler }] = await Promise.all([
    supabase
      .from("segment_balances")
      .select(
        "segment_id, fatura_sayisi, fatura_toplam, elle_girilen, anlasilan, tahsil_edilen"
      )
      .in("segment_id", segmentIdler),
    supabase
      .from("payments")
      .select("segment_id, amount, paid_on, note")
      .in("segment_id", segmentIdler)
      .is("deleted_at", null)
      /* Tarihe göre artan: belgede "1. vade, 2. vade" diye okunuyor. */
      .order("paid_on", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const vadeHarita = new Map<string, PdfVade[]>();
  for (const v of vadeler ?? []) {
    const liste = vadeHarita.get(v.segment_id) ?? [];
    liste.push({
      tarih: v.paid_on,
      tutar: Number(v.amount),
      not: v.note,
    });
    vadeHarita.set(v.segment_id, liste);
  }

  return new Map(
    (bakiyeler ?? []).map((r) => {
      const anlasilan =
        r.anlasilan === null || r.anlasilan === undefined
          ? null
          : Number(r.anlasilan);
      const tahsilEdilen = Number(r.tahsil_edilen ?? 0);
      return [
        r.segment_id,
        {
          faturaSayisi: Number(r.fatura_sayisi),
          faturaToplam: Number(r.fatura_toplam),
          elleGirilen:
            r.elle_girilen === null || r.elle_girilen === undefined
              ? null
              : Number(r.elle_girilen),
          anlasilan,
          tahsilEdilen,
          /* Anlaşılan bilinmiyorsa kalan da bilinmiyor — sıfır değil. */
          kalan: anlasilan === null ? null : anlasilan - tahsilEdilen,
          vadeler: vadeHarita.get(r.segment_id) ?? [],
        } satisfies PdfPara,
      ];
    })
  );
}

/** Bakiye satırı gelmemişse (yeni segment) boş bir para durumu. */
function paraKur(harita: Map<string, PdfPara>, segmentId: string): PdfPara {
  return (
    harita.get(segmentId) ?? {
      faturaSayisi: 0,
      faturaToplam: 0,
      elleGirilen: null,
      anlasilan: null,
      tahsilEdilen: 0,
      kalan: null,
      vadeler: [],
    }
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
      `id, title, description, status, completed_at, created_at, agreed_amount,
       segments(segment_date, customers(id, name, phone, email, address, tax_number)),
       job_products(qty_pieces_used, qty_grams_used, unit_cost_snapshot, products(name, unit_type_default)),
       qr_codes(token)`
    )
    .eq("id", isId)
    /* Silinmiş kayıt müşteriye giden belgede görünmemeli; gömülü
       job_products filtresi de şart, yoksa silinen malzeme PDF'te kalır. */
    .is("deleted_at", null)
    .is("job_products.deleted_at", null)
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
      /* İş tutarı NOT niteliğinde: hiçbir toplama girmiyor, belgede de
         "bilgi" olarak yazılıyor. Para segment düzeyinde. */
      isTutari:
        data.agreed_amount === null ? null : Number(data.agreed_amount),
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
      `id, segment_date, note, status, agreed_amount,
       customers(id, name, phone, email, address, tax_number),
       jobs(id, title, description, status, completed_at, created_at, agreed_amount,
            job_products(qty_pieces_used, qty_grams_used, unit_cost_snapshot, products(name, unit_type_default)))`
    )
    .eq("id", segmentId)
    .is("deleted_at", null)
    .is("jobs.deleted_at", null)
    .is("jobs.job_products.deleted_at", null)
    .maybeSingle();

  if (!data) return null;
  const m = data.customers as unknown as PdfHamMusteri | null;
  if (!m) return null;

  const isler = (data.jobs ?? []) as unknown as HamIs[];

  const [maliyetler, paralar] = await Promise.all([
    maliyetHaritasi(supabase, isler.map((i) => i.id)),
    paraHaritasi(supabase, [data.id]),
  ]);

  return {
    musteri: musteriDonustur(m),
    segment: {
      id: data.id,
      tarih: data.segment_date,
      not: data.note,
      durum: data.status,
      para: paraKur(paralar, data.id),
      isler: islerDonustur(isler, maliyetler),
    },
  };
}

/**
 * Müşteri belgesi verisi.
 *
 * `aralik` verilirse yalnızca o tarih aralığındaki segmentler geliyor.
 * Filtre SEGMENT tarihine göre: müşteri belgesi geliş geçmişini
 * anlatıyor, işlerin tamamlanma tarihini değil — bir segmentin işleri
 * aralığın dışında bitmiş olsa da o geliş aralığa aittir.
 */
export async function musteriVerisi(
  musteriId: string,
  aralik?: { baslangic: string; bitis: string }
): Promise<{
  musteri: PdfMusteri;
  segmentler: PdfSegment[];
} | null> {
  const supabase = await createClient();

  const [{ data: m }, { data: segmentler }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone, email, address, tax_number")
      .eq("id", musteriId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("segments")
      .select(
        `id, segment_date, note, status, agreed_amount,
         jobs(id, title, description, status, completed_at, created_at, agreed_amount,
              job_products(qty_pieces_used, qty_grams_used, unit_cost_snapshot, products(name, unit_type_default)))`
      )
      .eq("customer_id", musteriId)
      .is("deleted_at", null)
      .is("jobs.deleted_at", null)
      .is("jobs.job_products.deleted_at", null)
      /* Aralık opsiyonel; verilmezse tüm geçmiş geliyor. Koşullu zincir
         yerine iki ayrı sorgu yazmak aynı select'i çoğaltırdı. */
      .gte("segment_date", aralik?.baslangic ?? "0001-01-01")
      .lte("segment_date", aralik?.bitis ?? "9999-12-31")
      .order("segment_date", { ascending: false }),
  ]);

  if (!m) return null;

  const ham = (segmentler ?? []) as unknown as Array<{
    id: string;
    segment_date: string;
    note: string | null;
    status: string;
    agreed_amount: number | string | null;
    jobs: HamIs[];
  }>;

  const [maliyetler, paralar] = await Promise.all([
    maliyetHaritasi(
      supabase,
      ham.flatMap((s) => (s.jobs ?? []).map((i) => i.id))
    ),
    paraHaritasi(supabase, ham.map((s) => s.id)),
  ]);

  return {
    musteri: musteriDonustur(m),
    segmentler: ham.map((s) => ({
      id: s.id,
      tarih: s.segment_date,
      not: s.note,
      durum: s.status,
      para: paraKur(paralar, s.id),
      isler: islerDonustur(s.jobs ?? [], maliyetler),
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
      /* NAKİT: dönemde eline geçen para (ödeme tarihine göre). */
      tahsilat: Number(o.tahsilat ?? 0),
      tahsilatSayisi: Number(o.tahsilat_sayisi ?? 0),
      /* TAHAKKUK: dönemde anlaşılan toplam (segment tarihine göre).
         İkisi ayrı yazılıyor, yoksa tahsil edilmemiş iş kayıp görünür. */
      anlasilan: Number(o.anlasilan_tutar ?? 0),
      faturaliAnlasilan: Number(o.faturali_anlasilan ?? 0),
      eldenAnlasilan: Number(o.elden_anlasilan ?? 0),
      faturaSayisi: Number(o.fatura_sayisi ?? 0),
      eldenSayisi: Number(o.elden_sayisi ?? 0),
      vergi: Number(o.vergi ?? 0),
      kalanAlacak: Number(o.kalan_alacak ?? 0),
      maliyet: Number(o.malzeme_maliyeti ?? 0),
      karZarar: Number(o.kar_zarar ?? 0),
      tamamlananIs: Number(o.tamamlanan_is ?? 0),
    },
    musteriler: (
      (musteriler ?? []) as unknown as Array<Record<string, string | number>>
    ).map((m) => ({
      ad: String(m.customer_name),
      tahsilat: Number(m.tahsilat),
      maliyet: Number(m.malzeme_maliyeti),
      karZarar: Number(m.kar_zarar),
      kalanAlacak: Number(m.kalan_alacak),
      isSayisi: Number(m.tamamlanan_is),
    })),
  };
}
