import { ImageResponse } from "next/og";

export const alt =
  "Altınöz Bobinaj — Balıkesir'de 1976'dan bu yana elektrik motoru sarımı ve bobinaj";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* Referans fotoğrafı OG görseli olarak kullanılıyordu ama 832x1111 dikey
   olduğu için 1200x630 beyanıyla uyuşmuyor ve WhatsApp/LinkedIn önizlemede
   bozuk kırpılıyordu. Burada doğru oranda, markalı bir PNG üretiliyor. */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#09090b",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Üst şerit */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 26,
            letterSpacing: 4,
            color: "#94A3B8",
          }}
        >
          {/* Satori, text-transform: uppercase'te Türkçe kuralını (i → İ)
              uygulamıyor; metin doğrudan büyük harfle yazılıyor. */}
          BALIKESİR · KARESİ · 1976&apos;DAN BERİ
        </div>

        {/* Ana blok */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              fontSize: 104,
              fontWeight: 700,
              lineHeight: 1.05,
              color: "#fafafa",
            }}
          >
            Altınöz Bobinaj
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 40,
              lineHeight: 1.3,
              color: "#CBD5E1",
              maxWidth: 900,
            }}
          >
            Elektrik motoru sarımı, su pompası revizyonu ve fren bobini sarımı
          </div>
        </div>

        {/* Alt şerit */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", fontSize: 32, color: "#94A3B8" }}>
            altinozbobinaj.com
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 32,
              fontWeight: 600,
              color: "#09090b",
              background: "linear-gradient(135deg, #F1F5F9 0%, #CBD5E1 100%)",
              borderRadius: 16,
              padding: "16px 28px",
            }}
          >
            0542 591 83 72
          </div>
        </div>

        {/* Sağ üst dekoratif gradient şerit */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 8,
            height: "100%",
            background:
              "linear-gradient(180deg, #E2E8F0 0%, #94A3B8 50%, #475569 100%)",
          }}
        />
      </div>
    ),
    size
  );
}
