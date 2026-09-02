# Supabase projesini Frankfurt'a taşıma

## Neden

Panelde her sayfa geçişinde ~1 saniyelik bir bekleme vardı. Ölçüm sonucu:

| Ne | Nerede | Kanıt |
|---|---|---|
| Vercel fonksiyonları | `iad1` — ABD, Virginia | `X-Vercel-Id: fra1::iad1::…` |
| Supabase projesi | `ap-northeast-2` — Seul, Kore | DB host'u `2406:da12:…`, AWS ip-ranges'te `ap-northeast-2` |
| Kullanıcılar | Balıkesir, Türkiye | — |

Yani her veritabanı çağrısı **Virginia ↔ Seul** gidip geliyordu: gidiş-dönüş
~190 ms. Panel sayfaları oturum gerektirdiği için önbelleğe alınamıyor ve her
geçişte birkaç çağrı yapılıyor:

```
middleware  getUser()          ~190 ms
sayfa       veri sorguları     ~190 ms  (bazı sayfalarda iki tur)
kullanıcı   Türkiye → Virginia ~130 ms
                               ─────────
                               ~700 ms+ ve üstüne sunucu render'ı
```

Bu, üç kıtaya dağılmış bir kurulumun kaçınılmaz sonucu; kod optimizasyonuyla
kapatılamaz. Ölçülen sürelerin tamamı ağ üzerinde geçiyor.

## Hedef

Hem fonksiyonlar hem veritabanı **Frankfurt**'ta olacak. Balıkesir'den
Frankfurt'a gidiş-dönüş ~40 ms, fonksiyon ile veritabanı arası ~2 ms.
Beklenen sayfa açılışı: **~1 sn → ~100 ms**.

## Sıralama önemli

**Supabase'i taşımadan Vercel'i Frankfurt'a almayın.** Frankfurt → Seul rotası
Virginia → Seul'den daha uzun; ara adımda durum kötüleşir. Env değişkenlerini
yeni projeye çevirmek ile bölge değişikliği **aynı deploy'da** olmalı.

`vercel.json` bu depoda bölgeyi `fra1` olarak sabitliyor — yani bu dosya
deploy edildiği an fonksiyonlar Frankfurt'a geçer. Bu yüzden aşağıdaki
adımlarda env değişkenleri **önce** güncelleniyor.

## Adımlar

Supabase bir projenin bölgesini sonradan değiştirmeye izin vermiyor; yeni
proje açıp geçmek gerekiyor. Şu an neredeyse hiç gerçek veri olmadığı için bu
işlemin en ucuz olduğu an bu — sonra zorlaşır.

### 1. Yeni proje

Supabase → New project:
- **Region: Central EU (Frankfurt) / `eu-central-1`**
- Güçlü bir veritabanı şifresi belirleyin

### 2. Şemayı kur

SQL Editor'de sırayla:

1. `supabase/kurulum-tumu.sql`
2. `supabase/depolama-izinleri.sql` — çıktıda **"TAMAM: 3 politika aktif"**
   yazmalı

Kontrol: 10 tablo, 2 görünüm, `products.qty_grams` kolonu mevcut olmalı.

### 3. Giriş hesabını yeniden oluştur

Authentication → Users → Add user. Kullandığınız e-posta ve şifreyle.
(Kullanıcı hesapları projeye özel; taşınmıyor.)

### 4. Vercel env değişkenlerini çevir

Project Settings → Environment Variables, **Production ve Preview** için:

- `NEXT_PUBLIC_SUPABASE_URL` → yeni projenin Project URL'i
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → yeni projenin anon anahtarı

`NEXT_PUBLIC_SITE_URL` değişmiyor.

### 5. Deploy

Yeniden deploy alın. Bu deploy `vercel.json` ile fonksiyonları da Frankfurt'a
taşır. Project Settings → Functions → Region ayarını da `fra1` yaparsanız
panelde tutarlı görünür; çakışma olursa `vercel.json` kazanır.

### 6. Doğrula

```bash
# Fonksiyon artık fra1'de mi kosuyor? (ikinci alan fonksiyonun bolgesi)
curl -s -o /dev/null -D - https://www.altinozbobinaj.com/giris \
  -w "TTFB=%{time_starttransfer}s\n" | grep -i x-vercel-id
# beklenen: X-Vercel-Id: fra1::fra1::…   (iad1 GORUNMEMELI)

# Yeni veritabani gercekten Frankfurt'ta mi?
nslookup db.<yeni-ref>.supabase.co
# IPv6 2a05:d0… ile basliyorsa AWS Avrupa
```

`/giris` için TTFB'nin ~500 ms'den ~150 ms altına inmesi gerekir.

### 7. Eski projeyi kapat

Yeni kurulumu panelden uçtan uca denedikten **sonra**: müşteri ekle, iş kur,
malzeme gir, işi tamamla, fatura yükle, raporlar sekmesini aç. Hepsi
çalışıyorsa eski Seul projesini duraklatıp silin.

## Eski veriyi taşımak isterseniz

Test verisi olduğu için sıfırdan başlamak önerilir. Yine de taşınacaksa:

Supabase → Database → Backups → eski projeden yedek indirin, yeni projede
`psql` ile geri yükleyin. Dikkat edilecekler:

- Yedek **0008 öncesi** şemayı içeriyorsa (`qty_kg` kolonlu), geri yükledikten
  sonra `supabase/migrations/0008_gram_birimi.sql`'i çalıştırın — dönüşüm
  tekrar çalıştırılabilir, yapılmışsa atlıyor.
- Storage'daki fatura PDF'leri yedeğe dahil değil; `faturalar` bucket'ından
  indirip yeni projeye yükleyin.
- `auth.users` tablosunu elle taşımayın; hesapları yeniden oluşturun.

## Bundan sonra kalan gecikme

Bölge düzeldikten sonra panel sayfaları hâlâ sunucuda render ediliyor ve
oturum gerektirdiği için önbelleğe alınamıyor — bu doğru davranış: stok
sayısını önbelleğe almak kullanıcıya eski stoğu göstermek olur. Frankfurt
içinde her çağrı ~2 ms olduğu için bu artık hissedilmez.
