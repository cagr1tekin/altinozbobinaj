import { FileText } from "lucide-react";
import { butonStilleri } from "./ui";

/**
 * PDF bağlantıları.
 *
 * İki seçenek: iç kullanım (maliyet dahil) ve müşteri kopyası (alış fiyatı
 * ve maliyet gizli). Ayrı butonlar, çünkü hangisinin verileceği bilinçli
 * bir karar olmalı.
 */
export function PdfBaglantilari({
  temelUrl,
  etiket,
}: {
  temelUrl: string;
  etiket: string;
}) {
  const ayirici = temelUrl.includes("?") ? "&" : "?";

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <a
        href={temelUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={butonStilleri.ikincil}
      >
        <FileText className="h-5 w-5" aria-hidden="true" />
        {etiket}
      </a>
      <a
        href={`${temelUrl}${ayirici}maliyet=0`}
        target="_blank"
        rel="noopener noreferrer"
        className={butonStilleri.ikincil}
      >
        <FileText className="h-5 w-5" aria-hidden="true" />
        Müşteri kopyası
      </a>
    </div>
  );
}
