import { FileText } from "lucide-react";

/**
 * PDF indirme bağlantıları.
 *
 * Sunucu bileşeni: PDF üretimi route handler'da yapılıyor, burada
 * yalnızca link var. target="_blank" ile yeni sekmede önizleniyor
 * (Content-Disposition: inline).
 */
export function PdfBaglantilari({
  temelUrl,
  etiket,
}: {
  temelUrl: string;
  etiket: string;
}) {
  const ortak =
    "inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-medium text-paper transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main";

  return (
    <div className="flex flex-wrap gap-2">
      <a href={temelUrl} target="_blank" rel="noopener noreferrer" className={ortak}>
        <FileText className="h-4 w-4" aria-hidden="true" />
        {etiket}
      </a>
      {/* Musteriye verilecek kopya: alis fiyati ve maliyet gizli */}
      <a
        href={`${temelUrl}${temelUrl.includes("?") ? "&" : "?"}maliyet=0`}
        target="_blank"
        rel="noopener noreferrer"
        className={ortak}
      >
        <FileText className="h-4 w-4" aria-hidden="true" />
        Müşteri kopyası
      </a>
    </div>
  );
}
