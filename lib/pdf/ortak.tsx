import path from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";

/**
 * PDF şablonlarının ortak parçaları.
 *
 * Font neden gömülüyor? @react-pdf/renderer'ın gömülü Helvetica'sı
 * WinAnsi ile sınırlı; ğ, ş, ı, İ ve ₺ glifleri yok ve bu karakterler
 * PDF'te sessizce kayboluyor. Roboto TTF projede tutuluyor (public/fonts)
 * — CDN'den indirmek sunucusuz ortamda soğuk başlatmada ağ hatasına açık.
 */
const fontDizini = path.join(process.cwd(), "public", "fonts");

Font.register({
  family: "Roboto",
  fonts: [
    { src: path.join(fontDizini, "Roboto-Regular.ttf"), fontWeight: "normal" },
    { src: path.join(fontDizini, "Roboto-Bold.ttf"), fontWeight: "bold" },
  ],
});

/* Türkçe kelimelerde tirelemeyi kapat: react-pdf'in varsayılan
   tireleme algoritması Türkçe hecelemeyi bilmiyor ve kelimeleri
   yanlış yerden bölüyor. */
Font.registerHyphenationCallback((kelime) => [kelime]);

export const ISLETME = {
  ad: "Altınöz Bobinaj",
  sahip: "Selda Altınöz",
  adres: "Paşa Alanı Mah. 19 Ağustos Cad., Karesi / Balıkesir",
  telefon: "0542 591 83 72 · 0506 121 05 73",
  eposta: "altinozbobinajsan@gmail.com",
  vergiDairesi: "Karesi Vergi Dairesi",
} as const;

export const stiller = StyleSheet.create({
  sayfa: {
    fontFamily: "Roboto",
    fontSize: 9,
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    color: "#18181b",
  },
  ustBaslik: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: "#18181b",
    paddingBottom: 10,
    marginBottom: 16,
  },
  isletmeAdi: { fontSize: 16, fontWeight: "bold" },
  isletmeSatir: { fontSize: 8, color: "#52525b", marginTop: 2 },
  belgeTuru: { fontSize: 11, fontWeight: "bold", textAlign: "right" },
  belgeTarih: { fontSize: 8, color: "#52525b", textAlign: "right", marginTop: 2 },

  bolumBaslik: {
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 6,
  },

  kutu: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 3,
    padding: 8,
    marginBottom: 10,
  },
  satir: { flexDirection: "row", marginBottom: 2 },
  etiket: { width: 90, color: "#52525b" },
  deger: { flex: 1 },

  tabloBaslik: {
    flexDirection: "row",
    backgroundColor: "#f4f4f5",
    borderBottomWidth: 1,
    borderBottomColor: "#d4d4d8",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontWeight: "bold",
    fontSize: 8,
  },
  tabloSatir: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 8,
  },
  sag: { textAlign: "right" },

  toplamKutu: {
    marginTop: 10,
    alignSelf: "flex-end",
    width: 220,
    borderTopWidth: 1,
    borderTopColor: "#18181b",
    paddingTop: 6,
  },
  toplamSatir: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  toplamVurgu: { fontWeight: "bold", fontSize: 11 },

  altBilgi: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: "#d4d4d8",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#71717a",
  },
  bosMesaj: { color: "#71717a", fontStyle: "normal", paddingVertical: 8 },
});

export function formatPara(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return (
    new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n) + " ₺"
  );
}

export function formatSayi(v: number | string | null | undefined): string {
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 3,
  }).format(Number(v ?? 0));
}

/* PDF'ler sunucuda üretiliyor ve sunucu UTC (Vercel). timeZone verilmezse
   belgedeki bütün tarih/saatler 3 saat geride basılıyor. */
const ATOLYE_DILIMI = "Europe/Istanbul";

export function formatTarih(v: string | null | undefined): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ATOLYE_DILIMI,
  }).format(new Date(v));
}

export function formatTarihSaat(v: string | null | undefined): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ATOLYE_DILIMI,
  }).format(new Date(v));
}

export const IS_DURUM_ETIKET: Record<string, string> = {
  pending: "Bekliyor",
  in_progress: "Devam ediyor",
  completed: "Tamamlandı",
};

/** Her PDF'in üst başlığı: işletme künyesi + belge türü */
export function UstBaslik({
  belgeTuru,
  altBilgi,
}: {
  belgeTuru: string;
  altBilgi?: string;
}) {
  return (
    <View style={stiller.ustBaslik}>
      <View>
        <Text style={stiller.isletmeAdi}>{ISLETME.ad}</Text>
        <Text style={stiller.isletmeSatir}>{ISLETME.adres}</Text>
        <Text style={stiller.isletmeSatir}>
          {ISLETME.telefon} · {ISLETME.eposta}
        </Text>
      </View>
      <View>
        <Text style={stiller.belgeTuru}>{belgeTuru}</Text>
        <Text style={stiller.belgeTarih}>
          Belge tarihi: {formatTarih(new Date().toISOString())}
        </Text>
        {altBilgi && <Text style={stiller.belgeTarih}>{altBilgi}</Text>}
      </View>
    </View>
  );
}

/** Sayfa altı: bu belgenin resmi fatura olmadığı burada belirtiliyor */
export function AltBilgi() {
  return (
    <View style={stiller.altBilgi} fixed>
      <Text>
        {ISLETME.ad} · Bu belge bilgilendirme amaçlıdır, resmî fatura yerine
        geçmez.
      </Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Sayfa ${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

export function Belge({
  belgeTuru,
  altBilgi,
  children,
}: {
  belgeTuru: string;
  altBilgi?: string;
  children: ReactNode;
}) {
  return (
    <Document
      title={`${ISLETME.ad} — ${belgeTuru}`}
      author={ISLETME.ad}
      language="tr"
    >
      <Page size="A4" style={stiller.sayfa}>
        <UstBaslik belgeTuru={belgeTuru} altBilgi={altBilgi} />
        {children}
        <AltBilgi />
      </Page>
    </Document>
  );
}

export function BilgiSatiri({
  etiket,
  deger,
}: {
  etiket: string;
  deger: string;
}) {
  return (
    <View style={stiller.satir}>
      <Text style={stiller.etiket}>{etiket}</Text>
      <Text style={stiller.deger}>{deger}</Text>
    </View>
  );
}
