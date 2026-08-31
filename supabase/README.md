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
çalıştırır — **9 tablo / 8 fonksiyon / 10 politika / 1 view** görmelisiniz.

Tekrar çalıştırmak güvenlidir (`if not exists` / `or replace`).

**Ayrı ayrı uygulamak isterseniz** dosyaları **numara sırasıyla** çalıştırın:

| Sıra | Dosya | İçerik |
|---|---|---|
| 1 | `migrations/0001_initial_schema.sql` | Tablolar, enum'lar, indeksler, kısıtlar |
| 2 | `migrations/0002_functions.sql` | İş akışı fonksiyonları (stok düşümü, QR, geri alma) |
| 3 | `migrations/0003_rls_policies.sql` | Row Level Security politikaları ve yetkiler |
| 4 | `migrations/0004_faz2_fatura_dashboard.sql` | Maliyet hesabı, dashboard fonksiyonları, iş akışı revizyonu |

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

29 test:
- **Faz 1 (17):** stok düşümü, çift tamamlama engeli, QR bilgi sızıntısı, geri
  alma, yetersiz stok, denetim izi korunması ve kısıt ihlalleri
- **Faz 2 (12):** yeni işin otomatik "devam ediyor" başlaması, birim tipine
  göre maliyet hesabı, tamamlanmamış işin maliyete girmemesi, dönem dışı
  faturanın sayılmaması, müşteri kırılımı

Test verisi sonunda `rollback` ile geri alınıyor.

Form doğrulama şemaları için:

```bash
npx tsx scripts/sema-testi.ts
```

---

## Henüz yapılmayanlar

PRD'deki bu maddeler bu aşamada kapsam dışı:

- **Faz 2** — Fatura girişi arayüzü ve dashboard (kâr/zarar özeti).
  `invoices` tablosu ve kısıtları hazır, arayüzü yok.
- **Faz 3** — PDF çıktıları (müşteri / segment / iş / dönemsel rapor).
  `pdf_exports` tablosu hazır. PRD 9.2'nin önerdiği `@react-pdf/renderer`
  tercih edilmeli; Puppeteer Vercel'in sunucusuz limitlerini zorlar.
- **Faz 4 (kısmi)** — QR **görüntüleme sayfası** (`/j/<token>`) hazır, ancak
  QR **görselinin üretimi** ve yazdırılabilir etiket yok. `qrcode` paketi ile
  iş detay sayfasına eklenebilir.
- **Faz 5** — `pg_cron` ile periyodik özetleme.

İş detay sayfasındaki "yaklaşık malzeme maliyeti", adet ve kilogramı aynı
birim fiyatla topluyor. Bu bilinçli bir geçici çözüm ve arayüzde de öyle
etiketli — kesin maliyet hesabı Faz 2'de fatura verisiyle birlikte ele
alınmalı.
