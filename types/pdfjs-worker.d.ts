/**
 * pdfjs-dist worker modülünün tip bildirimi.
 *
 * Paket `pdf.worker.mjs` için .d.ts göndermiyor (yalnızca `pdf.d.mts` var);
 * modül bir uygulama API'si değil, pdfjs'in kendi iç dosyası.
 *
 * Biz onu YALNIZCA yan etkisi için içeri alıyoruz: statik belirteç
 * sayesinde Next'in dosya izleyicisi dosyayı sunucusuz pakete kopyalıyor
 * ve `globalThis.pdfjsWorker`'a konunca pdfjs kendi dinamik import'unu
 * hiç yapmıyor. Bkz. lib/fatura/ayristir.ts → workerYukle().
 *
 * İçeriğinden bir şey okumadığımız için `unknown` yeterli; `any` vermek
 * ileride yanlışlıkla bu modülden bir şey çağırmayı sessizce serbest
 * bırakırdı.
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  const worker: unknown;
  export default worker;
}
