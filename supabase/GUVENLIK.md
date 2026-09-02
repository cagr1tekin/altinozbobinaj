# Güvenlik — durum, kurulum ve sınırlar

Bu dosya iki soruyu cevaplıyor: **ne korunuyor** ve **neyin korunmadığını
bilerek kabul ettik**. İkincisi en az birincisi kadar önemli — yanlış bir
güvenlik hissi, açık bir zafiyetten daha tehlikeli olabilir.

---

## Kurulum sonrası ZORUNLU adımlar

`supabase/kurulum-tumu.sql` çalıştırıldıktan sonra üçü de yapılmalı.

### 1. Kayıt (signup) kapatılmalı

Supabase Dashboard → **Authentication → Sign In / Providers** →
**"Allow new users to sign up"** → **KAPALI**.

Bu birincil kontrol. Veritabanı tarafında ikinci bir katman var
(`izinli_epostalar` + `auth.users` trigger'ı) ama ikisi birlikte olmalı:
panel ayarı yanlışlıkla açılırsa trigger devreye giriyor, trigger
kurulamadıysa panel ayarı koruyor.

Kurulum çıktısında şunu arayın:

```
NOTICE: Signup engeli kuruldu: izinli_epostalar listesi disinda hesap acilamaz.
```

Bunun yerine "UYARI: auth.users uzerinde trigger olusturulamadi" görürseniz
veritabanı katmanı kurulmamış demektir; panel ayarı tek koruma olarak kalır.

### 2. Yeni personel nasıl eklenir

Sıra önemli — ters yaparsanız hesap oluşturma reddedilir:

```sql
-- 1) Önce izin ver
insert into izinli_epostalar (eposta, not_)
values ('yeni.personel@ornek.com', 'Atolye calisani');
```

Sonra Supabase Dashboard → Authentication → Users → **Add user**.

Personel ayrılırsa: Dashboard'dan kullanıcıyı silin **ve** listeden çıkarın.

```sql
delete from izinli_epostalar where eposta = 'ayrilan@ornek.com';
```

### 3. Vercel ortam değişkenleri

`NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_ANON_KEY` aynı projeye
ait olmalı. Uyuşmazlarsa panel çalışmaz ve güvenlik testleri hiçbir şey
ölçmez (bkz. `e2e/guvenlik.spec.ts` içindeki `anahtarCalisiyorMu`).

---

## Korunan neler

| Katman | Ne yapıyor |
|---|---|
| **Silme yok** | Hiçbir tablo fiziksel olarak silinemiyor. RLS'te DELETE politikası yok, tablo yetkisi de geri alınmış — iki katman. Silme işlemi `deleted_at` işaretliyor. |
| **Salt-eklenir kayıtlar** | `stock_movements`, `audit_log`, `monthly_summaries`, `login_log` değiştirilemiyor ve silinemiyor. |
| **Denetim günlüğü** | Her veri değişikliği trigger ile yazılıyor — SQL Editor'den elle yapılan bir düzeltme bile. Personel günlüğü değiştiremiyor. |
| **RLS her tabloda** | `public` şemasındaki 12 tablonun hepsinde açık; `anon` rolünün hiçbirine erişimi yok. |
| **anon yüzeyi** | Yalnızca 2 fonksiyon: `public_job_by_token` (QR sayfası, ticari bilgi döndürmez) ve `giris_kaydet` (yalnızca INSERT, `void` döner). |
| **Kayıt engeli** | İzinli e-posta listesi dışında hesap açılamıyor. Liste personel için salt-okunur — kendine yetki verme yolu kapalı. |
| **Coğrafi filtre** | Panel yalnızca Türkiye'den açılıyor. Landing ve müşteri belgesi etkilenmiyor. |
| **Giriş günlüğü** | Her başarılı giriş ülke ve maskeli IP ile kaydediliyor. |
| **Güvenlik başlıkları** | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS. |
| **Service role yok** | Uygulama hiçbir yerde service_role anahtarı kullanmıyor; sızsa bile RLS baypası mümkün değil. |

---

## Bilinen sınırlar — bilerek kabul edilenler

### Coğrafi kısıt bir FİLTREdir, sınır değil

Ülke bilgisi IP'den geliyor. **Türkiye çıkışlı bir VPN bu kontrolü geçer.**
Değeri şurada: otomatik tarayıcıların ve yurt dışı kaba kuvvet
denemelerinin ezici çoğunluğu VPN kullanmıyor, onlar giriş formuna
ulaşmadan kesiliyor. Gerçek sınır kimlik doğrulama ve RLS.

**Ülke okunamazsa içeri alınıyor.** Başlık her ortamda gelmiyor (yerel
geliştirme, bazı kurumsal ağlar, Vercel dışı bir dağıtım) ve "bilinmiyorsa
reddet" demek işletmenin kendi panelinden kilitlenmesi riski demek. Bu
girişler günlüğe `unknown_country` olarak yazılıyor.

Katılaştırmak isterseniz: `lib/guvenlik/konum.ts` içinde
`BILINMEYENI_ENGELLE = true`. Riski yukarıda.

### Oturum açmış personel tüm veriyi görebiliyor

RLS politikaları `authenticated` rolüne her satırı okutuyor. İşletmede 1-3
kişi çalıştığı ve hepsi zaten her müşteriyi bildiği için rol ayrımı
yapılmadı. Personel sayısı artar ve "kim neyi görsün" sorusu oluşursa
politikalar kullanıcı kimliğine bağlanmalı.

### Başarısız giriş denemeleri kaydedilmiyor

Bilinçli: e-posta + zaman damgası birikimi, saldırgan günlüğü ele geçirirse
hangi adreslerin denendiğini gösterir. Kaba kuvvete karşı Supabase'in kendi
oran sınırı devrede.

### Yumuşak silme geri alma arayüzü yok

Yanlışlıkla silinen kayıt SQL Editor'den tek satırla geri geliyor:

```sql
update customers set deleted_at = null where id = '...';
```

Arayüze "silinenler" ekranı koymak listeleme ve yetkilendirme demek; nadir
bir ihtiyaç için bugün gerekli görülmedi.

---

## Denetim nasıl tekrarlanır

```bash
# 1) Sıfırdan kurulum + tekrar çalıştırılabilirlik
docker exec altinoz-pg psql -U postgres -c "create database denetim;"
docker cp supabase/tests/00_supabase_shim.sql altinoz-pg:/tmp/s.sql
docker exec altinoz-pg psql -U postgres -d denetim -f /tmp/s.sql
docker cp supabase/kurulum-tumu.sql altinoz-pg:/tmp/k.sql
for n in 1 2 3; do
  docker exec altinoz-pg psql -U postgres -d denetim -f /tmp/k.sql 2>&1 | grep -i "ERROR:"
done

# 2) Güvenlik testleri (22 doğrulama)
docker cp supabase/tests/09_guvenlik_test.sql altinoz-pg:/tmp/t9.sql
docker exec altinoz-pg psql -U postgres -d denetim -v ON_ERROR_STOP=1 -f /tmp/t9.sql

# 3) Yetki testleri (anon yüzeyi)
docker cp supabase/tests/04_yetki_test.sql altinoz-pg:/tmp/t4.sql
docker exec altinoz-pg psql -U postgres -d denetim -v ON_ERROR_STOP=1 -f /tmp/t4.sql

# 4) Başlıklar ve coğrafi kısıt
npx playwright test e2e/guvenlik-katmani.spec.ts
```

**Yeni bir tablo veya fonksiyon eklendiğinde** 04 ve 09 numaralı testler
mutlaka çalıştırılmalı: ikisi de "anon ne görebiliyor" ve "ne silinebiliyor"
sorularını otomatik soruyor.
