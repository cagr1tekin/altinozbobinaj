/**
 * Sunucuda render edilen davranış testleri.
 *
 * Çalıştırma: npx tsx scripts/bilesen-testi.tsx
 *
 * Neden ayrı bir betik? Buradaki kusurlar tarayıcıda gözle görünmüyor:
 * bağlantı doğru çalışıyor gibi durup arka planda yanlış iş yapıyor ya da
 * saat sessizce kayıyor. E2E testleri oturum gerektirdiği için her ortamda
 * koşmuyor; bu dosya hiçbir şeye bağlı olmadan koşuyor.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { ButonLink, formatTarih, formatTarihSaat } from "../components/panel/ui";

let gecen = 0;
let kalan = 0;

const bekle = (ad: string, kosul: boolean, detay?: unknown) => {
  if (kosul) {
    gecen++;
    console.log("  GECTI  " + ad);
  } else {
    kalan++;
    console.log(
      "  KALDI  " + ad,
      detay !== undefined ? JSON.stringify(detay) : ""
    );
  }
};

console.log("--- ButonLink: API rotalarina prefetch yok ---");
{
  /* next/link viewport'a giren baglantiyi onceden getiriyor ve hedef bir API
     rotasi oldugunda rota GERCEKTEN kosuyor. Raporlar sayfasindaki PDF
     butonu bu yuzden her sayfa acilisinda sahte bir "PDF alindi" denetim
     kaydi yaziyordu. Olculdu: 1 acilis + 3 yenileme = 4 calistirma.
     Duzeltme sonrasi 0. */
  const api = renderToStaticMarkup(
    <ButonLink href="/api/pdf/donem?bas=2026-01-01&bit=2026-12-31">
      Indir
    </ButonLink>
  );
  bekle("API baglantisi target=_blank ile duz <a>", api.includes('target="_blank"'), api.slice(0, 80));
  bekle("API baglantisinda rel guvenligi var", api.includes('rel="noopener noreferrer"'));
  bekle("API baglantisi href'i koruyor", api.includes('href="/api/pdf/donem?bas=2026-01-01&amp;bit=2026-12-31"'));
}
{
  const sayfa = renderToStaticMarkup(
    <ButonLink href="/yonetim/musteriler">Musteriler</ButonLink>
  );
  /* Normal sayfa baglantilari next/link kalmali: istemci tarafi gezinme
     panelde hissedilir sekilde hizli. */
  bekle("sayfa baglantisi yeni sekmede acilmiyor", !sayfa.includes('target="_blank"'), sayfa.slice(0, 80));
  bekle("sayfa baglantisi href'i koruyor", sayfa.includes('href="/yonetim/musteriler"'));
}

console.log("--- Tarih/saat: atolye saat diliminde ---");
{
  /* Sunucu UTC (Vercel), atolye Turkiye saatinde. timeZone verilmedigi
     surece butun saatler 3 saat geride gorunuyordu. Test sunucu dilimini
     UTC'ye zorlayarak gercek ortami taklit ediyor. */
  const oncekiTZ = process.env.TZ;
  process.env.TZ = "UTC";

  const iso = "2026-09-02T14:13:00Z"; // Turkiye'de 17:13
  const saatli = formatTarihSaat(iso);
  bekle("saat Turkiye saatine cevriliyor (17:13)", saatli.includes("17:13"), saatli);
  bekle("UTC saati sizmiyor (14:13 olmamali)", !saatli.includes("14:13"), saatli);

  /* Gun sinirinda kayma: UTC'de 1 Eylul 22:00, Turkiye'de 2 Eylul 01:00.
     Dilim yoksa tarih bir gun geride gorunur. */
  const sinir = formatTarih("2026-09-01T22:00:00Z");
  bekle("gun siniri dogru tarafta (02.09.2026)", sinir === "02.09.2026", sinir);

  bekle("bos deger tire donuyor", formatTarih(null) === "—" && formatTarihSaat(null) === "—");

  if (oncekiTZ === undefined) delete process.env.TZ;
  else process.env.TZ = oncekiTZ;
}

console.log("");
console.log(`SONUC: ${gecen} gecti, ${kalan} kaldi`);
process.exit(kalan === 0 ? 0 : 1);
