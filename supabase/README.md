# Yönetim Paneli — Kurulum

PRD Faz 1 (müşteri / segment / iş / ürün / stok) ve Faz 4'ün QR görüntüleme
kısmı. Fatura girişi, dashboard ve PDF çıktıları henüz yok (bkz. en alt).

## 1. Supabase projesi

1. [supabase.com](https://supabase.com) üzerinde yeni proje açın.
   Bölge olarak **Frankfurt (eu-central-1)** önerilir — Türkiye'ye en yakın
   bölge, gecikme farkı hissedilir.
2. Veritabanı şifresini bir parola yöneticisine kaydedin.

## 2. Kendi kaydolmayı (signup) kapatın — ÖNEMLİ

**Authentication → Sign In / Providers → Email** altında
**"Allow new users to sign up"** seçeneğini **kapatın**.

Bu bir iç araç: RLS politikaları `authenticated` rolüne tüm verilere erişim
veriyor (PRD Bölüm 3, tek iç kullanıcı rolü). Signup açık kalırsa herhangi
biri e-postayla kayıt olup müşteri, iş ve stok verisinin tamamına erişir.

Personel hesapları **Authentication → Users → Add user** ile elle açılır.

## 3. Migration'ları uygulayın

**Kolay yol:** `kurulum-tumu.sql` dosyasının tamamını kopyalayıp Supabase
panelinde **SQL Editor**'e yapıştırın ve çalıştırın. Bu dosya aşağıdaki üç
migration'ın sırayla birleştirilmiş hâlidir ve sonunda bir doğrulama sorgusu
çalıştırır — **10 tablo / 12 fonksiyon / 11 politika / 1 view** görmelisiniz.

Tekrar çalıştırmak güvenlidir (`if not exists` / `or replace`).

**Ayrı ayrı uygulamak isterseniz** dosyaları **numara sırasıyla** çalıştırın:

| Sıra | Dosya | İçerik |
|---|---|---|
| 1 | `migrations/0001_initial_schema.sql` | Tablolar, enum'lar, indeksler, kısıtlar |
| 2 | `migrations/0002_functions.sql` | İş akışı fonksiyonları (stok düşümü, QR, geri alma) |
| 3 | `migrations/0003_rls_policies.sql` | Row Level Security politikaları ve yetkiler |
| 4 | `migrations/0004_faz2_fatura_dashboard.sql` | Maliyet hesabı, dashboard fonksiyonları, iş akışı revizyonu |
| 5 | `migrations/0005_faz5_periyodik_ozet.sql` | Aylık özet, pg_cron işi, stok mutabakatı, açılış stoğu trigger'ı |

`tests/00_supabase_shim.sql` dosyasını **çalıştırmayın** — o yalnızca yerel
Postgres'te test için, Supabase'de bu roller zaten var.

## 4. Personel kullanıcısı oluşturun

**Authentication → Users → Add user** ile e-posta ve şifre girin.

Kayıt (sign-up) formu bilinçli olarak yok: bu bir iç araç, herkesin hesap
açabilmesi gerekmiyor. Yeni personel için buradan kullanıcı eklenir.

## 5. Ortam değişkenleri

Kök dizindeki `.env.example` dosyasını `.env` olarak kopyalayın ve
**Project Settings → API** bilgileriyle doldurun:

```
NEXT_PUBLIC_SUPABASE_URL=https://<proje-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / public anahtarı>
NEXT_PUBLIC_SITE_URL=https://altinozbobinaj.com
```

`anon` anahtarı tarayıcıya gider — bu normaldir, güvenliği RLS sağlar.
**`service_role` / secret anahtarını hiçbir yere koymayın**: RLS'i baypas
eder ve tüm yetki modelini anlamsız kılar. Kod bilinçli olarak yalnızca
`anon` anahtarını kullanır.

Supabase panelindeki **Session / Transaction pooler** ve **Direct connection**
bağlantı adreslerine ihtiyaç yoktur — onlar doğrudan Postgres'e bağlanan
araçlar (psql, Prisma, Drizzle) içindir. Bu proje REST API üzerinden
çalışır, yalnızca **Project URL** gerekir. Veritabanı parolası da `.env`'de
saklanmamalıdır, kod onu kullanmaz.

Vercel'de aynı üç değişkeni **Settings → Environment Variables** altına
ekleyin.

## 6. Çalıştırın

```bash
npm install
npm run dev
```

`http://localhost:3000/giris` adresinden giriş yapın.

---

## Mimari kararlar

### Stok düşümü neden veritabanı fonksiyonunda?

"Oku → hesapla → yaz" akışı iki eşzamanlı istekte yarış koşuluna giriyor ve
stok sessizce yanlış kalıyor. `complete_job()` içinde ürün satırları
`FOR UPDATE` ile kilitleniyor; stok düşümü, hareket kaydı, durum değişimi ve
QR üretimi tek transaction'da atomik ilerliyor.

Ürünler her zaman `product_id` sırasına göre kilitleniyor — sabit bir sıra
olmadan iki iş aynı iki ürüne ters sırada eriştiğinde deadlock oluşur.

### Adet ve kilogram neden ayrı sayaç?

PRD 5.3: adet başına ağırlık sabit değil. Bu, ERP dünyasında *catch-weight*
problemi olarak biliniyor. Otomatik birim dönüşümü yapmak hatalı stok
verisine yol açar, bu yüzden `qty_pieces` ve `qty_kg` bağımsız izleniyor ve
aralarında hiçbir dönüşüm yapılmıyor.

### Alış fiyatı neden kopyalanıyor?

`job_products.unit_cost_snapshot`, malzeme eklendiği andaki alış fiyatını
saklıyor (PRD Bölüm 11 / Soru 3'ün önerdiği çözüm). Ürün fiyatı sonradan
değişse bile geçmiş işlerin maliyeti sabit kalıyor.

### QR sayfası ne gösteriyor, ne göstermiyor?

`public_job_by_token()` yalnızca **iş başlığı, tamamlanma tarihi ve malzeme
adı/miktarı** döndürüyor. Alış fiyatı, maliyet anlık görüntüsü, kâr marjı ve
müşteri kimliği bilinçli olarak dışarıda — QR etiketi fotoğraflanabilir.

Fonksiyon `security definer` ve sabit `search_path` ile çalışıyor; `anon`
rolünün tablolara hiçbir erişimi yok, veri yalnızca bu fonksiyonun
döndürdüğü alanlar kadar görünür. Token `gen_random_bytes(16)` ile
üretiliyor (128 bit), sıralı iş id'si değil.

### Eksi stok neden tamamen engellenmiyor?

Varsayılan olarak engelleniyor: eksi stok genellikle girilmemiş bir alım
kaydı anlamına gelir ve maliyet hesabını sessizce bozar. Ancak sahada işi
kapatmak gerçekten gerekiyorsa arayüz açık bir onay kutusuyla
`allow_negative` gönderip devam edebiliyor — tercih kayda geçiyor, sessizce
olmuyor.

### Maliyet nasıl hesaplanıyor?

`products.purchase_price` tek bir alan ama ürün hem adet hem kilogram ile
izlenebiliyor. Fiyatın hangi birime ait olduğu `unit_type_default` ile
belirleniyor (`job_product_cost()` fonksiyonu):

| Takip birimi | Maliyet |
|---|---|
| `piece` | fiyat × kullanılan adet |
| `kg` | fiyat × kullanılan kilogram |
| `both` | fiyat × (adet + kilogram) |

**`both` varsayımı zayıf:** adet ve kilogram için farklı fiyat gerekiyorsa
`products`'a ayrı bir fiyat alanı eklenmeli. Şu an ürünlerin büyük çoğunluğu
tek birimle izlendiği için bu varsayımla ilerleniyor.

Dashboard'da maliyet yalnızca **tamamlanmış** işlerden toplanıyor:
tamamlanmamış işin malzemesi henüz stoktan düşmediği için gerçekleşmiş bir
gider değil.

### Stok ne zaman düşüyor?

Yalnızca iş **tamamlandığında**. Malzeme eklemek stoğu düşürmez ve stok
hareketi oluşturmaz — bu, işe hangi malzemenin gireceğini planlarken stoğun
erken düşmesini engelliyor. Arayüzde her iki durumda da açıkça belirtiliyor.

### Açılış stoğu neden trigger ile yazılıyor?

`products.qty_*` alanları doğrudan INSERT ile doldurulabiliyordu ve bu,
`stock_movements` ile kalıcı bir fark bırakıyordu — stok mutabakatı böyle bir
ürünü hep "tutarsız" gösteriyordu. Uygulama ürünü 0 stokla açıp girişi
`apply_stock_movement` ile yapıyor, ama şema bunu garanti etmiyordu.
`products_opening_stock` trigger'ı, sıfırdan farklı açılış stoğuyla oluşturulan
üründe karşılık gelen `purchase_in` hareketini kendisi yazıyor.

### Periyodik işler nasıl çalışıyor? (Faz 5)

`monthly_summaries` tablosu ay bazlı gelir/maliyet/kâr değerlerini önceden
hesaplanmış tutuyor. `nightly_summary_refresh()` içinde bulunulan ve bir
önceki ayı tazeliyor — daha eski aylar değişmediği için hepsini her gece
yeniden hesaplamak gereksiz.

pg_cron **Supabase panelinde Database → Extensions** bölümünden
etkinleştirilmeli. Uzantı yoksa 0005 migration'ı hata vermiyor, yalnızca
zamanlamayı atlıyor; fonksiyonlar elle veya bir Vercel Cron ucundan da
çağrılabilir. Zamanlanan iş her gece **02:15 UTC** (TSİ 05:15) çalışıyor.

`stock_reconciliation()` ise `products.qty_*` ile hareket geçmişi arasındaki
farkları listeliyor. Otomatik düzeltmiyor: hangisinin doğru olduğu duruma göre
değişir ve sessiz düzeltme sorunun kaynağını gizler. Farklar Ürünler
sayfasında uyarı olarak görünüyor.

### `stock_movements` neden güncellenemiyor?

RLS bu tabloda `authenticated` rolüne yalnızca `SELECT` ve `INSERT` veriyor.
Geçmişi değiştirilebilen bir kayıt denetim izi olmaz. Hatalı bir tamamlama
`revert_job_completion()` ile geri alınıyor ve bu da yeni bir hareket
kaydı oluşturuyor.

---

## Yerel test

Migration'lar ve fonksiyonlar Supabase'e dokunmadan yerel Postgres'te
doğrulanabilir:

```bash
docker run -d --name altinoz-pg \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=altinoz \
  -p 55432:5432 postgres:16-alpine

docker exec -i altinoz-pg psql -U postgres -d altinoz -v ON_ERROR_STOP=1 \
  < supabase/tests/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do
  docker exec -i altinoz-pg psql -U postgres -d altinoz -v ON_ERROR_STOP=1 < "$f"
done

docker cp supabase/tests/01_workflow_test.sql altinoz-pg:/tmp/test.sql
docker exec altinoz-pg psql -U postgres -d altinoz -v ON_ERROR_STOP=1 -f /tmp/test.sql
```

```bash
docker cp supabase/tests/02_faz2_test.sql altinoz-pg:/tmp/t2.sql
docker exec altinoz-pg psql -U postgres -d altinoz -v ON_ERROR_STOP=1 -f /tmp/t2.sql
```

```bash
docker cp supabase/tests/03_faz5_test.sql altinoz-pg:/tmp/t3.sql
docker exec altinoz-pg psql -U postgres -d altinoz -v ON_ERROR_STOP=1 -f /tmp/t3.sql
```

37 test:
- **Faz 1 (18):** stok düşümü, çift tamamlama engeli, QR bilgi sızıntısı, geri
  alma, yetersiz stok, denetim izi korunması ve kısıt ihlalleri
- **Faz 2 (11):** yeni işin otomatik "devam ediyor" başlaması, birim tipine
  göre maliyet hesabı, tamamlanmamış işin maliyete girmemesi, dönem dışı
  faturanın sayılmaması, müşteri kırılımı
- **Faz 5 (8):** aylık özet hesabı, upsert davranışı, gecelik işin iki ayı
  tazelemesi, stok mutabakatı, açılış stoğu trigger'ı

Test verisi sonunda `rollback` ile geri alınıyor.

Form doğrulama şemaları için:

```bash
npx tsx scripts/sema-testi.ts
```

---

## PDF çıktıları (Faz 3)

Belgeler talep üzerine üretiliyor ve doğrudan yanıt gövdesinde dönüyor.
PRD 9.2 Supabase Storage'a yazıp imzalı link vermeyi öneriyor; belgeler küçük
ve anlık üretildiği için bu tur atlandı. Storage gerekirse `pdf_exports`
tablosu ve şema hazır.

| Uç | Belge |
|---|---|
| `/api/pdf/is?id=…` | İş belgesi (malzemeler + QR adresi) |
| `/api/pdf/segment?id=…` | Segment belgesi (tüm işler) |
| `/api/pdf/musteri?id=…` | Müşteri belgesi (segment/iş geçmişi) |
| `/api/pdf/donem?bas=…&bit=…` | Dönemsel kâr/zarar raporu |

Her uca `&maliyet=0` eklendiğinde **müşteri kopyası** üretiliyor: alış fiyatı
ve maliyet sütunları hiç çizilmiyor (PRD 5.6 ile aynı gerekçe). Panelde her
belgenin yanında iki buton var.

**Font neden gömülü?** `@react-pdf/renderer`'ın varsayılan Helvetica'sı
WinAnsi ile sınırlı; `ğ ş ı İ` ve `₺` glifleri yok ve bu karakterler PDF'te
sessizce kayboluyor. Roboto TTF `public/fonts/` altında tutuluyor — CDN'den
indirmek sunucusuz ortamda soğuk başlatmada ağ hatasına açık.

## QR etiketi (Faz 4)

- `/api/qr?token=…` → QR kodunu SVG olarak döndürüyor (oturum gerekli)
- `/yonetim/isler/<id>/etiket` → yazdırılabilir etiket sayfası

Etiket sayfasında QR sunucuda üretilip doğrudan gömülüyor; ayrı bir istek
yapılmadığı için yazdırma diyaloğu açıldığında görsel kesin hazır olur.
Yazdırmada panel çerçevesi ve butonlar gizleniyor (`@media print`).

## Henüz yapılmayanlar

- **e-Fatura entegrasyonu.** Üretilen PDF'ler iç belgelerdir ve sayfa altında
  "resmî fatura yerine geçmez" ibaresi taşır. Resmî e-Fatura GİB
  entegrasyonu gerektirir ve PRD kapsamı dışındadır.
- **Tahsilat/ödeme takibi** (PRD 2.1 gereği kapsam dışı).
- **Çoklu şube/depo** (ilk sürümde tek lokasyon varsayılıyor).

### Bilinen varsayım: `both` birimli ürünlerde maliyet

`products.purchase_price` tek alan ama ürün hem adet hem kilogram ile
izlenebiliyor. `unit_type_default = 'both'` olan üründe fiyat **her iki birime
de** uygulanıp toplanıyor. Bu matematiksel olarak zayıf bir varsayım; adet ve
kilogram için farklı fiyat gerekiyorsa `products`'a ayrı bir fiyat alanı
eklenmeli.
