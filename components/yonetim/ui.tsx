import Link from "next/link";
import type { ReactNode } from "react";
import type { JobStatus, SegmentStatus } from "@/lib/supabase/database.types";

/** Panel yüzeyi: landing page'in ink/paper tokenlarını yeniden kullanır. */
export function Kart({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-ink-soft/60 p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function BolumBasligi({
  baslik,
  aciklama,
  aksiyon,
}: {
  baslik: string;
  aciklama?: string;
  aksiyon?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-paper sm:text-3xl">
          {baslik}
        </h1>
        {aciklama && (
          <p className="mt-1 text-sm text-paper-muted">{aciklama}</p>
        )}
      </div>
      {aksiyon}
    </div>
  );
}

const IS_DURUM_ETIKET: Record<JobStatus, string> = {
  pending: "Bekliyor",
  in_progress: "Devam ediyor",
  completed: "Tamamlandı",
};

/* Durum yalnızca renkle değil metinle de belirtiliyor: renk körlüğü ve
   siyah-beyaz çıktı için gerekli. */
const IS_DURUM_SINIF: Record<JobStatus, string> = {
  pending: "border-white/20 text-paper-muted",
  in_progress: "border-silver-main/50 text-silver-light",
  completed: "border-silver-light/60 bg-silver-light/10 text-silver-light",
};

export function IsDurumu({ durum }: { durum: JobStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${IS_DURUM_SINIF[durum]}`}
    >
      {IS_DURUM_ETIKET[durum]}
    </span>
  );
}

export function SegmentDurumu({ durum }: { durum: SegmentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        durum === "open"
          ? "border-silver-main/50 text-silver-light"
          : "border-white/20 text-paper-muted"
      }`}
    >
      {durum === "open" ? "Açık" : "Kapalı"}
    </span>
  );
}

export function BosDurum({
  baslik,
  aciklama,
  aksiyon,
}: {
  baslik: string;
  aciklama?: string;
  aksiyon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 p-10 text-center">
      <p className="font-medium text-paper">{baslik}</p>
      {aciklama && (
        <p className="mx-auto mt-2 max-w-md text-sm text-paper-muted">
          {aciklama}
        </p>
      )}
      {aksiyon && <div className="mt-5 flex justify-center">{aksiyon}</div>}
    </div>
  );
}

export function AnaButon({
  children,
  type = "submit",
  disabled,
  formAction,
  name,
  value,
}: {
  children: ReactNode;
  type?: "submit" | "button";
  disabled?: boolean;
  formAction?: (formData: FormData) => void | Promise<void>;
  name?: string;
  value?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      formAction={formAction}
      name={name}
      value={value}
      className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl bg-silver-cta px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-light disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function IkincilButon({
  children,
  type = "submit",
  disabled,
  name,
  value,
}: {
  children: ReactNode;
  type?: "submit" | "button";
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      name={name}
      value={value}
      className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-white/15 px-5 text-sm font-semibold text-paper transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function ButonLink({
  href,
  children,
  ikincil = false,
}: {
  href: string;
  children: ReactNode;
  ikincil?: boolean;
}) {
  const ortak =
    "inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  return (
    <Link
      href={href}
      className={
        ikincil
          ? `${ortak} border border-white/15 text-paper hover:bg-white/5 focus-visible:outline-silver-main`
          : `${ortak} bg-silver-cta text-ink hover:opacity-90 focus-visible:outline-silver-light`
      }
    >
      {children}
    </Link>
  );
}

/** Miktar gösterimi: 0 olan birim hiç yazılmıyor, iki birim bağımsız. */
export function Miktar({ adet, kg }: { adet: number; kg: number }) {
  const parcalar: string[] = [];
  if (adet !== 0) parcalar.push(`${adet} adet`);
  if (Number(kg) !== 0) parcalar.push(`${formatKg(kg)} kg`);
  return <span>{parcalar.length > 0 ? parcalar.join(" · ") : "—"}</span>;
}

export function formatKg(deger: number | string): string {
  const n = typeof deger === "string" ? Number(deger) : deger;
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(n);
}

export function formatPara(deger: number | string): string {
  const n = typeof deger === "string" ? Number(deger) : deger;
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(n);
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
