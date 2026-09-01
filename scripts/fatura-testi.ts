/**
 * Fatura ayrıştırıcı testleri — gerçek e-Fatura PDF'leriyle.
 * Çalıştırma: npx tsx scripts/fatura-testi.ts <pdf...>
 */
import { readFileSync, existsSync } from "node:fs";
import {
  alanlariDogrula,
  faturaOku,
  tarihCevir,
  tutarCevir,
} from "../lib/fatura/ayristir";

let gecen = 0;
let kalan = 0;
const bekle = (ad: string, kosul: boolean, detay?: unknown) => {
  if (kosul) { gecen++; console.log("  GECTI  " + ad); }
  else { kalan++; console.log("  KALDI  " + ad, detay !== undefined ? JSON.stringify(detay) : ""); }
};

console.log("--- tutarCevir (Turkce bicim) ---");
bekle("78.605,00 -> 78605", tutarCevir("78.605,00") === 78605, tutarCevir("78.605,00"));
bekle("1.234.567,89", tutarCevir("1.234.567,89") === 1234567.89, tutarCevir("1.234.567,89"));
bekle("205,00 -> 205", tutarCevir("205,00") === 205);
bekle("0,00 -> 0", tutarCevir("0,00") === 0);
bekle("gecersiz -> null", tutarCevir("abc") === null);

console.log("--- tarihCevir (GGAAYYYY) ---");
bekle("27082026 -> 2026-08-27", tarihCevir("27082026") === "2026-08-27", tarihCevir("27082026"));
bekle("10082026 -> 2026-08-10", tarihCevir("10082026") === "2026-08-10");
bekle("01012026 -> 2026-01-01", tarihCevir("01012026") === "2026-01-01");
bekle("32012026 reddedilir", tarihCevir("32012026") === null);
bekle("29022025 reddedilir (artik yil degil)", tarihCevir("29022025") === null);
bekle("00082026 reddedilir", tarihCevir("00082026") === null);
bekle("10132026 reddedilir (13. ay)", tarihCevir("10132026") === null);

console.log("--- alanlariDogrula ---");
const temel = { faturaNo: "X", ettn: null, tarih: "2026-08-27", aliciUnvan: null };
bekle("tutarli fatura gecer",
  alanlariDogrula({ ...temel, netTutar: 100, vergiTutar: 20, brutTutar: 120 }) === null);
bekle("brut != net+kdv reddedilir",
  alanlariDogrula({ ...temel, netTutar: 100, vergiTutar: 20, brutTutar: 999 }) !== null);
bekle("net > brut reddedilir",
  alanlariDogrula({ ...temel, netTutar: 200, vergiTutar: 0, brutTutar: 100 }) !== null);
bekle("okunamayan tutar reddedilir",
  alanlariDogrula({ ...temel, netTutar: null, vergiTutar: null, brutTutar: null }) !== null);
bekle("tarihsiz reddedilir",
  alanlariDogrula({ ...temel, tarih: null, netTutar: 100, vergiTutar: 20, brutTutar: 120 }) !== null);
bekle("1 kurus tolerans kabul",
  alanlariDogrula({ ...temel, netTutar: 100, vergiTutar: 20, brutTutar: 120.009 }) === null);

async function gercekFaturalar() {
  const beklenen: Record<string, { no: string; tarih: string; net: number; kdv: number; brut: number }> = {
    "SLD2026000000090.pdf": { no: "SLD2026000000090", tarih: "2026-08-10", net: 78605, kdv: 15721, brut: 94326 },
    "SLD2026000000104.pdf": { no: "SLD2026000000104", tarih: "2026-08-27", net: 5500, kdv: 1100, brut: 6600 },
  };

  for (const [dosya, b] of Object.entries(beklenen)) {
    if (!existsSync(dosya)) { console.log(`  ATLANDI ${dosya} bulunamadi`); continue; }
    console.log(`--- ${dosya} ---`);
    const sonuc = await faturaOku(new Uint8Array(readFileSync(dosya)));
    if (sonuc.durum !== "ok") { bekle("ayristirildi", false, sonuc.mesaj); continue; }
    const a = sonuc.alanlar;
    bekle("fatura no", a.faturaNo === b.no, a.faturaNo);
    bekle("tarih", a.tarih === b.tarih, a.tarih);
    bekle("net tutar", a.netTutar === b.net, a.netTutar);
    bekle("kdv tutar", a.vergiTutar === b.kdv, a.vergiTutar);
    bekle("brut tutar", a.brutTutar === b.brut, a.brutTutar);
    bekle("ettn (32 hex)", !!a.ettn && /^[0-9a-f]{32}$/.test(a.ettn), a.ettn);
    bekle("alici unvani okundu", !!a.aliciUnvan && a.aliciUnvan.length > 3, a.aliciUnvan);
    bekle("net+kdv=brut", Math.abs((a.netTutar! + a.vergiTutar!) - a.brutTutar!) < 0.01);
  }

  console.log("--- bozuk girdi ---");
  const bos = await faturaOku(new Uint8Array([1, 2, 3, 4]));
  bekle("PDF olmayan dosya reddedilir", bos.durum === "hata", bos.durum === "hata" ? bos.mesaj.slice(0, 40) : "");

  console.log();
  console.log(`SONUC: ${gecen} gecti, ${kalan} kaldi`);
  process.exit(kalan === 0 ? 0 : 1);
}

gercekFaturalar();
