import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { AramaSonucu } from "@/lib/supabase/database.types";
import { IsDurumu, Liste, formatTarih } from "@/components/panel/ui";

/**
 * Arama sonuçları.
 *
 * Her satır AYNI biçimde: üstte kırılım (müşteri › segment), altta bulunan
 * kaydın adı. Kırılımın üstte olmasının sebebi arama bağlamı: "Motor Sarımı"
 * diye bir kayıt tek başına hangi müşterinin hangi ziyaretine ait olduğunu
 * söylemiyor, o bilgi olmadan sonuç işe yaramıyor. Bu yüzden panelin
 * genelindeki `ListeSatiri` (ad üstte, bağlam altta) yerine bilinçli olarak
 * ters sıra kullanılıyor; ölçüler ve dokunma hedefi aynı kalıyor.
 */

/** "Müşteri" / "Motor" — kullanıcı ne bulduğunu bir bakışta anlamalı. */
const TUR_ETIKET: Record<AramaSonucu["tur"], string> = {
  musteri: "Müşteri",
  is: "Motor",
};

function hedefYol(s: AramaSonucu): string {
  return s.tur === "musteri"
    ? `/yonetim/musteriler/${s.musteri_id}`
    : `/yonetim/isler/${s.is_id}`;
}

/** Kırılım parçaları: müşteri › segment. Bulunan kaydın kendisi hariç. */
function kirilim(s: AramaSonucu): string[] {
  const parcalar = [TUR_ETIKET[s.tur]];
  if (s.tur === "is") {
    parcalar.push(s.musteri_adi);
    if (s.segment_tarihi) parcalar.push(formatTarih(s.segment_tarihi));
  }
  return parcalar;
}

/** Satırın vurgulu satırı: bulunan kaydın adı. */
function ad(s: AramaSonucu): string {
  return s.tur === "musteri" ? s.musteri_adi : (s.is_basligi ?? "—");
}

export default function AramaSonuclari({
  terim,
  sonuclar,
}: {
  terim: string;
  sonuclar: AramaSonucu[];
}) {
  if (sonuclar.length === 0) {
    return (
      <p className="rounded-lg border border-pnl-line bg-pnl-surface p-4 text-sm text-pnl-muted">
        <span className="font-medium text-pnl-text">
          &ldquo;{terim}&rdquo;
        </span>{" "}
        için sonuç bulunamadı. Müşteri adı veya motor adının bir bölümünü
        yazmayı deneyin.
      </p>
    );
  }

  return (
    <Liste>
      {sonuclar.map((s) => (
        <li key={`${s.tur}-${s.kayit_id}`}>
          <Link
            href={hedefYol(s)}
            className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-pnl-bg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pnl-primary"
          >
            <span className="min-w-0 flex-1">
              {/* Kırılım: Motor › Müşteri › 12.08.2026 */}
              <span className="flex flex-wrap items-center gap-1 text-xs text-pnl-muted">
                {kirilim(s).map((p, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && (
                      <ChevronRight
                        className="h-3 w-3 shrink-0 text-pnl-faint"
                        aria-hidden="true"
                      />
                    )}
                    {p}
                  </span>
                ))}
              </span>
              <span className="mt-0.5 block truncate font-semibold">
                {ad(s)}
              </span>
            </span>
            {s.is_durumu && (
              <span className="shrink-0">
                <IsDurumu durum={s.is_durumu} />
              </span>
            )}
          </Link>
        </li>
      ))}
    </Liste>
  );
}
