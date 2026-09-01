/**
 * Zod şemalarının davranış testi.
 * Çalıştırma:  npx tsx scripts/sema-testi.ts
 */
import {
  isMalzemeSchema,
  musteriSchema,
  stokHareketSchema,
  urunSchema,
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

console.log("--- urunSchema (Turkce ondalik) ---");
{
  // Turkce klavyede ondalik ayirici virgul; kullanici "12,5" yazar
  const r = urunSchema.safeParse(fd({ name: "Tel", purchase_price: "12,5", unit_type_default: "kg" }));
  bekle("virgullu ondalik kabul ediliyor (12,5 -> 12.5)", r.success && r.data.purchase_price === 12.5, r.success ? r.data.purchase_price : r.error.issues[0]?.message);
}
{
  const r = urunSchema.safeParse(fd({ name: "Tel", purchase_price: "", unit_type_default: "kg" }));
  bekle("bos fiyat 0 sayiliyor", r.success && r.data.purchase_price === 0);
}
{
  const r = urunSchema.safeParse(fd({ name: "Tel", purchase_price: "-5", unit_type_default: "kg" }));
  bekle("negatif fiyat reddediliyor", !r.success);
}
{
  const r = urunSchema.safeParse(fd({ name: "Tel", purchase_price: "abc", unit_type_default: "kg" }));
  bekle("sayi olmayan fiyat reddediliyor", !r.success, r.success ? r.data : r.error.issues[0]?.message);
}

console.log("--- isMalzemeSchema ---");
/* Gercek gen_random_uuid() ciktilari. Uydurma "1111-..." dizileri RFC 4122
   versiyon/varyant bitlerini saglamadigi icin zod tarafindan reddediliyor;
   sema dogru, test verisi gercekci olmali. */
const uuid1 = "5f7cf10e-6c49-48e9-a144-4ecbb1106ddc";
const uuid2 = "6dbb15c7-afd3-4608-b32c-d118e9c44784";
{
  const r = isMalzemeSchema.safeParse(fd({ job_id: uuid1, product_id: uuid2, qty_pieces: "0", qty_kg: "0" }));
  bekle("iki birim de 0 ise reddediliyor", !r.success);
}
{
  const r = isMalzemeSchema.safeParse(fd({ job_id: uuid1, product_id: uuid2, qty_pieces: "2", qty_kg: "0" }));
  bekle("yalniz adet girilebiliyor", r.success && r.data.qty_pieces === 2);
}
{
  const r = isMalzemeSchema.safeParse(fd({ job_id: uuid1, product_id: uuid2, qty_pieces: "0", qty_kg: "4,25" }));
  bekle("yalniz kg girilebiliyor (virgullu)", r.success && r.data.qty_kg === 4.25);
}
{
  const r = isMalzemeSchema.safeParse(fd({ job_id: uuid1, product_id: uuid2, qty_pieces: "1,5", qty_kg: "0" }));
  bekle("kesirli adet reddediliyor", !r.success);
}

console.log("--- stokHareketSchema ---");
{
  const r = stokHareketSchema.safeParse(fd({ product_id: uuid1, movement_type: "adjustment", qty_pieces_delta: "-3", qty_kg_delta: "0" }));
  bekle("duzeltmede negatif adet kabul ediliyor", r.success && r.data.qty_pieces_delta === -3, r.success ? r.data : r.error.issues[0]?.message);
}
{
  const r = stokHareketSchema.safeParse(fd({ product_id: uuid1, movement_type: "purchase_in", qty_pieces_delta: "-3", qty_kg_delta: "0" }));
  bekle("giriste negatif adet reddediliyor", !r.success);
}
{
  const r = stokHareketSchema.safeParse(fd({ product_id: uuid1, movement_type: "purchase_in", qty_pieces_delta: "0", qty_kg_delta: "0" }));
  bekle("iki delta da 0 ise reddediliyor", !r.success);
}
{
  const r = stokHareketSchema.safeParse(fd({ product_id: uuid1, movement_type: "job_out", qty_pieces_delta: "1", qty_kg_delta: "0" }));
  bekle("job_out elle secilemiyor", !r.success);
}
{
  const r = stokHareketSchema.safeParse(fd({ product_id: uuid1, movement_type: "purchase_in", qty_pieces_delta: "0", qty_kg_delta: "10,5" }));
  bekle("kg girisi virgullu kabul ediliyor", r.success && r.data.qty_kg_delta === 10.5);
}

console.log("");
console.log(`SONUC: ${gecen} gecti, ${kalan} kaldi`);
process.exit(kalan === 0 ? 0 : 1);
