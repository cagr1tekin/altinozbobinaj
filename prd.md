# PRD — Müşteri / Segment / İş / Ürün Yönetim Sistemi

**Durum:** Taslak (esnek) — geliştirme ilerledikçe güncellenmesi beklenir
**Kapsam dışı:** Görsel tasarım / UI kit seçimi (bu konu ayrıca ele alınacak)
**Hedef mimari:** Mevcut Next.js frontend projesinin içine, ayrı bir backend servisi olmadan (Railway yok) — Vercel + Supabase

---

## 1. Amaç ve Bağlam

Mevcut aktif bir frontend (Next.js, Vercel'de yayında) projesinin içine, **ayrı bir backend servisi açmadan** yeni bir iş modülü eklenecek. Amaç; müşteri bazlı iş takibi, stok/ürün yönetimi, fatura bazlı kâr-zarar takibi, talep üzerine PDF çıktısı ve QR ile malzeme şeffaflığı sağlayan bir sistem kurmak.

**Temel prensip: minimum kod.** Bu PRD, sıfırdan yazılacak kod miktarını azaltmak için mevcut açık kaynak projelerden mimari/veri modeli/kütüphane devşirme stratejisini de içerir (bkz. Bölüm 9).

### 1.1 Neden Vercel + Supabase, neden Railway yok?
- Vercel: mevcut frontend zaten burada; ek deploy karmaşası istenmiyor.
- Supabase: Postgres + Auth + Storage + Row Level Security + Edge Functions + pg_cron tek pakette; ayrı bir "her zaman açık" Node/Express sunucusuna ihtiyaç duymadan arka plan işleri (scheduled/otomatik görevler) çalıştırılabiliyor.
- "Backend'in kapanmadan sürekli aktif olması" ihtiyacı, klasik bir sürekli çalışan sunucu yerine şu üç mekanizmayla çözülüyor (detay Bölüm 6):
  1. **Supabase pg_cron / Supabase Cron** — veritabanı içinde periyodik görevler (örn. gecelik özet hesaplama, stok mutabakatı).
  2. **Supabase Database Webhooks** — bir tabloda değişiklik olunca (örn. iş "tamamlandı" işaretlenince) otomatik tetiklenen fonksiyonlar.
  3. **Vercel Route Handler / Supabase Edge Function** — talep anında (on-demand) çalışan, sunucusuz fonksiyonlar (PDF üretimi, QR üretimi, dashboard hesaplamaları gibi).

Bu üçü birlikte, "sürekli açık bir backend" hissini, sunucusuz mimariyle veriyor.

---

## 2. Kapsam Özeti (Fonksiyonel)

1. **Müşteri Yönetimi** — müşteri tanımlama, müşteri profili, geçmiş segment/iş listesi.
2. **Segment Yönetimi** — bir müşterinin belirli bir ziyaret/teslim gününde bıraktığı iş grubu (örn. "bugün 4 kalem iş geldi" = 1 segment, 4 iş). Bir müşterinin zaman içinde birden fazla segmenti olabilir.
3. **İş (Job) Yönetimi** — bir segment içindeki her bir iş kalemi; durumu (bekliyor/devam ediyor/tamamlandı) ve içinde kullanılan ürünler/malzemeler.
4. **Ürün / Stok Yönetimi** — ürün tanımı, alış fiyatı, **hem adet hem kilogram bazında** stok takibi (ikisi birbirinden bağımsız izlenir — bkz. Bölüm 5.3).
5. **İş Tamamlama & Malzeme Düşümü** — bir işe harcanan ürünler eklenir, stoktan düşülür, iş "tamamlandı" olarak işaretlenir.
6. **Fatura Girişi & Dashboard** — müşteriye kesilen faturanın brüt/net fiyatı girilir; ürün alış fiyatları ile birlikte dashboard'da maliyet/kâr-zarar özeti gösterilir.
7. **PDF Çıktıları (talep üzerine, otomatik değil)**
   - Müşteri PDF'i
   - Segment PDF'i
   - İş (job) PDF'i
   - Aylık / 3 aylık / yıllık maliyet-kâr-zarar PDF'i
8. **QR ile Malzeme Şeffaflığı** — bir iş tamamlandığında, o işte kullanılan malzemelerin listesine bağlı bir QR kod üretilir; bu QR işin/ürünün üzerine yapıştırılır; müşteri QR'ı okutarak kendi işinde hangi malzemelerin kullanıldığını görebilir.

### 2.1 Kapsam Dışı (bu doküman için)
- Görsel tasarım, renk paleti, komponent kütüphanesi seçimi.
- Ödeme/tahsilat takibi (fatura *kesme* var, ama tahsilat/ödeme mutabakatı ayrı bir konu — netleştirilmesi gerekiyor, bkz. Açık Sorular).
- Çoklu şube / çoklu depo desteği (ilk sürümde tek lokasyon varsayılıyor).

---

## 3. Kullanıcı Rolleri (varsayım — netleştirilmeli)

- **Admin/Operatör** — sisteme giren, müşteri/segment/iş/ürün/fatura yöneten iç kullanıcı(lar).
- **Müşteri** — sisteme giriş yapmıyor; sadece QR okutarak veya kendisine gönderilen PDF üzerinden bilgiye erişiyor (herhangi bir hesap/login gerektirmiyor — bkz. Bölüm 5.6 güvenlik notu).

> Not: Eğer ileride müşterilerin kendi portallarından geçmiş işlerini görmesi istenirse, bu ayrı bir faz olarak planlanmalı (Supabase Auth ile müşteri girişi eklenebilir).

---

## 4. Veri Modeli (taslak — Postgres/Supabase)

Aşağıdaki şema başlangıç noktasıdır, "esnek" olacak şekilde tasarlanmıştır; alan isimleri ve ek tablolar geliştirme sırasında değişebilir.

```
customers
  id, name, phone, email, address, tax_number, notes, created_at

segments                      -- bir ziyaret/teslim grubu
  id, customer_id (FK), segment_date, note, status, created_at

jobs                          -- segment içindeki tekil iş kalemi
  id, segment_id (FK), title, description, status
      (pending / in_progress / completed), completed_at, created_at

products                      -- ürün / malzeme tanımı
  id, name, sku, purchase_price, unit_type_default (piece/kg/both),
      created_at

stock (veya products tablosuna gömülü alanlar)
  product_id (FK), qty_pieces, qty_kg, updated_at

job_products                  -- bir işte harcanan ürünler (M:N + miktar)
  id, job_id (FK), product_id (FK),
      qty_pieces_used, qty_kg_used, unit_cost_snapshot, created_at

stock_movements                -- stok hareket geçmişi (audit + azaltma)
  id, product_id (FK), job_id (FK, nullable), movement_type
      (purchase_in / job_out / adjustment), qty_pieces_delta,
      qty_kg_delta, created_at

invoices
  id, customer_id (FK), segment_id (FK, nullable), invoice_no,
      gross_amount (brüt), net_amount (net), tax_amount, issue_date,
      created_at

qr_codes
  id, job_id (FK), token (opak/tahmin edilemez), qr_url, created_at

pdf_exports (opsiyonel — log/denetim amaçlı)
  id, type (customer/segment/job/period_report), reference_id,
      file_url, generated_at, generated_by
```

**Neden `stock_movements` ayrı bir tablo?** Sadece anlık stok miktarını tutmak yerine, her hareketi (girişi/çıkışı) kayıt altına almak; hem denetlenebilirlik hem de "bu üründen ne zaman ne kadar harcandı" sorusuna cevap vermek için önerilir. Basit tutmak isterseniz ilk fazda `products` tablosuna gömülü `qty_pieces`/`qty_kg` alanlarıyla başlanıp, ikinci fazda hareket geçmişi eklenebilir.

---

## 5. Fonksiyonel Detaylar

### 5.1 Müşteri → Segment → İş Hiyerarşisi
- Bir müşteri altında sınırsız sayıda segment açılabilir (her ziyaret/teslimat = 1 segment).
- Her segment altında 1 veya daha fazla iş (job) bulunur.
- Segment düzeyinde toplu görünüm (o gün gelen kaç kalem iş, toplam durum) gösterilmeli.

### 5.2 İş (Job) Durum Akışı
Önerilen minimum durum seti: `Bekliyor → Devam Ediyor → Tamamlandı`
- "Tamamlandı" durumuna geçiş, o işe harcanan ürünlerin girilmiş olmasını zorunlu kılabilir (iş kuralı — netleştirilmeli).
- İş tamamlandığında otomatik olarak: (a) stok düşümü yapılır, (b) QR kod üretilir (bkz. 5.5).

### 5.3 Ürün ve Çift Birimli Stok Takibi (Adet + Kilogram)
Bu, standart "birim dönüşümü" (örn. 1 koli = 12 adet) mantığından farklıdır; çünkü adet başına ağırlık **sabit değil, değişken** olabilir (örn. bazı ürünlerde parça başına kg farklılık gösterir). Bu nedenle:
- `qty_pieces` (adet) ve `qty_kg` (kilogram) **birbirinden bağımsız iki sayaç** olarak tutulur.
- Bir işte ürün kullanıldığında, kullanıcı isterse adet, isterse kg, isterse her ikisini birden girebilir; her ikisi de ayrı ayrı stoktan düşülür.
- Raporlama için opsiyonel "ortalama kg/adet" bilgisi tutulabilir ama bu sadece bilgi amaçlıdır, otomatik dönüşüm için kullanılmaz (dönüşüm hatalı stok verisine yol açar).

### 5.4 Fatura Girişi ve Dashboard
- Fatura kaydı: müşteri, tarih, brüt tutar, net tutar (ve varsa vergi/kesinti ayrımı) girilir.
- Dashboard, şu verileri birleştirerek gösterir:
  - Toplam brüt/net gelir (seçilen dönem için)
  - Toplam ürün maliyeti (harcanan ürünlerin alış fiyatı × kullanılan miktar toplamı)
  - Kâr/zarar (net gelir − toplam maliyet)
  - Dönemsel karşılaştırma (aylık/3 aylık/yıllık)
- Dashboard sayfasından, ilgili döneme ait **kâr-zarar PDF'i talep üzerine** üretilebilir (otomatik/periyodik olarak üretilip biriktirilmeyecek — sadece istenildiğinde).

### 5.5 PDF Çıktıları (talep üzerine)
| PDF Türü | İçerik | Tetikleme |
|---|---|---|
| Müşteri PDF'i | Müşteri bilgisi + geçmiş segment/iş özeti | Müşteri sayfasında "PDF Al" butonu |
| Segment PDF'i | Segment altındaki tüm işler + kullanılan malzemeler | Segment sayfasında buton |
| İş (Job) PDF'i | Tek işin detayı + kullanılan malzeme listesi + QR | İş tamamlandığında veya talepte |
| Dönemsel Maliyet/Kâr-Zarar PDF'i | Seçilen aralık için gelir/gider/kâr özeti | Dashboard sayfasında, tarih aralığı seçilerek |

Teknik not: PDF'ler Vercel sunucusuz fonksiyon içinde, sayfa yüklenirken değil buton tetiklendiğinde üretilip Supabase Storage'a yazılır, kullanıcıya imzalı (signed) link olarak sunulur (bkz. Bölüm 9.2).

### 5.6 QR ile Malzeme Şeffaflığı
- İş "tamamlandı" olduğunda, o işe bağlı, **tahmin edilemez bir token** içeren bir URL için QR kod üretilir (örn. `https://uygulama.com/j/{token}`).
- Bu QR, işin/ürünün üzerine yapıştırılacak şekilde yazdırılabilir (iş PDF'i içine gömülebilir).
- Müşteri, giriş yapmadan, sadece telefon kamerasıyla QR'ı okutarak o işte kullanılan malzemeleri gösteren herkese açık (ama tahmin edilemez URL ile korunan) bir sayfa görür.
- **Güvenlik notu:** Token sıralı/tahmin edilebilir olmamalı (örn. job id yerine rastgele UUID/hash); aksi halde başka müşterilerin iş bilgilerine erişim riski oluşur. Bu sayfa salt-okunur olmalı ve hassas ticari bilgi (alış fiyatı, kâr marjı vb.) **kesinlikle içermemeli** — sadece malzeme adı/miktarı gösterilmeli.

---

## 6. "Sürekli Aktif Backend" İhtiyacının Çözümü (Railway'siz)

| İhtiyaç | Çözüm | Not |
|---|---|---|
| Periyodik/otomatik görevler (örn. gecelik stok mutabakatı, aylık özet ön-hesaplama) | **Supabase pg_cron / Supabase Cron** | Veritabanı içinde çalışır, ayrı sunucu gerekmez |
| Bir kayıt değiştiğinde tetiklenen mantık (örn. iş tamamlandı → QR üret) | **Supabase Database Webhooks** (+ Edge Function) | Event-driven, sunucu beklemez |
| Kullanıcı talebiyle anlık çalışan işlemler (PDF üretimi, dashboard hesaplama) | **Vercel Route Handler** (`app/api/.../route.ts`) veya **Supabase Edge Function** | Sunucusuz, istek geldiğinde çalışır |
| Basit periyodik ping/iş (günde birkaç kez) | **Vercel Cron Jobs** | Hobby planda sınırlı sıklık — sınırlar deploy öncesi kontrol edilmeli |

Bu tablo, "backend kapanmasın" ihtiyacını karşılamak için ayrı bir Node/Express sunucusu yerine yukarıdaki dört mekanizmanın birlikte kullanılmasını önerir. Mevcut Vercel frontend projesi içine `app/api/*` route'ları olarak entegre edilir; Railway'e gerek kalmaz.

---

## 7. Dashboard (Özet Sayfa)

- Seçilebilir tarih aralığı (aylık/3 aylık/yıllık, ayrıca serbest aralık).
- Kartlar: Toplam Gelir (brüt/net), Toplam Maliyet, Kâr/Zarar, Aktif İş Sayısı, Tamamlanan İş Sayısı.
- Müşteri bazlı kırılım (en çok iş getiren / en kârlı müşteriler).
- "PDF Al" aksiyonu (sadece bu sayfada tetiklenir, otomatik export yoktur).

*(Grafik/görsel bileşen tercihleri tasarım aşamasında ele alınacak — kapsam dışı.)*

---

## 8. Fonksiyonel Olmayan Gereksinimler

- **Tek kod tabanı:** Mevcut Next.js frontend projesi içine entegre edilecek, ayrı FE/BE repo ayrımı yapılmayacak.
- **Veri güvenliği:** Supabase Row Level Security (RLS) ile iç kullanıcı verisi korunacak; QR ile açılan müşteri sayfaları ayrı, kısıtlı ve salt-okunur bir erişim politikasına sahip olacak.
- **Denetlenebilirlik:** Stok hareketleri ve fatura girişleri geriye dönük izlenebilir olmalı (audit trail).
- **Performans:** PDF/QR üretimi talep üzerine, birkaç saniye içinde tamamlanmalı; Vercel sunucusuz fonksiyon süre/bellek limitleri göz önünde bulundurulmalı.
- **Ölçeklenebilirlik:** İlk sürüm tek işletme/tek lokasyon için tasarlanmıştır; çoklu şube ihtiyacı doğarsa veri modeli genişletilebilir olmalı.

---

## 9. Minimum Kod Stratejisi — Açık Kaynak Araştırma Özeti

> Aşağıdaki bulgular, ayrı bir araştırma turunda derlenmiştir. **Yıldız sayısı, son güncelleme tarihi ve platform limitleri gibi rakamlar tahminidir**, PRD'yi kesinleştirmeden önce GitHub/Vercel/Supabase üzerinden tekrar doğrulanmalıdır.

### 9.1 Tam olarak bu ihtiyacı karşılayan hazır bir repo yok — ama iyi başlangıç noktaları var
Müşteri→Segment→İş→Ürün zincirini, çift birimli (adet+kg) stoğu, brüt/net faturalamayı ve QR malzeme şeffaflığını **birebir** karşılayan açık kaynak bir proje bulunamadı. Bunun yerine önerilen yaklaşım: bir **iskelet (starter)** + birkaç **veri modeli/mimari referansı** + hedefe yönelik **kütüphaneler**.

**İskelet (Next.js + Supabase uygulama kabuğu) için:**
- `vercel/nextjs-subscription-payments` — Next.js App Router + Supabase Auth + Stripe; MIT lisans. Kimlik doğrulama/temel yapı için iyi başlangıç.
- Supabase'in kendi örnekleri (`supabase/supabase` reposu altındaki `examples`) — Auth/RLS/Storage entegrasyon desenleri için referans.

**Mimari/iş akışı referansı olarak en yakın eşleşme:**
- `midday-ai/midday` — Next.js + Supabase + TypeScript ile üretimde çalışan bir faturalama + PDF üretim + Supabase Storage akışı içeriyor. **AGPL lisanslı** — kod olarak kopyalanmamalı, sadece mimari/akış olarak incelenmeli.

**Veri modeli referansı (stok, iş emri, çoklu birim) için — stack'i farklı olsa da fikir alınabilir:**
- `frappe/erpnext` ve `odoo/odoo` — İş Emri (Work Order/Job Card), çoklu birim stok ve faturalama kavramlarını en kapsamlı şekilde modelleyen sistemler (Python/PHP tabanlı, doğrudan kod kullanılmayacak, sadece veri modeli fikri alınacak).
- `inventree/InvenTree` — Stok takibi + **yerleşik QR/barkod** desteği içeren, MIT lisanslı bir envanter sistemi; QR-stok ilişkisi için doğrudan incelenmeye değer (lisansı MIT olduğu için kod parçaları da referans alınabilir).
- `invoiceninja/invoiceninja` — Brüt/net/vergi ayrımı içeren fatura modeli için iyi bir referans.

### 9.2 PDF Üretimi (Vercel sunucusuz ortam için)
- **Önerilen:** `@react-pdf/renderer` (React component tabanlı, saf JS, sunucusuz ortamda sorunsuz) veya `pdf-lib` (var olan PDF şablonlarını doldurmak için).
- **Kaçınılması gereken (gerekmedikçe):** Puppeteer/Playwright + headless Chromium (`@sparticuz/chromium`) — paket boyutu ve soğuk başlatma süresi nedeniyle Vercel'in sunucusuz limitlerini zorlar; yalnızca piksel-mükemmel HTML→PDF dönüşümü şart koşulursa tercih edilmeli (muhtemelen Vercel Pro plan gerektirir).

### 9.3 QR Üretimi
- **Sunucu tarafında üretim:** `qrcode` (node-qrcode) — PDF/etiket içine QR gömmek için.
- **Ekranda gösterim:** `qrcode.react` veya `react-qr-code`.
- QR içine gömülen link, sıralı/tahmin edilebilir bir ID değil, **opak bir token** taşımalı (bkz. 5.6 güvenlik notu).

### 9.4 Çift Birimli (Adet + Kilogram) Stok Modellemesi
Bu, ERP dünyasında "catch-weight / değişken ağırlık" problemi olarak bilinir. Standart "1 koli = 12 adet" gibi sabit oranlı birim dönüşümü **bu senaryoya uygun değildir**, çünkü adet başına ağırlık değişkendir. Önerilen çözüm: `qty_pieces` ve `qty_kg` alanlarını **bağımsız iki sayaç** olarak tutmak (bkz. Bölüm 5.3 ve 4).

### 9.5 Lisans Uyarısı
Bazı referans projeler (ERPNext/Odoo: GPL/LGPL; twenty, midday, snipe-it: AGPL; invoiceninja: kaynak-erişilebilir ama özel lisans) **kısıtlayıcı lisanslara** sahiptir — bunlardan doğrudan kod kopyalamak yerine sadece mimari/veri modeli fikri alınmalıdır. MIT/Apache lisanslı projeler (InvenTree, Vercel'in kendi starter'ları, Supabase örnekleri) doğrudan kod referansı için daha güvenlidir.

---

## 10. Aşamalı Yol Haritası (öneri)

| Faz | Kapsam |
|---|---|
| **Faz 1 — Temel** | Müşteri/Segment/İş CRUD, ürün tanımlama, tekli stok alanları (adet+kg), iş tamamlama + stok düşümü |
| **Faz 2 — Fatura & Dashboard** | Fatura girişi (brüt/net), temel dashboard (gelir/maliyet/kâr-zarar) |
| **Faz 3 — PDF** | Müşteri/Segment/İş PDF'leri, talep üzerine dönemsel kâr-zarar PDF'i |
| **Faz 4 — QR Şeffaflık** | İş tamamlandığında QR üretimi, müşteri tarafı salt-okunur görüntüleme sayfası |
| **Faz 5 — İyileştirme** | Stok hareket geçmişi (audit), otomatik periyodik özetleme (pg_cron), gerekirse müşteri portalı |

---

## 11. Açık Sorular / Netleştirilmesi Gerekenler

1. Fatura kesildikten sonra **tahsilat/ödeme durumu** takip edilecek mi, yoksa sadece fatura kaydı mı tutulacak?
2. Segment içindeki işlerin tamamı bitmeden segment "kapatılabilir" mi, yoksa tüm işler tamamlanmadan segment açık mı kalmalı?
3. Ürün alış fiyatı zaman içinde değişirse (örn. zam), geçmiş işlerdeki maliyet hesaplaması **o anki fiyatla mı** (snapshot) yoksa **güncel fiyatla mı** hesaplanmalı? (Öneri: snapshot — `job_products.unit_cost_snapshot` alanı bunun için eklendi.)
4. QR ile açılan müşteri sayfasında hangi bilgiler **kesinlikle gösterilmemeli** (örn. alış fiyatı, kâr marjı) — bunun net bir listesi çıkarılmalı.
5. Çoklu kullanıcı/rol ihtiyacı var mı (örn. saha ekibi işi telefonundan tamamlıyor, ofis faturayı giriyor)?
6. Vercel planı (Hobby/Pro) ve Supabase planı hangisi olacak? Bu, PDF üretim yöntemi ve cron sıklığı kararlarını doğrudan etkiler.

---

## 12. Sonraki Adım

Bu PRD onaylandıktan sonra:
1. Bölüm 9'daki referans repolar (özellikle `midday-ai/midday` ve `inventree/InvenTree`) canlı olarak incelenip somut kod/şema örnekleri çıkarılmalı.
2. Bölüm 4'teki veri modeli, Supabase'de migration olarak yazılmalı.
3. Faz 1 (Bölüm 10) geliştirmeye başlanmalı.