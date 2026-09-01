import type { AylikTrend } from "@/lib/supabase/database.types";
import { formatPara } from "./ui";

/**
 * Aylık kâr/zarar grafiği — sıfır çizgisi etrafında diverging bar.
 *
 * Neden tek seri? Gelir, gider ve kâr üç ayrı seri olarak çizilince 12 ay ×
 * 3 bar = 36 bar oluyor ve telefonda okunmuyor. Atölyenin asıl sorusu
 * "bu ay kâr ettim mi, ne kadar" — bu sıfır etrafında bir soru, yani
 * diverging. Gelir ve gider rakamları zaten üstteki kartlarda ve tooltipte.
 *
 * Renkler: kâr #2563EB (mavi), zarar #B45309 (turuncu). Yeşil/kırmızı
 * bilinçli olarak KULLANILMADI — deutan renk körlüğünde ΔE 4.2 ile
 * ayırt edilemiyorlar (doğrulayıcı FAIL veriyor). Mavi/turuncu çifti
 * ΔE 31.3 ile geçiyor. Ayrıca renk tek gösterge değil: barın yönü
 * (yukarı/aşağı) ve sıfır çizgisi anlamı taşıyor.
 *
 * Kütüphane yok: 12 barlık bir grafik için bundle'a chart kütüphanesi
 * eklemek panelin açılış süresine değmez.
 */

const KAR_RENGI = "#2563EB";
const ZARAR_RENGI = "#B45309";

const AY_KISA = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

function ayEtiketi(donem: string): string {
  const d = new Date(donem);
  return AY_KISA[d.getUTCMonth()] ?? "";
}

function kisaTutar(n: number): string {
  const mutlak = Math.abs(n);
  if (mutlak >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (mutlak >= 1_000) return `${Math.round(n / 1000)}B`;
  return String(Math.round(n));
}

export default function KarZararGrafigi({ veri }: { veri: AylikTrend[] }) {
  if (veri.length === 0) {
    return (
      <p className="rounded-lg border border-pnl-line bg-pnl-surface p-4 text-sm text-pnl-muted">
        Grafik için henüz veri yok.
      </p>
    );
  }

  const degerler = veri.map((v) => Number(v.kar_zarar));
  const enBuyuk = Math.max(...degerler, 0);
  const enKucuk = Math.min(...degerler, 0);
  const aralik = Math.max(enBuyuk - enKucuk, 1);

  /* viewBox ile ölçeklenen SVG: telefonda da masaüstünde de aynı oran,
     sabit piksel hesabı yok. */
  const G = 320; // genişlik birimi
  const Y = 140; // yükseklik birimi
  const ustBosluk = 14;
  const altBosluk = 18;
  const cizimY = Y - ustBosluk - altBosluk;

  const sifirY = ustBosluk + (enBuyuk / aralik) * cizimY;
  const barGenislik = G / veri.length;
  /* Bitişik barlar arasında 2px yüzey boşluğu (mark spec) */
  const dolguGenislik = Math.max(barGenislik - 3, 4);

  const tumuSifir = degerler.every((d) => d === 0);

  return (
    <figure className="rounded-lg border border-pnl-line bg-pnl-surface p-4">
      <figcaption className="mb-3 text-sm text-pnl-muted">
        Son {veri.length} ayın kâr/zarar seyri
      </figcaption>

      {tumuSifir ? (
        <p className="py-6 text-center text-sm text-pnl-muted">
          Bu dönemde fatura veya tamamlanmış iş kaydı yok.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${G} ${Y}`}
          className="h-40 w-full"
          role="img"
          aria-label={`Aylık kâr zarar grafiği. ${veri
            .map((v) => `${ayEtiketi(v.donem)}: ${formatPara(v.kar_zarar)}`)
            .join(". ")}`}
        >
          {/* Sıfır çizgisi — barın yönünü okumak için referans */}
          <line
            x1={0}
            y1={sifirY}
            x2={G}
            y2={sifirY}
            stroke="#8A94A6"
            strokeWidth={1}
          />

          {veri.map((v, i) => {
            const deger = Number(v.kar_zarar);
            const yukseklik = (Math.abs(deger) / aralik) * cizimY;
            const x = i * barGenislik + (barGenislik - dolguGenislik) / 2;
            const y = deger >= 0 ? sifirY - yukseklik : sifirY;

            return (
              <g key={v.donem}>
                <rect
                  x={x}
                  y={y}
                  width={dolguGenislik}
                  height={Math.max(yukseklik, deger === 0 ? 0 : 1.5)}
                  rx={2}
                  fill={deger < 0 ? ZARAR_RENGI : KAR_RENGI}
                />
                {/* Ay etiketi — her ay değil, ikide bir (mobilde sığsın) */}
                {i % 2 === 0 && (
                  <text
                    x={x + dolguGenislik / 2}
                    y={Y - 5}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#64748B"
                  >
                    {ayEtiketi(v.donem)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Yalnızca en yüksek ve en düşük ay etiketleniyor; her bara
              rakam yazmak grafiği okunmaz yapıyor. */}
          {[
            { deger: enBuyuk, indeks: degerler.indexOf(enBuyuk) },
            { deger: enKucuk, indeks: degerler.indexOf(enKucuk) },
          ]
            .filter((u) => u.deger !== 0 && u.indeks >= 0)
            .map((u) => {
              const x =
                u.indeks * barGenislik + barGenislik / 2;
              const yuk = (Math.abs(u.deger) / aralik) * cizimY;
              const y = u.deger >= 0 ? sifirY - yuk - 3 : sifirY + yuk + 8;
              return (
                <text
                  key={`etiket-${u.indeks}`}
                  x={Math.min(Math.max(x, 14), G - 14)}
                  y={y}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={600}
                  fill="#0F172A"
                >
                  {kisaTutar(u.deger)}
                </text>
              );
            })}
        </svg>
      )}

      {/* Renk tek gösterge olmadığı için açıklama metinle de veriliyor */}
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <span className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-sm"
            style={{ background: KAR_RENGI }}
            aria-hidden="true"
          />
          <span className="text-pnl-muted">Kâr (çizgi üstü)</span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-sm"
            style={{ background: ZARAR_RENGI }}
            aria-hidden="true"
          />
          <span className="text-pnl-muted">Zarar (çizgi altı)</span>
        </span>
      </div>

      {/* Ekran okuyucu ve grafiğin okunamadığı durumlar için tablo */}
      <details className="mt-3">
        <summary className="min-h-[44px] cursor-pointer text-sm text-pnl-muted flex items-center">
          Rakamları tablo olarak gör
        </summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="text-pnl-muted">
            <tr>
              <th scope="col" className="py-1.5 font-medium">Ay</th>
              <th scope="col" className="py-1.5 text-right font-medium">Gelir</th>
              <th scope="col" className="py-1.5 text-right font-medium">Gider</th>
              <th scope="col" className="py-1.5 text-right font-medium">Kâr/Zarar</th>
            </tr>
          </thead>
          <tbody>
            {veri.map((v) => (
              <tr key={v.donem} className="border-t border-pnl-line">
                <td className="py-1.5">{ayEtiketi(v.donem)}</td>
                <td className="py-1.5 text-right text-pnl-muted">
                  {formatPara(v.net_gelir)}
                </td>
                <td className="py-1.5 text-right text-pnl-muted">
                  {formatPara(v.malzeme_maliyeti)}
                </td>
                <td className="py-1.5 text-right font-medium">
                  {formatPara(v.kar_zarar)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
