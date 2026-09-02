/**
 * Sunucuda render edilen davranış testleri.
 *
 * Çalıştırma: npm run test:bilesen
 *
 * Neden ayrı bir betik? Buradaki kusurlar tarayıcıda gözle görünmüyor ya da
 * yalnızca yazdırma önizlemesinde ortaya çıkıyor: bağlantı doğru çalışıyor
 * gibi durup arka planda yanlış iş yapıyor, saat sessizce kayıyor, QR kodu
 * metnin üstüne biniyor. E2E testleri oturum gerektirdiği için her ortamda
 * koşmuyor; bu dosya hiçbir şeye bağlı olmadan koşuyor.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { ButonLink, formatTarih, formatTarihSaat } from "../components/panel/ui";
import { dosyaQrSvg, etiketQrSvg } from "../lib/qr";
import { islemIfadesi, islemleriSirala } from "../lib/bicim";

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

function butonLinkTestleri() {
  console.log("--- ButonLink: API rotalarina prefetch yok ---");

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
  bekle(
    "API baglantisi target=_blank ile duz <a>",
    api.includes('target="_blank"'),
    api.slice(0, 80)
  );
  bekle("API baglantisinda rel guvenligi var", api.includes('rel="noopener noreferrer"'));
  bekle(
    "API baglantisi href'i koruyor",
    api.includes('href="/api/pdf/donem?bas=2026-01-01&amp;bit=2026-12-31"')
  );

  /* Normal sayfa baglantilari next/link kalmali: istemci tarafi gezinme
     panelde hissedilir sekilde hizli. */
  const sayfa = renderToStaticMarkup(
    <ButonLink href="/yonetim/musteriler">Musteriler</ButonLink>
  );
  bekle(
    "sayfa baglantisi yeni sekmede acilmiyor",
    !sayfa.includes('target="_blank"'),
    sayfa.slice(0, 80)
  );
  bekle("sayfa baglantisi href'i koruyor", sayfa.includes('href="/yonetim/musteriler"'));
}

function tarihTestleri() {
  console.log("--- Tarih/saat: atolye saat diliminde ---");

  /* Sunucu UTC (Vercel), atolye Turkiye saatinde. timeZone verilmedigi
     surece butun saatler 3 saat geride gorunuyordu. Test sunucu dilimini
     UTC'ye zorlayarak gercek ortami taklit ediyor. */
  const oncekiTZ = process.env.TZ;
  process.env.TZ = "UTC";

  const saatli = formatTarihSaat("2026-09-02T14:13:00Z"); // Turkiye'de 17:13
  bekle("saat Turkiye saatine cevriliyor (17:13)", saatli.includes("17:13"), saatli);
  bekle("UTC saati sizmiyor (14:13 olmamali)", !saatli.includes("14:13"), saatli);

  /* Gun sinirinda kayma: UTC'de 1 Eylul 22:00, Turkiye'de 2 Eylul 01:00.
     Dilim yoksa tarih bir gun geride gorunur — aksam yapilan isler yanlis
     gune dusuyordu. */
  const sinir = formatTarih("2026-09-01T22:00:00Z");
  bekle("gun siniri dogru tarafta (02.09.2026)", sinir === "02.09.2026", sinir);

  bekle(
    "bos deger tire donuyor",
    formatTarih(null) === "—" && formatTarihSaat(null) === "—"
  );

  if (oncekiTZ === undefined) delete process.env.TZ;
  else process.env.TZ = oncekiTZ;
}

async function qrTestleri() {
  console.log("--- QR: sayfaya gomulen kod kabina sigmali ---");
  const url = "https://www.altinozbobinaj.com/j/6d6ca3fc09c32a8b1ba475aa11bb22cc";

  /* Etiket sayfasindaki QR, yanindaki metnin ustune biniyordu. Sebep:
     qrcode'a width verildiginde bunu SVG'ye OZNITELIK olarak basiyor
     (360x360) ve oznitelik CSS'ten once geldigi icin 150px'lik kaba
     sigmiyordu — olculdu, 210px tasma. Olcu artik CSS'ten geliyor. */
  const etiket = await etiketQrSvg(url);
  const acilis = etiket.slice(0, etiket.indexOf(">") + 1);

  bekle("etiket QR'inda width ozniteligi YOK", !/<svg[^>]*\swidth=/.test(etiket), acilis);
  bekle("etiket QR'inda height ozniteligi YOK", !/<svg[^>]*\sheight=/.test(etiket), acilis);
  /* viewBox olmadan CSS ile olceklenemez; kod bozulur. */
  bekle("etiket QR'inda viewBox VAR", /<svg[^>]*viewBox="/.test(etiket), acilis);

  /* Tek basina servis edilen dosyayi saran bir CSS yok; olcu icinde olmali. */
  const dosya = await dosyaQrSvg(url);
  bekle("dosya QR'inda width ozniteligi VAR", /<svg[^>]*\swidth="512"/.test(dosya));

  /* Sessiz bant: margin 0 olsaydi bazi okuyucular etiket kenarindaki
     baskiyi desenin parcasi sanip okumayi reddediyor. Bant modul
     cinsinden viewBox'a yansidigi icin iki uretimde de ayni olmali. */
  const bant = (svg: string) => svg.match(/viewBox="0 0 (\d+) \d+"/)?.[1];
  bekle(
    "sessiz bant her iki uretimde ayni",
    Boolean(bant(etiket)) && bant(etiket) === bant(dosya),
    { etiket: bant(etiket), dosya: bant(dosya) }
  );
}

function islemTestleri() {
  console.log("--- Islem ifadesi: tekil/cogul ve sira ---");

  bekle(
    "tek islem: 'motor sarimi islemi'",
    islemIfadesi(["winding"]) === "motor sarımı işlemi",
    islemIfadesi(["winding"])
  );
  bekle(
    "tek islem: 'revizyon islemi'",
    islemIfadesi(["revision"]) === "revizyon işlemi",
    islemIfadesi(["revision"])
  );

  /* Turkce'de cokluk eki de degisiyor: "islemi" -> "islemleri".
     Cagri yerlerine birakilsa biri unutur. */
  bekle(
    "iki islem: 'motor sarimi ve revizyon islemLERI'",
    islemIfadesi(["winding", "revision"]) ===
      "motor sarımı ve revizyon işlemleri",
    islemIfadesi(["winding", "revision"])
  );

  /* Sira SABIT olmali: ters verilse bile ayni metin cikmali, yoksa ayni
     is icin belge bir seferinde "revizyon ve motor sarimi" yazar. */
  bekle(
    "ters sirada verilse de ayni metin",
    islemIfadesi(["revision", "winding"]) ===
      islemIfadesi(["winding", "revision"]),
    { ters: islemIfadesi(["revision", "winding"]) }
  );

  bekle("bos dizi null donuyor", islemIfadesi([]) === null, islemIfadesi([]));

  /* Tekrar gelirse "motor sarimi ve motor sarimi" yazardi. */
  bekle(
    "tekrar eleniyor",
    islemIfadesi(["winding", "winding"]) === "motor sarımı işlemi",
    islemIfadesi(["winding", "winding"])
  );

  bekle(
    "siralama tanim sirasini veriyor",
    JSON.stringify(islemleriSirala(["revision", "winding"])) ===
      JSON.stringify(["winding", "revision"]),
    islemleriSirala(["revision", "winding"])
  );
}

async function main() {
  butonLinkTestleri();
  islemTestleri();
  tarihTestleri();
  await qrTestleri();

  console.log("");
  console.log(`SONUC: ${gecen} gecti, ${kalan} kaldi`);
  process.exit(kalan === 0 ? 0 : 1);
}

main();
