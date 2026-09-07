/**
 * Zod şemalarının davranış testi.
 * Çalıştırma:  npx tsx scripts/sema-testi.ts
 */
import {
  isMalzemeSchema,
  isTamamlaSchema,
  musteriSchema,
  segmentTutarSchema,
  stokHareketSchema,
  urunSchema,
  urunStokEkleSchema,
} from "../lib/validation/schemas";

let gecen = 0;
let kalan = 0;

function bekle(ad: string, kosul: boolean, detay?: unknown) {
  if (kosul) {
    gecen++;
    console.log("  GECTI  " + ad);
  } else {
    kalan++;
    console.log("  KALDI  " + ad, detay !== undefined ? JSON.stringify(detay) : "");
  }
}

const fd = (o: Record<string, string>) => o;

console.log("--- musteriSchema ---");
{
  const r = musteriSchema.safeParse(fd({ name: "  Test A.Ş.  " }));
  bekle("bosluklar kirpiliyor", r.success && r.data.name === "Test A.Ş.", r.success ? r.data.name : r.error.issues[0]);
}
{
  const r = musteriSchema.safeParse(fd({ name: "" }));
  bekle("bos ad reddediliyor", !r.success);
}
{
  const r = musteriSchema.safeParse(fd({ name: "X", phone: "" }));
  bekle("bos telefon null oluyor", r.success && r.data.phone === null, r.success ? r.data.phone : null);
}
{
  const r = musteriSchema.safeParse(fd({ name: "X", email: "gecersiz" }));
  bekle("gecersiz e-posta reddediliyor", !r.success);
}
{
  const r = musteriSchema.safeParse(fd({ name: "X", email: "a@b.com" }));
  bekle("gecerli e-posta kabul ediliyor", r.success && r.data.email === "a@b.com");
}

console.log("--- urunStokEkleSchema (Turkce ondalik) ---");
{
  // Turkce klavyede ondalik ayirici virgul; kullanici "12,5" yazar
  const r = urunStokEkleSchema.safeParse(fd({ name: "Tel", miktar: "1000", purchase_price: "12,5", unit_type_default: "gram" }));
  bekle("virgullu ondalik kabul ediliyor (12,5 -> 12.5)", r.success && r.data.purchase_price === 12.5, r.success ? r.data.purchase_price : r.error.issues[0]?.message);
}
{
  const r = urunStokEkleSchema.safeParse(fd({ name: "Tel", miktar: "1000", purchase_price: "-5", unit_type_default: "gram" }));
  bekle("negatif fiyat reddediliyor", !r.success);
}
{
  const r = urunStokEkleSchema.safeParse(fd({ name: "Tel", miktar: "1000", purchase_price: "abc", unit_type_default: "gram" }));
  bekle("sayi olmayan fiyat reddediliyor", !r.success, r.success ? r.data : r.error.issues[0]?.message);
}
{
  /* Miktarsiz urun tanimi, fiyati olmayan bir urun birakirdi. */
  const r = urunStokEkleSchema.safeParse(fd({ name: "Tel", miktar: "0", purchase_price: "10", unit_type_default: "gram" }));
  bekle("miktar 0 ise urun eklenemiyor", !r.success);
}

console.log("--- urunSchema (fiyat artik yok) ---");
{
  /* Fiyat urun formundan kalkti: fiyatin degistigi an bir alim anidir.
     Gonderilse bile sessizce yok sayilmali, kayda gecmemeli. */
  const r = urunSchema.safeParse(fd({ name: "Tel", unit_type_default: "gram", purchase_price: "999" }));
  bekle("fiyat urun semasina girmiyor", r.success && !("purchase_price" in r.data), r.success ? r.data : r.error.issues[0]?.message);
}
{
  /* 'kg' ve 'both' 0008 ile kaldirildi; eski degerlerin sessizce kabul
     edilmesi, birimi bozuk bir urun olusturur. */
  const eski = urunSchema.safeParse(fd({ name: "Tel", unit_type_default: "kg" }));
  bekle("eski 'kg' birimi reddediliyor", !eski.success);
  const her = urunSchema.safeParse(fd({ name: "Tel", unit_type_default: "both" }));
  bekle("eski 'both' birimi reddediliyor", !her.success);
}

console.log("--- isMalzemeSchema ---");
/* Gercek gen_random_uuid() ciktilari. Uydurma "1111-..." dizileri RFC 4122
   versiyon/varyant bitlerini saglamadigi icin zod tarafindan reddediliyor;
   sema dogru, test verisi gercekci olmali. */
const uuid1 = "5f7cf10e-6c49-48e9-a144-4ecbb1106ddc";
const uuid2 = "6dbb15c7-afd3-4608-b32c-d118e9c44784";
{
  const r = isMalzemeSchema.safeParse(fd({ job_id: uuid1, product_id: uuid2, miktar: "0" }));
  bekle("miktar 0 ise reddediliyor", !r.success);
}
{
  const r = isMalzemeSchema.safeParse(fd({ job_id: uuid1, product_id: uuid2, miktar: "2" }));
  bekle("miktar girilebiliyor", r.success && r.data.miktar === 2);
}
{
  const r = isMalzemeSchema.safeParse(fd({ job_id: uuid1, product_id: uuid2, miktar: "250" }));
  bekle("gram miktari girilebiliyor", r.success && r.data.miktar === 250);
}
{
  /* Gram ve adet tam sayi: ondalik giris hem sema hem veritabani
     tarafinda reddedilmeli. Ondalik girisin kendisi bir hata kaynagiydi. */
  const r = isMalzemeSchema.safeParse(fd({ job_id: uuid1, product_id: uuid2, miktar: "1,5" }));
  bekle("kesirli miktar reddediliyor", !r.success);
}
{
  const r = isMalzemeSchema.safeParse(fd({ job_id: uuid1, product_id: uuid2, miktar: "-4" }));
  bekle("negatif miktar reddediliyor", !r.success);
}

console.log("--- stokHareketSchema (isaret + fiyat) ---");
{
  /* Hareket tipi artik parametre degil: isaret belirliyor. */
  const r = stokHareketSchema.safeParse(fd({ product_id: uuid1, miktar: "-3" }));
  bekle("eksi miktar cikis olarak kabul ediliyor", r.success && r.data.miktar === -3, r.success ? r.data : r.error.issues[0]?.message);
}
{
  const r = stokHareketSchema.safeParse(fd({ product_id: uuid1, miktar: "0" }));
  bekle("miktar 0 ise reddediliyor", !r.success);
}
{
  const r = stokHareketSchema.safeParse(fd({ product_id: uuid1, miktar: "4500", purchase_price: "480" }));
  bekle("giriste fiyat kabul ediliyor", r.success && r.data.purchase_price === 480, r.success ? r.data : r.error.issues[0]?.message);
}
{
  /* Cikis bir alim degil; "kaca cikti" sorusu yok. */
  const r = stokHareketSchema.safeParse(fd({ product_id: uuid1, miktar: "-5", purchase_price: "480" }));
  bekle("cikista fiyat reddediliyor", !r.success);
}
{
  /* Bos fiyat "girilmedi" demek, "0 TL" degil: 0 gonderilse urunun
     fiyati sifirlanirdi. */
  const r = stokHareketSchema.safeParse(fd({ product_id: uuid1, miktar: "10" }));
  bekle("bos fiyat null oluyor (0 degil)", r.success && r.data.purchase_price === null, r.success ? r.data : r.error.issues[0]?.message);
}
{
  /* Tekerlek hatasinin (4 -> 3,999) sema tarafindaki karsiligi: ondalik
     bir miktar artik hicbir yoldan gecemiyor. */
  const r = stokHareketSchema.safeParse(fd({ product_id: uuid1, miktar: "3.999" }));
  bekle("ondalik stok miktari reddediliyor", !r.success);
}

console.log("--- isTamamlaSchema (alinan tutar) ---");
{
  const r = isTamamlaSchema.safeParse({ job_id: uuid1, service_types: ["winding"], charged_amount: "3500" });
  bekle("tutar girilebiliyor", r.success && r.data.charged_amount === 3500, r.success ? r.data : r.error.issues[0]?.message);
}
{
  /* Her ise para girilmiyor; bos gecilebilmeli. */
  const r = isTamamlaSchema.safeParse({ job_id: uuid1, service_types: ["winding"] });
  bekle("tutar bos birakilabiliyor", r.success && r.data.charged_amount === null, r.success ? r.data : r.error.issues[0]?.message);
}
{
  const r = isTamamlaSchema.safeParse({ job_id: uuid1, service_types: ["winding"], charged_amount: "-1" });
  bekle("negatif tutar reddediliyor", !r.success);
}

console.log("--- segmentTutarSchema ---");
{
  const r = segmentTutarSchema.safeParse(fd({ segment_id: uuid1, charged_amount: "1500,50" }));
  bekle("virgullu tutar kabul ediliyor", r.success && r.data.charged_amount === 1500.5, r.success ? r.data : r.error.issues[0]?.message);
}
{
  /* Bos gondermek tutari TEMIZLIYOR (fatura yolunu aciyor); 0 TL ciro
     ile karistirilmamali. */
  const r = segmentTutarSchema.safeParse(fd({ segment_id: uuid1, charged_amount: "" }));
  bekle("bos tutar null (temizleme) oluyor", r.success && r.data.charged_amount === null, r.success ? r.data : r.error.issues[0]?.message);
}

console.log("");
console.log(`SONUC: ${gecen} gecti, ${kalan} kaldi`);
process.exit(kalan === 0 ? 0 : 1);
