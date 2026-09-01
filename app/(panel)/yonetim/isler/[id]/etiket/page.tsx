import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "QR Etiketi | Altınöz Bobinaj",
  robots: { index: false, follow: false },
};

/**
 * Yazdırılabilir QR etiketi.
 *
 * QR sunucuda SVG olarak üretilip doğrudan gömülüyor: ayrı bir istek
 * yapılmadığı için yazdırma diyaloğu açıldığında görsel kesin hazır olur
 * (img ile yüklenirse boş sayfa basılma riski var).
 *
 * Sayfa A4'e iki etiket sığacak şekilde tasarlandı; yazdırmada panel
 * çerçevesi ve butonlar gizleniyor.
 */
export default async function EtiketSayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: is } = await supabase
    .from("jobs")
    .select(
      "id, title, status, completed_at, segments(customers(name)), qr_codes(token)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!is) notFound();

  const qr = is.qr_codes as unknown as { token: string } | null;
  const segment = is.segments as unknown as {
    customers: { name: string } | null;
  } | null;
  const musteriAdi = segment?.customers?.name ?? "";

  if (!qr?.token) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-xl font-bold text-pnl-text">
          Bu iş için QR kodu yok
        </h1>
        <p className="mt-2 text-sm text-pnl-muted">
          QR kodu, iş tamamlandığında otomatik olarak üretilir. Önce işi
          tamamlayın.
        </p>
        <p className="mt-6">
          <Link
            href={`/yonetim/isler/${id}`}
            className="text-pnl-primary-dark underline-offset-4 hover:underline"
          >
            İş detayına dön
          </Link>
        </p>
      </div>
    );
  }

  const url = `${SITE_URL}/j/${qr.token}`;
  const qrSvg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    width: 360,
    color: { dark: "#000000", light: "#ffffff" },
  });

  const tarih = is.completed_at
    ? new Intl.DateTimeFormat("tr-TR").format(new Date(is.completed_at))
    : "";

  return (
    <>
      {/* Yazdırma stilleri: panel kabuğu ve butonlar basılmasın,
          etiket beyaz zeminde siyah metin olsun. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body { background: #fff !important; }
              body * { visibility: hidden !important; }
              #etiket-alani, #etiket-alani * { visibility: visible !important; }
              #etiket-alani {
                position: absolute; left: 0; top: 0; width: 100%;
                padding: 12mm;
              }
              .yazdirma-gizle { display: none !important; }
              @page { size: A4; margin: 10mm; }
            }
          `,
        }}
      />

      <div className="yazdirma-gizle mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-pnl-text">
            QR Etiketi
          </h1>
          <p className="mt-1 text-sm text-pnl-muted">
            Yazdırıp işin veya ürünün üzerine yapıştırın. Müşteri okuttuğunda
            yalnızca kullanılan malzemeleri görür; fiyat bilgisi görünmez.
          </p>
        </div>
        <Link
          href={`/yonetim/isler/${id}`}
          className="inline-flex min-h-[44px] items-center rounded-xl border border-pnl-edge px-5 text-sm font-semibold text-pnl-text hover:bg-pnl-bg"
        >
          İş detayına dön
        </Link>
      </div>

      {/* Etiket — beyaz zemin, yazdırmaya hazır */}
      <div
        id="etiket-alani"
        className="rounded-xl bg-white p-8 text-black"
        style={{ maxWidth: 520 }}
      >
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <div
            style={{ width: 150, flexShrink: 0 }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
            aria-hidden="true"
          />

          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>
              Altınöz Bobinaj
            </p>
            <p style={{ fontSize: 11, marginTop: 2, color: "#333" }}>
              1976&apos;dan beri · Karesi / Balıkesir
            </p>

            <p style={{ fontSize: 13, fontWeight: 600, marginTop: 12 }}>
              {is.title}
            </p>
            {musteriAdi && (
              <p style={{ fontSize: 11, marginTop: 2, color: "#333" }}>
                {musteriAdi}
              </p>
            )}
            {tarih && (
              <p style={{ fontSize: 11, marginTop: 2, color: "#333" }}>
                Tamamlanma: {tarih}
              </p>
            )}

            <p style={{ fontSize: 10, marginTop: 12, color: "#444" }}>
              Bu işte kullanılan malzemeleri görmek için kodu telefonunuzun
              kamerasıyla okutun.
            </p>
            <p style={{ fontSize: 9, marginTop: 6, color: "#666", wordBreak: "break-all" }}>
              {url}
            </p>
          </div>
        </div>
      </div>

      <p className="yazdirma-gizle mt-4 text-sm text-pnl-muted">
        Yazdırmak için <kbd className="rounded border border-pnl-edge px-1.5 py-0.5 text-xs">Ctrl</kbd>{" "}
        + <kbd className="rounded border border-pnl-edge px-1.5 py-0.5 text-xs">P</kbd>{" "}
        tuşlarına basın. Yazıcı seçiminde &quot;PDF olarak kaydet&quot;
        seçeneğiyle dosyaya da alabilirsiniz.
      </p>
    </>
  );
}
