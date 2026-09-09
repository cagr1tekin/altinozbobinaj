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

Fiyat **alım anında** soruluyor, ürün tanımlanırken değil: bir malzemenin
fiyatı ancak alındığında belli oluyor. Bu yüzden yeni ürün formu miktar ve
fiyatı birlikte istiyor, ürün düzenleme formunda fiyat hiç yok.

### Yön seçimi: işareti kullanıcıya yazdırma

Bir sayı hem artı hem eksi olabiliyorsa, işareti kullanıcı yazmaz — **iki
düğmeyle yön seçilir, miktar her zaman pozitif girilir.**

Stok hareketinde bu şöyle görünüyor: "Stok girdi / Stok çıktı" iki büyük
düğme, altında tek bir pozitif miktar alanı. Gönderilen değerin işaretini
gizli alan taşıyor.

Neden: "-3" yazdırmak sahada iki hataya yol açıyordu — eksiyi unutmak
(çıkış giriş olarak kaydediliyordu) ve girişe eksi yazmak. İkisi de ancak
sayımda fark ediliyor.

Yön ayrıca **hangi alanların görüneceğini** belirleyebilir: girişte alış
fiyatı sorulur, çıkışta sorulmaz (çıkış bir alım değil).

İşaret kuralı `lib/bicim.ts` içindeki `stokIsareti()` fonksiyonunda,
bileşenin içinde değil: sessizce ters yönde bir hareket yazacak kadar
kritik, test edilebilir olmalı.

### Birbirini dışlayan iki yol

İki yoldan yalnızca biri geçerliyse (segment cirosu: **ya** fatura **ya**
elle tutar), doğru davranış hata mesajı değil **kapalı kapı**:

- Biri doldurulduğunda öbürünün formu hiç açılmaz; yerinde tek satırlık bir
  açıklama durur ("Elden tutar girildiği için fatura yüklenemiyor").
- Açıklama çıkış yolunu da söyler: "Fatura kesilecekse aşağıdan tutarı
  boşaltın."
- Bölüm başlığının altındaki açıklama hangi yolun seçildiğini yazar.

Neden: kullanıcının formu doldurup gönderdikten sonra reddedilmesi, hem
emeği boşa çıkarıyor hem "neden" sorusunu cevapsız bırakıyor. Kural yine de
veritabanında duruyor — arayüz kuralı *görünür* kılıyor, *uygulamıyor*.

### Hesaba girmeyen alan

Bir alan yalnızca not niteliğindeyse bunu **alanın kendi ipucunda** yazmak
gerekiyor ("Not amaçlıdır, raporlardaki ciroya girmez"). Yazılmazsa oraya
girilen para raporlarda aranır ve bulunamaz; kullanıcı da veriyi değil
uygulamayı bozuk sanır.

Aynı cümle nerede *girildiğini* de söylemeli ("Ciro segment sayfasından
girilir").

### Açıklamalar bilgi ikonunun arkasında

Panelde her ekranda öğretici metin vardı ("bu alan şuna yarar", "şu neden
böyle"). İlk kullanımda gerekliydi ama her gün aynı ekrana bakan biri için
okunacak bir şey değil: yalnızca göz yoruyor ve asıl veriyi aşağı itiyordu.

Metin **silinmiyor**, bir ⓘ düğmesinin arkasına giriyor. Bilen görmüyor,
öğrenmek isteyen açıyor.

İki tür alt metin var ve karıştırılmamalı:

| | Nerede | Örnek |
|---|---|---|
| **Veri** (`aciklama`) | Her zaman görünür | "3 fatura · 4.500 TL", "01.08 – 01.09", "6.500 kaldı" |
| **Öğretici** (`bilgi`) | İkonun arkasında | "her ziyaret bir segment", "filtre açık işleri etkilemez" |

Kurallar:

- Panel DOM'da her zaman duruyor (`hidden` ile gizleniyor, koşullu render
  değil): `aria-describedby` ile bağlı olduğu için ekran okuyucu kapalıyken
  de metne ulaşabilmeli.
- İkonun **erişilebilir adı zorunlu**: tek başına bir simge ekran
  okuyucuda "düğme" diye okunur. Ad neyin açıklaması olduğunu söyler
  (`"Segmentler — açıklama"`).
- `aria-expanded` durumu taşıyor; ikon açıkken renk değiştiriyor.
- **Boş durum metinleri ikonun arkasına GİRMİYOR.** Ekranda başka bir şey
  yokken "ne yapmalıyım" sorusunun cevabı ekranın kendisidir; gizlemek
  boş bir ekran bırakırdı.
- **Hata ve uyarı metinleri de girmiyor**: onlar öğretici değil, o an
  yapılacak işi söylüyor.

### Para: anlaşılan tutar ile tahsilat ayrı bölümler

Bir segmentte iki ayrı soru var ve tek bölümde birleştirmek sistemin eski
hatasıydı (fatura yüklemek "para alındı" saymak):

1. **Ne kadara anlaştık?** → fatura ya da elle girilen tutar
2. **Ne kadarını aldık?** → vadeler

İkisi ekranda da ayrı duruyor. Tahsilat bölümünün başlığı üç rakamı
birlikte yazıyor: alınan, vade sayısı, kalan. Yalnızca "3 vade" yazmak
asıl soruyu ("ne kadar borcu var") cevapsız bırakırdı.

**Kalan yalnızca biliniyorsa yazılıyor.** Anlaşılan tutar girilmemişken
"0 TL kaldı" demek "borcu yok" demek olurdu; doğrusu "borcu bilinmiyor".

**Kalan tutar forma hazır yazılmıyor**, yalnızca placeholder'da söyleniyor:
"tamamını aldım" ile "bir kısmını aldım" arasındaki fark bu ekranın tek
sebebi; hazır yazmak tek vadeye geri dönmenin kolay yolu olurdu.

### Öneri, kayıt değil

Segmentin anlaşılan tutar alanına, o segmentteki işlere not olarak girilmiş
tutarların toplamı **hazır geliyor** — ama yalnızca alan **hiç
kaydedilmemişken**. Kaydedilmiş bir değerin üzerine öneri yazmak
kullanıcının kararını sessizce geri almak olurdu.

Önerinin öneri olduğu ayrıca yazılıyor ("hazır yazıldı, doğru değilse
değiştirin"): kullanıcı rakamın nereden geldiğini tahmin etmek zorunda
kalmamalı.

### İç kopya / müşteri kopyası

Müşteriye giden bir belgede işletmenin ticari bilgisi **hiç** olmamalı.
Bu üç şey birlikte gizleniyor, tek bayrakla:

1. Alış fiyatı ve maliyet
2. Malzeme **miktarı** — "hangi işe ne kadar tel girdi" rakibin işine
   yarar, müşteriye bir şey anlatmaz
3. Tahsilat ve ciro tutarları

Üçünü ayrı ayrı açıp kapatmak yalnızca yanlış kombinasyona imkân
verirdi; tek karar noktası bırakmak doğru olan.

Müşteriye kalan: hangi iş yapıldı, ne zaman, hangi malzemeler kullanıldı.
Şeffaflık anlatısı işin niteliğine dayanıyor, miktara değil — QR sayfası
da tam bunu gösteriyor, iki yüzey tutarlı.

**İki ayrı buton, tek buton + onay kutusu değil.** Onay kutusuyla yanlış
kopya yazdırmak "bir kere tıklamamakla" olurdu; ayrı butonda hangisinin
verildiği bilinçli bir seçim.

**Bayrak adı geçmişten geliyor** (`maliyet=0`) ve bilinçli olarak
değiştirilmiyor: açık bir sekmedeki eski bağlantı yeni adı bilmezse
müşteri kopyası sessizce iç kopyaya dönerdi.

### Liste belgelerinde tarih aralığı

Liste içeren belgelerde (müşteri belgesi, dönem raporu) baş/bitiş tarihi
seçilebiliyor; tek bir işin ya da tek bir segmentin belgesinde aralık
sormanın karşılığı yok ve alan hiç görünmüyor.

İki kural:

- **Aralıkla alınan belge bunu yazar.** Yazmasa "tüm geçmiş" sanılır ve
  eksik bir liste tam sayılır — muhasebe tarafında sessiz bir hata.
- **Yarım ya da ters aralık reddedilir**, sessizce tüm geçmişe
  düşmez. Kullanıcı aralık verdiyse sınırlamak istiyor; beklediğinden
  fazlasını içeren bir belgeyi müşteriye vermek gerçek bir sızıntı.

### Filtre neyi filtrelemez

Özet'teki tarih filtresi **tamamlanan** işlere uygulanıyor, açık işlere
değil. İki ay önce açılmış ve hâlâ bitmemiş bir iş unutulmuş demektir ve
ekrandan kaybolması gereken en son şeydir. Filtre listeyi sınırlamak için
var; açık işleri sınırlamak amaca ters düşerdi. Bölüm açıklaması bunu
yazıyor ("tarih filtresinden etkilenmez") — kullanıcı neyin filtrelendiğini
tahmin etmek zorunda kalmamalı.

Filtre bağlantıları **diğer parametreleri korur**: dönem değiştirmek arama
terimini sıfırlarsa kullanıcı terimi yeniden yazmak zorunda kalıyor. GET
formu URL'deki parametreleri düşürdüğü için gizli alan olarak taşınıyor.

### Aynı bilgi iki ekranda: tek alan, tek kolon

İş tutarı hem iş açılırken hem tamamlanırken girilebiliyor. İkisi **aynı
alan**: aynı kolona yazıyor ve açılışta girilen değer tamamlama formunda
hazır geliyor (değiştirilebilir — iş sırasında pazarlık değişebilir).

İki ayrı alan olsaydı hangisinin geçerli olduğu belirsiz kalırdı. Fiyat
çoğu zaman iş alınırken konuşuluyor, kapatılırken değil; ama iş bittiğinde
değişmiş olabilir. Alanın ipucu değerin nereden geldiğini söylüyor.

### Zorunlu seçim (kart listesi)

İki-üç seçenekli zorunlu bir karar için açılır liste kullanılmaz;
seçenekler aynı anda görünür, tıklayıp aramak gerekmez.

**Radyo mu, onay kutusu mu?** Seçenekler gerçekten birbirini dışlıyorsa
radyo, birlikte geçerli olabiliyorsa onay kutusu. İşlem türü onay kutusu:
bir motora aynı ziyarette hem sarım hem revizyon yapılabiliyor. Onay
kutusunda `required` KULLANILMAZ — her kutuyu tek tek zorunlu yapar;
"en az biri" kuralı butonun devre dışı olmasıyla sağlanır.

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
| Kullanıcıya eksi işareti yazdırmak | Unutulur ya da fazladan yazılır; yön iki düğmeyle seçilir |
| Birbirini dışlayan iki formu birlikte açık bırakmak | Doldurup gönderdikten sonra reddedilmek emeği boşa çıkarır |
| Hesaba girmeyen bir alanı sessizce koymak | Girilen değer raporlarda aranır, bulunamaz, uygulama bozuk sanılır |
| Bir kararı iki ekrana bölmek (ürün tanımı / fiyat) | Yarım kalır: fiyatı hiç girilmemiş ürün kalır geriye |
| Müşteri belgesinde malzeme miktarı göstermek | Ticari bilgi; QR sayfasında gizli, belgede göstermek tutarsız |
| Aralıkla alınan belgede dönemi yazmamak | Eksik liste "tüm geçmiş" sanılır |
| Yarım/ters tarih aralığında sessizce tüm veriyi getirmek | Kullanıcı sınırlamak istedi; fazlası müşteriye giderse sızıntı |
| Açık işleri tarih filtresine sokmak | Unutulmuş eski iş ekrandan kaybolur — filtrenin amacına ters |
| Filtre bağlantısında arama terimini düşürmek | Kullanıcı her dönem değişiminde terimi yeniden yazar |
| Aynı bilgi için iki ayrı alan (iş açılışı / tamamlama tutarı) | Hangisinin geçerli olduğu belirsiz kalır |
| Öğretici metni ekranda sürekli göstermek | Her gün aynı ekrana bakan kişi için gürültü; veriyi aşağı iter |
| Boş durum ya da hata metnini ikonun arkasına gizlemek | Orada metin zaten tek içerik; gizlemek boş ekran bırakır |
| Anlaşılan tutarı "alındı" saymak | Tek vade varsayımı; gerçek ödeme parça parça geliyor |
| Anlaşılan tutar girilmemişken "0 kaldı" yazmak | "Borcu yok" demek olur; doğrusu "borcu bilinmiyor" |
| Kalan tutarı tahsilat formuna hazır yazmak | Tek vadeye dönmenin kolay yolu; kısmi ödeme görünmez olur |
| Kaydedilmiş bir alanın üstüne öneri yazmak | Kullanıcının kararını sessizce geri alır |
| Para girişini işin tamamlanmasına bağlamak | Peşin ödeme ve geç ödeme gerçek; ikisi de engellenmiş olur |
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
