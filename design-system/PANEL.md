# Yönetim Paneli — Tasarım Sistemi

> Bu sistem **yalnızca panel** içindir: `/giris`, `/yonetim/*`, `/j/*`.
> Pazarlama sitesi (`altinozbobinaj.com/`) bu sistemden **hiç etkilenmez** ve
> kendi koyu temasını korur. İki sistem token, font ve bileşen düzeyinde
> tamamen ayrıdır; panel tokenları `pnl-` önekiyle işaretlenmiştir.

## Kim kullanıyor?

1–3 kişilik atölye ekibi. Telefonla, ayakta, çoğu zaman acele ederek ve elleri
kirliyken. Teknik kullanıcı değiller.

Bu üç cümle sistemin tamamını belirliyor:

- **Mobile-first.** Masaüstü ikincil. Ana navigasyon parmağın ulaştığı yerde:
  ekranın altında.
- **Büyük hedefler.** Minimum 48px, aralarında minimum 8px boşluk.
- **Ekran başına tek belirgin eylem.** İkincil işler görsel olarak geride.
- **Süs yok.** Gölge, gradient, dekoratif animasyon yok.

## Üç tasarım alanı

Projede iki değil **üç** alan var. Karışmamaları için rota grupları ayrı:

| Alan | Rota grubu | Kim görüyor | Tasarım |
|---|---|---|---|
| Pazarlama sitesi | `app/(site)/` | Herkes | Koyu, marka, tam menü |
| Yönetim paneli | `app/(panel)/` | Personel | Açık, `pnl-` tokenları, tek font |
| Müşteri belgesi | `app/(belge)/` | Müşteri (QR) | Koyu marka, **menü yok** |

**Müşteri belgesi (`/j/…`) neden ayrı bir alan?**

Panel değil: bu sayfayı personel değil müşteri görüyor. Panelin açık teması
atölyede hızlı kullanım için tasarlandı; belgenin işi marka izlenimi
bırakmak. Sayfa bir dönem panelin içindeydi ama bu bilinçli bir karar
değildi — klasör olarak orada durduğu için öyle görünüyordu.

Pazarlama grubu da değil: o layout başlık ve footer'ı getiriyor.
Başlıktaki menü `#hizmetler` gibi çapa bağlantıları kullanıyor ve
`scrollToSection` hedefi bulamazsa **hiçbir şey yapmıyor** — ana sayfa
dışında o linkler tıklanıp tepki vermeyen ölü bağlantılara dönüşür.
Mobil çağrı barı da `#hero` arıyor, belgede yok.

Bu yüzden belge kabuğu pazarlamanın RENK ve FONT dilini alıyor, GEZİNMESİNİ
almıyor. Müşteri bir belge gördüğünü hissediyor, reklam sayfası değil.

**Giriş sayfası (`/giris`) neden panelde kaldı?**

Personel giriş yapıp hemen panele düşüyor; koyu→açık geçişi her girişte
gözü yorar. Landing menüsü de orada gidilecek yeri olmayan bir gürültü.
Yalnızca logo eklendi — marka belli oluyor, panel tokenları korunuyor.

## Neden landing'den ayrı?

| | Landing | Panel |
|---|---|---|
| Amaç | İkna etmek | İş yaptırmak |
| Bağlam | Rahat, keşif | Acele, tekrar eden görev |
| Tema | Koyu `#09090b` | Açık `#F8FAFC` |
| Font | Playfair Display + Plus Jakarta | Tek font: **Inter** |
| Stil | Premium, editorial | Flat Design |
| Vurgu | Gümüş gradient | Tek renk mavi |

Pazarlama sitesinin görsel dilini iç araca taşımak, aracı yavaşlatır ve
gereksiz karmaşık gösterir.

---

## Renkler

Tümü `tailwind.config.ts` içinde `pnl-` önekiyle tanımlı.

| Token | Hex | Kullanım | Kontrast |
|---|---|---|---|
| `pnl-bg` | `#F8FAFC` | Sayfa zemini | — |
| `pnl-surface` | `#FFFFFF` | Kart, liste satırı, form | — |
| `pnl-text` | `#0F172A` | Ana metin | 17.9:1 (kart) |
| `pnl-muted` | `#475569` | İkincil metin | 7.6:1 (kart) |
| `pnl-faint` | `#64748B` | Üçüncül, ipucu metni | 4.8:1 (kart) |
| `pnl-line` | `#E2E8F0` | Dekoratif ayırıcı | — |
| `pnl-edge` | `#8A94A6` | **Form input kenarlığı** | 3.06:1 ✓ |
| `pnl-primary` | `#2563EB` | Birincil eylem | beyaz metinle 5.2:1 |
| `pnl-primary-dark` | `#1D4ED8` | Hover, bağlantı metni | 6.7:1 (kart) |
| `pnl-success` | `#15803D` | Tamamlandı | beyaz metinle 5.0:1 |
| `pnl-danger` | `#B91C1C` | Hata, silme | beyaz metinle 6.5:1 |
| `pnl-warn` | `#B45309` | Uyarı (eksi stok vb.) | beyaz metinle 4.7:1 |

**Kural:** Kenarlık iki türlüdür. Dekoratif ayırıcı `pnl-line` olabilir;
ama **kullanıcının sınırını görmesi gereken** her şey (input, seçilebilir
kutu) `pnl-edge` kullanır — WCAG 1.4.11 gereği 3:1 şart.

**Kural:** Renk tek başına bilgi taşımaz. Durum rozetleri her zaman metin
içerir; kâr/zarar hem renkle hem "Kâr"/"Zarar" etiketiyle gösterilir.

---

## Tipografi

**Tek font: Inter.** Başlık ve gövde aynı aile, yalnızca ağırlık değişir.
Serif yok, display font yok, ikinci aile yok.

| Rol | Boyut | Ağırlık | Not |
|---|---|---|---|
| Sayfa başlığı | 20px (`text-xl`) | 600 | Mobilde 20, masaüstünde 24 |
| Bölüm başlığı | 16px (`text-base`) | 600 | |
| Gövde | 16px (`text-base`) | 400 | **Mobilde asla 16px altına inme** |
| İkincil | 14px (`text-sm`) | 400 | Yalnızca destek metni |
| Etiket / rozet | 13px | 500 | |
| Sayı vurgusu | 28px (`text-3xl`) | 600 | Özet kartlarındaki rakam |

- Satır yüksekliği gövdede 1.5.
- Büyük punto yok: en büyük metin 28px. Panelde "etkileyici tipografi"
  aranmaz, tarama hızı aranır.
- `font-variant-numeric: tabular-nums` — tablolardaki sayılar hizalansın.

---

## Boşluk ve ölçü

4px tabanlı ölçek: `4 · 8 · 12 · 16 · 24 · 32`.

| Öğe | Değer |
|---|---|
| Sayfa kenar boşluğu (mobil) | 16px |
| Kart iç boşluğu | 16px |
| Liste satırı yüksekliği | min 64px |
| Dokunma hedefi | **min 48×48px** |
| Dokunma hedefleri arası | **min 8px** |
| Köşe yarıçapı | 8px (`rounded-lg`) — tek değer, her yerde |
| Kenarlık kalınlığı | 1px |
| Gölge | **yok** |

Tek yarıçap ve gölgesizlik bilinçli: karar sayısını azaltır, arayüz sakin
kalır.

---

## Bileşen desenleri

### Liste satırı (en çok kullanılan desen)

Müşteri, iş, ürün — hepsi aynı satır deseni. Tüm satır tıklanabilir.

```
┌──────────────────────────────────────┐
│ Birincil metin              [rozet]  │  ← 16px/600
│ İkincil bilgi                        │  ← 14px, pnl-muted
└──────────────────────────────────────┘
   min 64px yükseklik, alt kenarlık pnl-line
```

- Kart içine gömülü liste değil, **tam genişlik satırlar**. Mobilde
  kart-içinde-kart görsel gürültü yaratıyor.
- Sağda `>` işareti yok; tüm satırın tıklanabilirliği yeterli ve daha temiz.

### Arama sonucu satırı (liste satırının tersi)

Arama sonuçlarında bağlam **üstte**, bulunan kaydın adı **altta**:

```
Motor › İSMAİL ŞAHİN › 12.08.2026     ← küçük, soluk
Siemens 7.5kW Motor Sarımı   [Devam]  ← kalın
```

Panelin geri kalanında (`ListeSatiri`) ad üstte, bağlam altta. Buradaki ters
sıra bilinçli: "Motor Sarımı" diye bir sonuç tek başına hangi müşterinin
hangi ziyaretine ait olduğunu söylemiyor ve o bilgi olmadan sonuç işe
yaramıyor. Ölçüler, dokunma hedefi (64px) ve odak halkası aynı kalıyor.

Her iki tür (müşteri / motor) **aynı** satır biçimini kullanıyor; müşteri
satırında yalnızca kırılım kısa oluyor.

### Buton

Üç tür, fazlası yok:

| Tür | Görünüm | Ne zaman |
|---|---|---|
| Birincil | Dolu mavi, beyaz metin | Ekranın **tek** ana eylemi |
| İkincil | Beyaz zemin, `pnl-edge` kenarlık | Destekleyici eylemler |
| Tehlikeli | Dolu kırmızı, beyaz metin | Silme, geri alma |

- Yükseklik 48px, tam genişlik (mobil), köşe 8px.
- Gönderim sırasında devre dışı + "Kaydediliyor…" metni.
- Bir ekranda **birden fazla birincil buton olmaz**.

### Form

- Etiket **her zaman görünür**, input'un üstünde. Placeholder etiket yerine
  geçmez.
- Input yüksekliği 48px, kenarlık `pnl-edge`, odakta 2px mavi halka.
- Hata mesajı input'un **altında**, kırmızı, `aria-describedby` ile bağlı.
- Sayısal alanlarda `inputMode="decimal"` — telefonda sayı klavyesi açılsın.
- Zorunlu alan yıldızla işaretli + `sr-only` "(zorunlu)" metni.
- `type="number"` alanları tekerlek gelince odağı bırakır. Tarayıcı, odaktaki
  sayı alanında tekerleği bir adım artırma/azaltma sayıyor; kullanıcı sayfayı
  kaydırırken girdiği miktar sessizce değişiyordu (4 → 3,999). Sessiz veri
  bozulması, görünür bir hatadan çok daha kötü.

### Miktar: ekranda tek birim

Bir ürün ya adetle ya gramla izlenir; ikisi birden değil. Formda **tek bir
miktar alanı** olur ve etiketi seçilen ürüne göre değişir:

| Ürünün birimi | Etiket | Örnek metin |
|---|---|---|
| Adet | `Miktar (adet)` | `Örn: 3` |
| Gram | `Miktar (gram)` | `Örn: 250` |

Neden: "Adet" ve "Kilogram" kutuları yan yana dururken hangisinin
doldurulacağı her seferinde bir karar oluyordu. Atölyede, ayaktayken, aceleyle
verilen bir karar; yanlış kutuya yazmak da stoğu sessizce bozuyordu.

Gram tam sayıdır — virgül yok. Böylece miktar tıpkı adet gibi davranır ve
ondalık girişten kaynaklanan yuvarlama sorunları ortadan kalkar.

Fiyat bunun istisnası: gram izlenen üründe fiyat **kilogram başına** girilir
(`₺ / kilogram`), çünkü malzeme kiloyla satın alınıyor ve gram başına fiyat
iki ondalıkla yeterince hassas olmuyor. Etiket bunu açıkça yazar.

### Zorunlu seçim (radyo grubu)

İki-üç seçenekli zorunlu bir karar için açılır liste değil **radyo grubu**
kullanılır: seçenekler aynı anda görünür, tıklayıp aramak gerekmez.

- **Ön seçim yapılmaz.** Varsayılan işaretli olsa acele eden kullanıcı
  yanlış olanı onaylar. Boş başlamak kararı görünür kılar.
- Her seçenek kart gibi: 64px yükseklik, kısa bir açıklama satırı.
- Seçilen kart kenarlık + arka planla ayrışır; radyo düğmesi de görünür
  kalır (renk tek gösterge değil).
- **Gönder butonu seçim yapılmadan devre dışı** ve metni ne beklendiğini
  söyler ("Önce yapılan işlemi seçin"). `required` tek başına yeterli
  değil: tarayıcı uyarısı gösteriyor ama buton tıklanabilir kalıyor ve
  kullanıcı neden gönderilmediğini anlamıyor.
- Zorunluluk üç katmanda: form (devre dışı buton), sunucu eylemi (zod) ve
  veritabanı (fonksiyon + kısıt). Eylem doğrudan çağrılabildiği için
  formdaki kural tek başına güvence değil.

### Durum rozeti

Metin + arka plan. Renk tek başına anlam taşımaz.

| Durum | Zemin | Metin |
|---|---|---|
| Bekliyor | `#F1F5F9` | `#475569` |
| Devam ediyor | `#DBEAFE` | `#1D4ED8` |
| Tamamlandı | `#DCFCE7` | `#166534` |

### Ekleme açılırı

"Yeni X ekle" **ayrı bir bölüm değil**, listenin ilk satırı. Kapalıyken tek
satır yer kaplar, basılınca form açılır.

```
┌──────────────────────────────────────┐
│ + Yeni müşteri ekle                  │  ← açılır (listenin 1. satırı)
├──────────────────────────────────────┤
│ Test Fabrika A.Ş.                    │
│ 0266 000 00 00                       │
├──────────────────────────────────────┤
│ Öz Metal Ltd.                        │
└──────────────────────────────────────┘
```

Neden: üstte form + altta liste düzeni ekranı ikiye bölüyordu; kullanıcı
listeyi görmek için her seferinde formu geçmek zorunda kalıyordu. Panelde
liste asıl içerik, ekleme ise ara sıra yapılan bir iş.

**Liste boşsa açılır kendiliğinden açık gelir** — yapılacak tek iş odur.
Arama sonucu boşsa açılmaz; kullanıcı aramaya gelmiştir, kayıt eklemeye değil.

### Boş durum

Boş ekran bırakma. Her boş liste şunu içerir: ne olduğu, ne yapılacağı ve
yapmayı sağlayan buton.

### Geri bildirim

- Başarı: yeşil şerit, 3 saniye sonra kaybolmaz (kullanıcı okumadan gitmesin).
- Hata: kırmızı şerit, formun **üstünde**, `role="alert"`.
- Uzun işlem: butonun kendisi durum gösterir, ayrı spinner yok.

---

## Navigasyon

### Mobil (birincil)

**Alt sabit tab bar.** Dört sekme, ikon + etiket:

```
┌─────┬─────┬─────┬─────┐
│Özet │Müşt.│Stok │Rapor│
└─────┴─────┴─────┴─────┘
```

- **Özet** — açık işler. Atölyede en sık sorulan soru "şu an elimde ne var".
  İleride kısayollar da buraya gelecek.
- **Rapor** — finansal özet, aylık kâr/zarar grafiği, müşteri kırılımı, PDF.

Fatura için sekme **yok**: fatura segmentin karşılığı olduğu için segment
sayfasının içinde, işlerin hemen altında duruyor.

- Yükseklik 56px + `env(safe-area-inset-bottom)`.
- Aktif sekme: mavi ikon + mavi etiket + kalın ağırlık.
- İçerik alanına alttan 72px boşluk — bar içeriği örtmesin.
- Dört sekmeden fazlası olmaz. Beşinci bir şey gerekirse özet sayfasına
  kısayol olarak konur.

### Masaüstü

Aynı sekmeler yatay şerit hâlinde üstte. Ayrı bir sidebar tasarımı yok —
tek navigasyon modeli, iki yerleşim.

### Üst çubuk

Sol: sayfa başlığı (veya geri oku + başlık). Sağ: yalnızca gerekiyorsa tek
eylem. Logo yok — kullanıcı hangi uygulamada olduğunu zaten biliyor.

---

## Hareket

- Yalnızca durum geçişleri: 150ms renk/opaklık.
- Sayfa geçiş animasyonu, kaydırma animasyonu, giriş animasyonu **yok**.
- `prefers-reduced-motion` mutlaka desteklenir.

Landing'deki Framer Motion panelde kullanılmaz. Panelde animasyon bir
maliyettir: her etkileşimde 300ms beklemek, günde 50 kez tekrarlanan bir işte
kullanıcıyı yorar.

---

## PWA / ana ekran kısayolu

Panel telefona kısayol olarak eklenecek.

- `app/(panel)/manifest.ts` panel için ayrı manifest üretir:
  `start_url: /yonetim`, `display: standalone`, `theme_color: #F8FAFC`.
- Landing'in `site.webmanifest` dosyası **değişmez** — o pazarlama sitesinin
  manifesti.
- `viewport-fit=cover` + `env(safe-area-inset-*)` ile çentikli ekranlar.
- Tam ekran modunda tarayıcı geri tuşu olmadığı için **her alt sayfada geri
  oku bulunur**.

---

## Kaçınılacaklar

| Yapma | Neden |
|---|---|
| Landing tokenlarını (`ink`, `paper`, `silver-*`) panelde kullanma | İki sistem karışır, ayrım anlamını yitirir |
| Panel tokenlarını (`pnl-*`) müşteri belgesinde kullanma | Belge markayı temsil ediyor; panelin atölye arayüzü değil |
| Belge/giriş sayfasına pazarlama menüsü koyma | Çapa bağlantıları hedef bulamaz, ölü link olur |
| Panelde serif / display font | Tarama hızını düşürür, gereksiz süs |
| Gölge, gradient, cam efekti | Flat sistemde tutarsızlık; küçük ekranda gürültü |
| Bir ekranda iki birincil buton | Kullanıcı hangisine basacağını düşünmek zorunda kalır |
| Aynı anda iki miktar alanı (adet + gram) göstermek | Hangisinin doldurulacağı her seferinde bir karar; yanlış kutu stoğu sessizce bozar |
| Miktarda ondalık kabul etmek | Virgül/nokta karışıklığı ve yuvarlama; gram tam sayı olarak yeterli |
| Placeholder'ı etiket yerine kullanma | Yazmaya başlayınca etiket kaybolur |
| Renkle tek başına durum anlatma | Renk körlüğü ve güneş altında okunamaz ekran |
| 44px altı dokunma hedefi | Kirli/eldivenli parmakla ıskalanır |
| Arama sonucunu bağlamsız göstermek | "Motor Sarımı" hangi müşterinin, bilinmezse sonuç işe yaramaz |
| Sayfa geçiş animasyonu | Tekrar eden işte her seferinde bekleme |
| Masaüstü için ayrı navigasyon modeli | İki model bakımı, tutarsız alışkanlık |

---

## Uygulama notları

- Tokenlar: `tailwind.config.ts` → `colors.pnl`
- Font: `app/(panel)/layout.tsx` içinde `next/font` ile Inter; landing'e
  sızmaması için root layout'ta **tanımlı değil**
- Ortak bileşenler: `components/panel/`
- Landing bileşenleri (`components/home`, `components/layout`) panelde
  kullanılmaz ve tersi de geçerli
