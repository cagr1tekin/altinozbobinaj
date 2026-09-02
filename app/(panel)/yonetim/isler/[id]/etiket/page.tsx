import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/supabase/env";
import { etiketQrSvg } from "@/lib/qr";
import { Bolum, Icerik, UstCubuk } from "@/components/panel/ui";

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
      <>
        <UstCubuk
          baslik="QR Etiketi"
          geriHref={`/yonetim/isler/${id}`}
          geriEtiket="İş detayı"
        />
        <Icerik>
          <div className="rounded-lg border border-pnl-line bg-pnl-surface p-4">
            <p className="font-semibold">Bu iş için QR kodu yok</p>
            <p className="mt-1 text-sm text-pnl-muted">
              QR kodu, iş tamamlandığında otomatik olarak üretilir. Önce işi
              tamamlayın.
            </p>
          </div>
        </Icerik>
      </>
    );
  }

  const url = `${SITE_URL}/j/${qr.token}`;
  /* Ölçü SVG'ye öznitelik olarak BASILMIYOR; aşağıdaki CSS belirliyor.
     Öznitelik olsaydı CSS'ten önce geldiği için kod kabına sığmayıp
     metnin üstüne binerdi — bkz. lib/qr.ts. */
  const qrSvg = await etiketQrSvg(url);

  const tarih = is.completed_at
    ? new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul" }).format(
        new Date(is.completed_at)
      )
    : "";

  return (
    <>
      {/* Yazdırma stilleri: panel kabuğu ve butonlar basılmasın,
          etiket beyaz zeminde siyah metin olsun. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* SVG'nin kabına sığması. qrcode'un ürettiği svg'de width/height
               özniteliği yok (üretimde width verilmiyor), ölçü buradan
               geliyor. display:block satır-içi boşluğu kaldırıyor. */
            #etiket-qr svg {
              display: block;
              width: 100%;
              height: auto;
            }

            @media print {
              body { background: #fff !important; }
              body * { visibility: hidden !important; }
              #etiket-alani, #etiket-alani * { visibility: visible !important; }
              #etiket-alani {
                position: absolute; left: 0; top: 0;
                /* Baskıda ölçü mm cinsinden sabit: px kullanıldığında çıktı
                   yazıcının DPI'ına göre değişiyor ve QR taranamayacak kadar
                   küçülebiliyor. */
                width: 120mm;
                margin: 0; padding: 0; border: 0;
                border-radius: 0; box-shadow: none;
              }
              #etiket-qr { width: 34mm !important; }
              .yazdirma-gizle { display: none !important; }
              @page { size: A4; margin: 12mm; }
            }
          `,
        }}
      />

      {/* Panelin standart kabuğu: üst çubuk + Icerik.
          Sayfa daha önce kendi başlığını yazıp içeriği doğrudan
          döndürüyordu; Icerik olmadığı için içerik ekranın sol kenarına
          yapışıyor ve alttaki çıkış satırıyla hizasız kalıyordu.
          Yazdırmada ikisi de gizleniyor (.yazdirma-gizle / visibility). */}
      <div className="yazdirma-gizle">
        <UstCubuk
          baslik="QR Etiketi"
          geriHref={`/yonetim/isler/${id}`}
          geriEtiket="İş detayı"
        />
      </div>

      <Icerik>
        <Bolum
          baslik="Etiket"
          aciklama="Yazdırıp işin veya ürünün üzerine yapıştırın. Müşteri okuttuğunda yalnızca kullanılan malzemeleri görür; fiyat ve miktar görünmez."
        >
      {/* Etiket — beyaz zemin, yazdırmaya hazır */}
      <div
        id="etiket-alani"
        className="rounded-lg border border-pnl-line bg-white p-6 text-black"
        style={{ maxWidth: 480 }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div
            id="etiket-qr"
            style={{ width: 132, flexShrink: 0 }}
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

            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                marginTop: 10,
                /* Uzun motor adı kutuyu genişletip QR'ı ezmesin */
                overflowWrap: "anywhere",
              }}
            >
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

          <p className="yazdirma-gizle mt-3 text-sm text-pnl-muted">
            Yazdırmak için{" "}
            <kbd className="rounded border border-pnl-edge px-1.5 py-0.5 text-xs">
              Ctrl
            </kbd>{" "}
            +{" "}
            <kbd className="rounded border border-pnl-edge px-1.5 py-0.5 text-xs">
              P
            </kbd>{" "}
            tuşlarına basın. Yazıcı seçiminde &quot;PDF olarak kaydet&quot;
            seçeneğiyle dosyaya da alabilirsiniz.
          </p>
        </Bolum>
      </Icerik>
    </>
  );
}
