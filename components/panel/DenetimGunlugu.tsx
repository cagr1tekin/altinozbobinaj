import type { AuditKaydi } from "@/lib/supabase/database.types";
import { ATOLYE_DILIMI, Liste } from "@/components/panel/ui";

/**
 * Hareket geçmişi — kim, ne zaman, neyi değiştirdi.
 *
 * Veritabanı kolon adları İngilizce; kullanıcıya gösterilen metin burada
 * Türkçeleştiriliyor. Çeviriyi SQL tarafında yapmamanın sebebi: günlük
 * ham veriyi saklamalı, sunum katmanı değişirse geçmiş kayıtlar da
 * yeniden yorumlanabilsin.
 */

const VARLIK: Record<AuditKaydi["entity"], string> = {
  customer: "Müşteri",
  segment: "Segment",
  job: "Motor",
  job_product: "Malzeme",
  product: "Ürün",
  stock_movement: "Stok hareketi",
  invoice: "Fatura",
  report: "Rapor",
};

const EYLEM: Record<AuditKaydi["action"], string> = {
  insert: "eklendi",
  update: "güncellendi",
  delete: "silindi",
  pdf: "PDF alındı",
};

/** Değişen alanların okunabilir adı. Bilinmeyen alan olduğu gibi yazılıyor. */
const ALAN: Record<string, string> = {
  name: "ad",
  title: "başlık",
  phone: "telefon",
  email: "e-posta",
  address: "adres",
  tax_number: "vergi no",
  notes: "not",
  note: "not",
  status: "durum",
  completed_at: "tamamlanma",
  service_type: "yapılan işlem",
  segment_date: "tarih",
  description: "açıklama",
  sku: "stok kodu",
  purchase_price: "alış fiyatı",
  unit_type_default: "birim",
  qty_pieces: "adet",
  qty_grams: "gram",
  qty_pieces_used: "kullanılan adet",
  qty_grams_used: "kullanılan gram",
  qty_pieces_delta: "adet değişimi",
  qty_grams_delta: "gram değişimi",
  invoice_no: "fatura no",
  gross_amount: "brüt tutar",
  net_amount: "net tutar",
  tax_amount: "KDV",
  issue_date: "fatura tarihi",
  file_path: "dosya",
  segment_id: "segment",
  customer_id: "müşteri",
  product_id: "ürün",
};

function degisenAlanlar(details: AuditKaydi["details"]): string | null {
  if (!details) return null;
  const anahtarlar = Object.keys(details);
  if (anahtarlar.length === 0) return null;
  /* Üç alandan fazlası satırı okunamaz hâle getiriyor; gerisi sayıyla
     özetleniyor. Tam ayrıntı veritabanında duruyor. */
  const gosterilecek = anahtarlar.slice(0, 3).map((k) => ALAN[k] ?? k);
  const kalan = anahtarlar.length - gosterilecek.length;
  return gosterilecek.join(", ") + (kalan > 0 ? ` +${kalan}` : "");
}

function zamanMetni(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ATOLYE_DILIMI,
  }).format(new Date(iso));
}

export default function DenetimGunlugu({
  kayitlar,
  eksik = false,
}: {
  kayitlar: AuditKaydi[];
  /** Tablo henüz kurulmamışsa kurulum uyarısı gösterilsin */
  eksik?: boolean;
}) {
  if (eksik) {
    return (
      <p className="rounded-lg border border-pnl-line bg-pnl-surface p-4 text-sm text-pnl-muted">
        Hareket geçmişi tablosu bulunamadı.{" "}
        <code className="text-pnl-text">supabase/kurulum-tumu.sql</code>{" "}
        dosyasını Supabase SQL Editor&apos;de çalıştırın.
      </p>
    );
  }

  if (kayitlar.length === 0) {
    return (
      <p className="rounded-lg border border-pnl-line bg-pnl-surface p-4 text-sm text-pnl-muted">
        Henüz kayıtlı hareket yok. Bir müşteri, motor veya stok hareketi
        ekledikçe burada listelenecek.
      </p>
    );
  }

  return (
    <>
      <Liste>
        {kayitlar.map((k) => {
          const alanlar =
            k.action === "update" ? degisenAlanlar(k.details) : null;
          return (
            <li key={k.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">{VARLIK[k.entity]}</span>{" "}
                    <span className="text-pnl-muted">{EYLEM[k.action]}</span>
                    {k.label && (
                      <>
                        {" — "}
                        <span className="font-medium">{k.label}</span>
                      </>
                    )}
                  </p>
                  {alanlar && (
                    <p className="mt-0.5 truncate text-xs text-pnl-muted">
                      Değişen: {alanlar}
                    </p>
                  )}
                  <p className="mt-0.5 truncate text-xs text-pnl-faint">
                    {k.actor_email ?? "sistem"}
                  </p>
                </div>
                <time
                  dateTime={k.occurred_at}
                  className="shrink-0 text-xs tabular-nums text-pnl-faint"
                >
                  {zamanMetni(k.occurred_at)}
                </time>
              </div>
            </li>
          );
        })}
      </Liste>
      <p className="mt-2 text-xs text-pnl-faint">
        En son {kayitlar.length} hareket gösteriliyor. Kayıtlar silinemez ve
        değiştirilemez.
      </p>
    </>
  );
}
