# Altınöz Bobinaj — Kurumsal Landing Page

Balıkesir Karesi'de faaliyet gösteren Altınöz Bobinaj'ın tek sayfalık kurumsal
web sitesi. Next.js App Router üzerinde, SEO ve yerel arama görünürlüğü
önceliklendirilerek geliştirildi.

## Teknoloji

| Katman | Seçim |
|---|---|
| Framework | Next.js 16 (App Router) |
| Dil | TypeScript |
| Styling | Tailwind CSS 3 |
| Animasyon | Framer Motion |
| İkonlar | lucide-react |
| Analytics | Google Analytics 4 |
| Deploy | Vercel |

## Geliştirme

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint    # eslint
```

## Ortam Değişkenleri

Kök dizinde `.env` dosyası:

```
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

GA ID tanımlı değilse Google Analytics script'i hiç yüklenmez.

## Dizin Yapısı

```
app/
  layout.tsx        # html/body, fontlar, GA (her rota icin ortak)
  globals.css       # Tailwind katmanlari + base stiller
  not-found.tsx     # 404
  robots.ts         # robots.txt
  sitemap.ts        # sitemap.xml
  (site)/           # pazarlama sitesi — header/footer/cagri bari
    layout.tsx      #   site metadata, OG/Twitter, JSON-LD
    page.tsx        #   bolumlerin sirasi
    opengraph-image.tsx
  giris/            # personel girisi
  yonetim/          # yonetim paneli (korumali)
  j/[token]/        # QR ile acilan salt-okunur malzeme sayfasi
components/
  layout/           # Header (mobil menu dahil), Footer, MobileCallBar
  home/             # Hero, Services, About, References, Contact
  yonetim/          # panel formlari ve ortak arayuz parcalari
lib/
  scroll.ts         # header offset'li yumusak kaydirma (tek kaynak)
  motion.ts         # paylasilan Framer Motion varyantlari
  supabase/         # istemciler, middleware, veritabani tipleri
  actions/          # server action'lar
  validation/       # zod semalari
supabase/
  migrations/       # SQL sema, fonksiyonlar, RLS politikalari
  tests/            # yerel Postgres davranis testleri
  README.md         # kurulum ve mimari kararlar
middleware.ts       # oturum yenileme + panel korumasi
public/images/referanslar/   # referans galerisi gorselleri
scripts/            # yardimci script'ler ve sema testi
ark/, ark.webp/     # yerel gorsel calisma klasorleri (gitignore'da)
```

## Yönetim Paneli

Müşteri → segment → iş → malzeme akışı, stok takibi ve QR ile malzeme
şeffaflığı. Kurulum ve mimari kararlar: [`supabase/README.md`](supabase/README.md).

Panel Supabase yapılandırılmadan da derlenir; `/yonetim` bu durumda
kurulum talimatını gösterir.

## Testler

```bash
npm run e2e              # Playwright uçtan uca testler
npx tsx scripts/sema-testi.ts   # zod form doğrulama şemaları
```

Veritabanı davranış testleri için bkz. [`supabase/README.md`](supabase/README.md).

| Katman | Kapsam |
|---|---|
| `e2e/landing.spec.ts` | Başlık hiyerarşisi, SEO/JSON-LD, klavye erişimi, 404, OG görseli |
| `e2e/mobil.spec.ts` | Hamburger menü, sabit çağrı barı, dokunma hedefleri, taşma |
| `e2e/guvenlik.spec.ts` | Panel koruması, API yetkilendirme, RLS, bilgi sızıntısı |
| `e2e/panel.spec.ts` | Müşteri→segment→iş→stok→fatura→PDF akışının tamamı |

`e2e/panel.spec.ts` bir personel hesabı gerektirir; `.env` içinde
`E2E_TEST_EPOSTA` / `E2E_TEST_SIFRE` tanımlı değilse o dosya atlanır.
**Testler gerçek veritabanına kayıt oluşturur** — üretim projesinde değil,
ayrı bir test projesinde veya ayrı bir hesapla çalıştırın.

## Tasarım Sistemi

Renkler `tailwind.config.ts` içinde token olarak tanımlı; komponentlerde
hardcoded hex kullanılmaz.

| Token | Değer | Kullanım |
|---|---|---|
| `ink` | `#09090b` | Sayfa zemini |
| `ink-soft` | `#18181b` | Kart / yüzey zemini |
| `paper` | `#fafafa` | Ana metin |
| `paper-muted` | `#a1a1aa` | İkincil metin |
| `silver-light/main/dark` | `#F8FAFC` / `#94A3B8` / `#475569` | Vurgu |
| `bg-silver-gradient` | 3 duraklı gradient | Dekoratif (metin maskesi) |
| `bg-silver-cta` | 2 duraklı açık gradient | CTA zemini — üstünde `text-ink` |

> `bg-silver-gradient` üzerine beyaz metin yazılmamalı: gradient'in açık
> ucunda kontrast WCAG AA'nın altına düşer. CTA'lar için `bg-silver-cta` +
> `text-ink` kullanılır.

## SEO Notları

- Tek `<h1>` Hero'da; bölüm başlıkları `<h2>`, kart/hizmet başlıkları `<h3>`.
  Görsel tasarımda gizlenen bölüm başlıkları `sr-only` olarak verilir, boş
  heading bırakılmaz.
- Tüm görseller `next/image` ile, anahtar kelime içeren `alt` metinleriyle.
- `layout.tsx` içinde iki JSON-LD bloğu: işletme bilgisi (`ProfessionalService`)
  ve referans görselleri (`ItemList`).
- Adres, telefon ve çalışma saatleri footer'da metin olarak da bulunur.

## Bilinen Açık İşler

- Referans galerisindeki 22 görsel `loading="eager"` ile yükleniyor ve kaynak
  dosyalar gösterildikleri boyuttan çok büyük (LCP'yi etkiliyor).
- Sosyal medya hesapları müşteriden gelince footer'a eklenmeli.
- Admin paneli / iş takip modülü: bkz. `prd.md`.
