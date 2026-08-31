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
  layout.tsx        # metadata, OG/Twitter, JSON-LD (ProfessionalService + ItemList), fontlar
  page.tsx          # bölümlerin sırası
  not-found.tsx     # 404
  robots.ts         # robots.txt
  sitemap.ts        # sitemap.xml
  globals.css       # Tailwind katmanları + base stiller
components/
  layout/           # Header (mobil menü dahil), Footer
  home/             # Hero, Services, About, References, Contact
  GoogleAnalytics.tsx
lib/
  scroll.ts         # header offset'li yumuşak kaydırma (tek kaynak)
  motion.ts         # paylaşılan Framer Motion varyantları
public/images/referanslar/   # referans galerisi görselleri
scripts/            # tek seferlik yardımcı script'ler
ark/, ark.webp/     # yerel görsel çalışma klasörleri (gitignore'da)
```

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
