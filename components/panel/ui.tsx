import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import type { JobStatus, SegmentStatus } from "@/lib/supabase/database.types";

/**
 * Panel bileşenleri — design-system/PANEL.md
 *
 * Kurallar: gölge yok, tek köşe yarıçapı (8px), dokunma hedefleri 48px+,
 * renk tek başına bilgi taşımaz.
 */

/* ---------------------------------------------------------------------------
 * Sayfa iskeleti
 * ------------------------------------------------------------------------- */

/**
 * Üst çubuk. Alt sayfalarda geri oku zorunlu: PWA tam ekran modunda
 * tarayıcının geri tuşu yok.
 */
export function UstCubuk({
  baslik,
  geriHref,
  geriEtiket = "Geri",
  eylem,
}: {
  baslik: string;
  geriHref?: string;
  geriEtiket?: string;
  eylem?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-pnl-line bg-pnl-surface">
      <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3">
        {geriHref && (
          <Link
            href={geriHref}
            aria-label={geriEtiket}
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-pnl-muted transition-colors hover:bg-pnl-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-pnl-primary"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold md:text-2xl">
          {baslik}
        </h1>
        {eylem}
      </div>
    </header>
  );
}

/** İçerik alanı. Alt navigasyon barının içeriği örtmemesi için alt boşluk. */
export function Icerik({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-[calc(72px+env(safe-area-inset-bottom))] pt-4 md:pb-8">
      {children}
    </main>
  );
}

/** Bölüm başlığı — sayfa içi gruplama */
export function Bolum({
  baslik,
  aciklama,
  eylem,
  children,
}: {
  baslik?: string;
  aciklama?: string;
  eylem?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-6">
      {(baslik || eylem) && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            {baslik && <h2 className="text-base font-semibold">{baslik}</h2>}
            {aciklama && (
              <p className="mt-0.5 text-sm text-pnl-muted">{aciklama}</p>
            )}
          </div>
          {eylem}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Yüzeyler
 * ------------------------------------------------------------------------- */

export function Kart({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-pnl-line bg-pnl-surface p-4 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Liste — tam genişlik satırlar.
 *
 * Kart içinde kart yerleşimi mobilde görsel gürültü yarattığı için liste
 * tek bir çerçeve içinde, satırlar ayırıcıyla bölünüyor.
 *
 * `ekleme` verilirse listenin ilk satırı olarak çiziliyor: "yeni ekle"
 * formu ayrı bir bölüm olmak yerine listenin parçası oluyor.
 */
export function Liste({
  children,
  ekleme,
}: {
  children?: ReactNode;
  ekleme?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-pnl-line bg-pnl-surface">
      {ekleme && (
        <div className="border-b border-pnl-line last:border-b-0">{ekleme}</div>
      )}
      {children && <ul className="divide-y divide-pnl-line">{children}</ul>}
    </div>
  );
}

/** Tıklanabilir liste satırı. Tüm satır hedef; ayrı ok işareti yok. */
export function ListeSatiri({
  href,
  baslik,
  altBilgi,
  sag,
}: {
  href: string;
  baslik: ReactNode;
  altBilgi?: ReactNode;
  sag?: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-pnl-bg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pnl-primary"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{baslik}</span>
          {altBilgi && (
            <span className="mt-0.5 block truncate text-sm text-pnl-muted">
              {altBilgi}
            </span>
          )}
        </span>
        {sag && <span className="shrink-0">{sag}</span>}
      </Link>
    </li>
  );
}

/** Tıklanamayan satır (veri gösterimi) */
export function BilgiSatiri({
  etiket,
  deger,
}: {
  etiket: string;
  deger: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-pnl-line py-2.5 last:border-0">
      <span className="text-sm text-pnl-muted">{etiket}</span>
      <span className="text-right font-medium">{deger}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Özet kartı — dashboard rakamları
 * ------------------------------------------------------------------------- */

export function OzetKarti({
  etiket,
  deger,
  alt,
  vurgu,
}: {
  etiket: string;
  deger: string | number;
  alt?: string;
  /* Zarar durumunda renk + metin birlikte kullanılır, renk tek gösterge değil */
  vurgu?: "normal" | "uyari";
}) {
  return (
    <div className="rounded-lg border border-pnl-line bg-pnl-surface p-4">
      <p className="text-sm text-pnl-muted">{etiket}</p>
      <p
        className={`mt-1 text-3xl font-semibold ${
          vurgu === "uyari" ? "text-pnl-warn" : "text-pnl-text"
        }`}
      >
        {deger}
      </p>
      {alt && <p className="mt-1 text-sm text-pnl-faint">{alt}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Butonlar — üç tür, fazlası yok
 * ------------------------------------------------------------------------- */

const butonTemel =
  "inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-lg px-5 text-base font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const butonStilleri = {
  birincil: `${butonTemel} bg-pnl-primary text-white hover:bg-pnl-primary-dark focus-visible:outline-pnl-primary`,
  ikincil: `${butonTemel} border border-pnl-edge bg-pnl-surface text-pnl-text hover:bg-pnl-bg focus-visible:outline-pnl-primary`,
  tehlike: `${butonTemel} bg-pnl-danger text-white hover:opacity-90 focus-visible:outline-pnl-danger`,
} as const;

export function ButonLink({
  href,
  children,
  tur = "birincil",
  tamGenislik = false,
}: {
  href: string;
  children: ReactNode;
  tur?: keyof typeof butonStilleri;
  tamGenislik?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${butonStilleri[tur]} ${tamGenislik ? "w-full" : ""}`}
    >
      {children}
    </Link>
  );
}

/* ---------------------------------------------------------------------------
 * Durum rozetleri — renk + metin
 * ------------------------------------------------------------------------- */

const IS_DURUM: Record<JobStatus, { etiket: string; sinif: string }> = {
  pending: { etiket: "Bekliyor", sinif: "bg-pnl-chip-neutral text-pnl-muted" },
  in_progress: {
    etiket: "Devam ediyor",
    sinif: "bg-pnl-chip-info text-pnl-chip-info-text",
  },
  completed: {
    etiket: "Tamamlandı",
    sinif: "bg-pnl-chip-ok text-pnl-chip-ok-text",
  },
};

export function IsDurumu({ durum }: { durum: JobStatus }) {
  const d = IS_DURUM[durum];
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-[13px] font-medium ${d.sinif}`}
    >
      {d.etiket}
    </span>
  );
}

export function SegmentDurumu({ durum }: { durum: SegmentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-[13px] font-medium ${
        durum === "open"
          ? "bg-pnl-chip-info text-pnl-chip-info-text"
          : "bg-pnl-chip-neutral text-pnl-muted"
      }`}
    >
      {durum === "open" ? "Açık" : "Kapalı"}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Boş durum ve bildirimler
 * ------------------------------------------------------------------------- */

/** Boş ekran bırakma: ne olduğu, ne yapılacağı ve yapmayı sağlayan buton. */
export function BosDurum({
  baslik,
  aciklama,
  eylem,
}: {
  baslik: string;
  aciklama?: string;
  eylem?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-pnl-edge bg-pnl-surface px-4 py-10 text-center">
      <p className="font-semibold">{baslik}</p>
      {aciklama && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-pnl-muted">
          {aciklama}
        </p>
      )}
      {eylem && <div className="mt-5">{eylem}</div>}
    </div>
  );
}

export function Uyari({
  baslik,
  children,
  tur = "uyari",
}: {
  baslik?: string;
  children: ReactNode;
  tur?: "uyari" | "hata" | "bilgi";
}) {
  const stiller = {
    uyari: "border-pnl-warn/40 bg-pnl-chip-warn text-pnl-chip-warn-text",
    hata: "border-pnl-danger/40 bg-red-50 text-pnl-danger",
    bilgi: "border-pnl-primary/30 bg-pnl-chip-info text-pnl-chip-info-text",
  };
  return (
    <div
      role={tur === "hata" ? "alert" : undefined}
      className={`rounded-lg border p-4 text-sm ${stiller[tur]}`}
    >
      {baslik && <p className="font-semibold">{baslik}</p>}
      <div className={baslik ? "mt-1" : ""}>{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Biçimlendirme
 * ------------------------------------------------------------------------- */

export function formatPara(deger: number | string): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(deger));
}

export function formatSayi(deger: number | string): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(
    Number(deger)
  );
}

export function formatTarih(deger: string | null): string {
  if (!deger) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(deger));
}

export function formatTarihSaat(deger: string | null): string {
  if (!deger) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(deger));
}

/** Miktar gösterimi: 0 olan birim hiç yazılmaz. */
export function Miktar({ adet, kg }: { adet: number; kg: number }) {
  const parcalar: string[] = [];
  if (adet !== 0) parcalar.push(`${formatSayi(adet)} adet`);
  if (Number(kg) !== 0) parcalar.push(`${formatSayi(kg)} kg`);
  return <>{parcalar.length > 0 ? parcalar.join(" · ") : "—"}</>;
}
