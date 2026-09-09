import { Text, View } from "@react-pdf/renderer";
import {
  Belge,
  BilgiSatiri,
  IS_DURUM_ETIKET,
  formatPara,
  formatSayi,
  formatTarih,
  formatTarihSaat,
  stiller,
} from "./ortak";

/* ---------------------------------------------------------------------------
 * Ortak veri tipleri — sorgulardan gelen şekiller
 * ------------------------------------------------------------------------- */

export type PdfMalzeme = {
  ad: string;
  birim: "piece" | "gram";
  miktar: number;
  birimMaliyet: number;
};

export type PdfIs = {
  id: string;
  baslik: string;
  aciklama: string | null;
  durum: string;
  tamamlanmaTarihi: string | null;
  olusturmaTarihi: string;
  maliyet: number;
  /** İş başına anlaşılan tutar. NOT: hiçbir toplama girmiyor. */
  isTutari: number | null;
  malzemeler: PdfMalzeme[];
  qrToken?: string | null;
};

/** Tek bir vade — alınan para ve alındığı gün. */
export type PdfVade = {
  tarih: string;
  tutar: number;
  not: string | null;
};

/**
 * Segmentin para durumu.
 *
 * İki ayrı kavram bir arada duruyor ve karışmamalı:
 *   anlasilan     → müşteriyle konuşulan TOPLAM (fatura brütü ya da
 *                   elle girilen tutar; ikisi bir arada olamıyor)
 *   tahsilEdilen  → fiilen alınan para, vade vade
 * Farkı `kalan`. Anlaşılan hiç girilmemişse kalan null: "borç yok"
 * değil "borç bilinmiyor".
 */
export type PdfPara = {
  faturaSayisi: number;
  faturaToplam: number;
  elleGirilen: number | null;
  anlasilan: number | null;
  tahsilEdilen: number;
  kalan: number | null;
  vadeler: PdfVade[];
};

export type PdfSegment = {
  id: string;
  tarih: string;
  not: string | null;
  durum: string;
  para: PdfPara;
  isler: PdfIs[];
};

export type PdfMusteri = {
  id: string;
  ad: string;
  telefon: string | null;
  eposta: string | null;
  adres: string | null;
  vergiNo: string | null;
};

/* ---------------------------------------------------------------------------
 * İç kopya / müşteri kopyası ayrımı
 *
 * TEK bir bayrak üç şeyi birden kapatıyor ve bu bilinçli: müşteriye giden
 * bir belgede bunların hiçbiri olmamalı, dolayısıyla üçünü ayrı ayrı
 * açıp kapatmak yalnızca yanlış kombinasyona imkân verirdi.
 *
 *   1) Alış fiyatı ve maliyet   — ticari bilgi
 *   2) Malzeme MİKTARI          — QR sayfasından 0010 ile kaldırıldı,
 *                                 belgelerde unutulmuştu
 *   3) Tahsilat/ciro tutarları  — işletmenin kendi kaydı
 *
 * Müşteriye kalan: hangi işin yapıldığı, ne zaman, hangi malzemelerin
 * kullanıldığı. Şeffaflık anlatısı işin niteliğine dayanıyor, miktara
 * değil.
 * ------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
 * Paylaşılan görünümler
 * ------------------------------------------------------------------------- */

function MusteriKutusu({ musteri }: { musteri: PdfMusteri }) {
  return (
    <View style={stiller.kutu}>
      <BilgiSatiri etiket="Müşteri" deger={musteri.ad} />
      {musteri.telefon && (
        <BilgiSatiri etiket="Telefon" deger={musteri.telefon} />
      )}
      {musteri.eposta && <BilgiSatiri etiket="E-posta" deger={musteri.eposta} />}
      {musteri.adres && <BilgiSatiri etiket="Adres" deger={musteri.adres} />}
      {musteri.vergiNo && (
        <BilgiSatiri etiket="Vergi No" deger={musteri.vergiNo} />
      )}
    </View>
  );
}

/**
 * Malzeme tablosu.
 *
 * `icKopya` false ise miktar ve fiyat sütunları hiç çizilmiyor; geriye
 * numaralı malzeme adları kalıyor — müşteri QR sayfasıyla birebir aynı
 * bilgi. Miktar da ticari bilgi: hangi işe ne kadar tel girdiği
 * rakiplerin işine yarar ve müşteriye bir şey anlatmıyor.
 */
function MalzemeTablosu({
  malzemeler,
  icKopya,
}: {
  malzemeler: PdfMalzeme[];
  icKopya: boolean;
}) {
  if (malzemeler.length === 0) {
    return (
      <Text style={stiller.bosMesaj}>
        Bu işte malzeme kullanılmamıştır (yalnızca işçilik).
      </Text>
    );
  }

  return (
    <View>
      <View style={stiller.tabloBaslik}>
        <Text style={{ width: 24 }}>#</Text>
        <Text style={{ flex: 1 }}>Malzeme</Text>
        {icKopya && (
          <>
            <Text style={{ width: 100, ...stiller.sag }}>Miktar</Text>
            <Text style={{ width: 80, ...stiller.sag }}>Birim maliyet</Text>
          </>
        )}
      </View>

      {malzemeler.map((m, i) => (
        <View key={`${m.ad}-${i}`} style={stiller.tabloSatir}>
          <Text style={{ width: 24 }}>{i + 1}</Text>
          <Text style={{ flex: 1 }}>{m.ad}</Text>
          {icKopya && (
            <>
              <Text style={{ width: 100, ...stiller.sag }}>
                {`${formatSayi(m.miktar)} ${
                  m.birim === "piece" ? "adet" : "gram"
                }`}
              </Text>
              <Text style={{ width: 80, ...stiller.sag }}>
                {formatPara(m.birimMaliyet)}
              </Text>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

function IsBasligi({ is }: { is: PdfIs }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ fontWeight: "bold", fontSize: 10, flex: 1 }}>
        {is.baslik}
      </Text>
      <Text style={{ fontSize: 8, color: "#52525b" }}>
        {IS_DURUM_ETIKET[is.durum] ?? is.durum}
        {is.tamamlanmaTarihi ? ` · ${formatTarih(is.tamamlanmaTarihi)}` : ""}
      </Text>
    </View>
  );
}

/** Anlaşılan tutarı tek satırda anlatır: faturadan mı, elle mi, yok mu. */
function anlasilanMetni(para: PdfPara): string {
  if (para.faturaSayisi > 0) {
    return `${formatPara(para.faturaToplam)} (${para.faturaSayisi} fatura)`;
  }
  if (para.elleGirilen !== null) {
    return `${formatPara(para.elleGirilen)} (faturasız)`;
  }
  return "Girilmemiş";
}

/** Tahsilatı tek satırda anlatır: ne kadarı alındı, kaç vadede. */
function tahsilatMetni(para: PdfPara): string {
  if (para.vadeler.length === 0) return "Tahsilat girilmemiş";
  return `${formatPara(para.tahsilEdilen)} (${para.vadeler.length} vade)`;
}

/** Kalan borç. null = anlaşılan tutar bilinmiyor, sıfır değil. */
function kalanMetni(para: PdfPara): string {
  if (para.kalan === null) return "Anlaşılan tutar girilmemiş";
  if (para.kalan > 0) return formatPara(para.kalan);
  if (para.kalan < 0) return `${formatPara(-para.kalan)} fazla tahsilat`;
  return "Kapandı";
}

/**
 * Segmentin para bölümü — yalnızca iç kopyada.
 *
 * Üç farklı rakam bir arada duruyor ve karışmaması gerekiyor:
 *   • Anlaşılan tutar — müşteriyle konuşulan toplam (bir alacak)
 *   • Tahsilat        — fiilen alınan para, vade vade
 *   • İş tutarları    — usta not olarak girmiş, HİÇBİR hesaba girmiyor
 *
 * Vadeler tek tek yazılıyor: "3.500 alındı" yeterli değil, ne zaman
 * alındığı sorulduğunda belgeye bakılıyor.
 */
function TahsilatBolumu({ segment }: { segment: PdfSegment }) {
  const para = segment.para;
  const tutarliIsler = segment.isler.filter((i) => i.isTutari !== null);

  return (
    <View style={{ marginTop: 14 }} wrap={false}>
      <Text style={stiller.bolumBaslik}>Para durumu</Text>
      <View style={stiller.kutu}>
        <BilgiSatiri
          etiket="Anlaşılan tutar"
          deger={anlasilanMetni(para)}
        />
        <BilgiSatiri etiket="Tahsil edilen" deger={tahsilatMetni(para)} />
        <BilgiSatiri etiket="Kalan" deger={kalanMetni(para)} />
      </View>

      {para.vadeler.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 9, fontWeight: "bold", marginBottom: 3 }}>
            Vadeler
          </Text>
          {para.vadeler.map((v, i) => (
            <View key={`${v.tarih}-${i}`} style={stiller.tabloSatir}>
              <Text style={{ width: 70 }}>{formatTarih(v.tarih)}</Text>
              <Text style={{ flex: 1 }}>{v.not ?? `${i + 1}. vade`}</Text>
              <Text style={{ width: 90, ...stiller.sag }}>
                {formatPara(v.tutar)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {tutarliIsler.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 9, fontWeight: "bold", marginBottom: 3 }}>
            İş bazlı girilen tutarlar (not)
          </Text>
          {tutarliIsler.map((is) => (
            <View key={is.id} style={stiller.tabloSatir}>
              <Text style={{ flex: 1 }}>{is.baslik}</Text>
              <Text style={{ width: 90, ...stiller.sag }}>
                {formatPara(is.isTutari ?? 0)}
              </Text>
            </View>
          ))}
          <Text style={{ fontSize: 7, color: "#71717a", marginTop: 4 }}>
            İş bazlı tutarlar not amaçlıdır; anlaşılan tutara da tahsilata
            da eklenmez ve hiçbir rapora girmez.
          </Text>
        </View>
      )}
    </View>
  );
}

/* ---------------------------------------------------------------------------
 * 1) İş belgesi
 * ------------------------------------------------------------------------- */

export function IsBelgesi({
  musteri,
  segment,
  is,
  icKopya,
  qrUrl,
}: {
  musteri: PdfMusteri;
  segment: { tarih: string };
  is: PdfIs;
  icKopya: boolean;
  qrUrl?: string | null;
}) {
  return (
    <Belge belgeTuru="İş Belgesi" altBilgi={`Segment: ${formatTarih(segment.tarih)}`}>
      <MusteriKutusu musteri={musteri} />

      <Text style={stiller.bolumBaslik}>İş bilgileri</Text>
      <View style={stiller.kutu}>
        <BilgiSatiri etiket="İş" deger={is.baslik} />
        {is.aciklama && (
          <BilgiSatiri etiket="Açıklama" deger={is.aciklama} />
        )}
        <BilgiSatiri
          etiket="Durum"
          deger={IS_DURUM_ETIKET[is.durum] ?? is.durum}
        />
        <BilgiSatiri etiket="Açılış" deger={formatTarih(is.olusturmaTarihi)} />
        {is.tamamlanmaTarihi && (
          <BilgiSatiri
            etiket="Tamamlanma"
            deger={formatTarihSaat(is.tamamlanmaTarihi)}
          />
        )}
      </View>

      <Text style={stiller.bolumBaslik}>Kullanılan malzemeler</Text>
      <MalzemeTablosu malzemeler={is.malzemeler} icKopya={icKopya} />

      {icKopya && is.malzemeler.length > 0 && (
        <View style={stiller.toplamKutu}>
          <View style={stiller.toplamSatir}>
            <Text>Toplam malzeme maliyeti</Text>
            <Text style={stiller.toplamVurgu}>{formatPara(is.maliyet)}</Text>
          </View>
        </View>
      )}

      {/* İş tutarı — iç kopyada ve yalnızca girilmişse.
          "Not" olduğu açıkça yazılıyor: bu belgeye bakıp gelir toplamı
          çıkaran biri yanlış sayıya varırdı. Para segment belgesinde. */}
      {icKopya && is.isTutari !== null && (
        <View style={{ marginTop: 14 }} wrap={false}>
          <Text style={stiller.bolumBaslik}>İş tutarı (not)</Text>
          <View style={stiller.kutu}>
            <BilgiSatiri
              etiket="Bu iş için konuşulan"
              deger={formatPara(is.isTutari)}
            />
          </View>
          <Text style={{ fontSize: 7, color: "#71717a", marginTop: 4 }}>
            Elle girilen bir nottur; hiçbir gelir, tahsilat veya kâr
            hesabına girmez. Segmentin anlaşılan tutarı ve tahsilatı
            segment belgesinde yazar.
          </Text>
        </View>
      )}

      {qrUrl && (
        <View style={{ marginTop: 18 }}>
          <Text style={stiller.bolumBaslik}>Malzeme şeffaflığı</Text>
          <Text style={{ fontSize: 8, color: "#52525b" }}>
            Bu işte kullanılan malzemeleri aşağıdaki adresten
            görüntüleyebilirsiniz:
          </Text>
          <Text style={{ fontSize: 8, marginTop: 3 }}>{qrUrl}</Text>
        </View>
      )}
    </Belge>
  );
}

/* ---------------------------------------------------------------------------
 * 2) Segment belgesi
 * ------------------------------------------------------------------------- */

export function SegmentBelgesi({
  musteri,
  segment,
  icKopya,
}: {
  musteri: PdfMusteri;
  segment: PdfSegment;
  icKopya: boolean;
}) {
  const toplamMaliyet = segment.isler.reduce((a, i) => a + Number(i.maliyet), 0);
  const tamamlanan = segment.isler.filter((i) => i.durum === "completed").length;

  return (
    <Belge
      belgeTuru="Segment Belgesi"
      altBilgi={`Segment tarihi: ${formatTarih(segment.tarih)}`}
    >
      <MusteriKutusu musteri={musteri} />

      <View style={stiller.kutu}>
        <BilgiSatiri etiket="Segment" deger={formatTarih(segment.tarih)} />
        <BilgiSatiri
          etiket="Durum"
          deger={segment.durum === "open" ? "Açık" : "Kapalı"}
        />
        <BilgiSatiri
          etiket="İş sayısı"
          deger={`${segment.isler.length} iş · ${tamamlanan} tamamlandı`}
        />
        {segment.not && <BilgiSatiri etiket="Not" deger={segment.not} />}
      </View>

      {segment.isler.length === 0 ? (
        <Text style={stiller.bosMesaj}>Bu segmentte iş kaydı yok.</Text>
      ) : (
        segment.isler.map((is, i) => (
          <View
            key={is.id}
            style={{ marginTop: i === 0 ? 10 : 14 }}
            wrap={false}
          >
            <IsBasligi is={is} />
            <View style={{ marginTop: 4 }}>
              <MalzemeTablosu malzemeler={is.malzemeler} icKopya={icKopya} />
            </View>
            {icKopya && is.malzemeler.length > 0 && (
              <Text style={{ fontSize: 8, textAlign: "right", marginTop: 3 }}>
                İş maliyeti: {formatPara(is.maliyet)}
              </Text>
            )}
          </View>
        ))
      )}

      {icKopya && segment.isler.length > 0 && (
        <View style={stiller.toplamKutu}>
          <View style={stiller.toplamSatir}>
            <Text>Segment toplam maliyeti</Text>
            <Text style={stiller.toplamVurgu}>{formatPara(toplamMaliyet)}</Text>
          </View>
        </View>
      )}

      {icKopya && <TahsilatBolumu segment={segment} />}
    </Belge>
  );
}

/* ---------------------------------------------------------------------------
 * 3) Müşteri belgesi — segment/iş geçmişi
 *
 * Eskiden tek düz tabloydu ve segment tarihi yalnızca ilk iş satırında
 * yazıyordu; birden çok segment olduğunda hangi işin hangi gelişe ait
 * olduğu okunamıyordu. Artık her segment kendi bloğu: başlığında tarih,
 * durum, iş sayısı ve (iç kopyada) cirosu var.
 * ------------------------------------------------------------------------- */

function SegmentBlogu({
  segment,
  icKopya,
}: {
  segment: PdfSegment;
  icKopya: boolean;
}) {
  const tamamlanan = segment.isler.filter((i) => i.durum === "completed").length;
  const maliyet = segment.isler.reduce((a, i) => a + Number(i.maliyet), 0);
  const tutarliIsler = segment.isler.filter((i) => i.isTutari !== null);

  return (
    <View style={{ marginTop: 12 }} wrap={false}>
      {/* Segment başlığı: blok sınırı gözle görünür olmalı, yoksa
          işler yine tek bir liste gibi okunuyor. */}
      <View style={stiller.gruBaslik}>
        <Text style={{ fontWeight: "bold", fontSize: 10, flex: 1 }}>
          {formatTarih(segment.tarih)}
        </Text>
        <Text style={{ fontSize: 8, color: "#52525b" }}>
          {segment.durum === "open" ? "Açık" : "Kapalı"}
          {` · ${segment.isler.length} iş`}
          {segment.isler.length > 0 ? ` · ${tamamlanan} tamamlandı` : ""}
        </Text>
      </View>

      {segment.not && (
        <Text style={{ fontSize: 8, color: "#52525b", marginTop: 3 }}>
          {segment.not}
        </Text>
      )}

      {segment.isler.length === 0 ? (
        <Text style={{ fontSize: 8, color: "#71717a", marginTop: 4 }}>
          Bu segmentte iş kaydı yok.
        </Text>
      ) : (
        <View style={{ marginTop: 4 }}>
          {segment.isler.map((is) => (
            <View key={is.id} style={stiller.tabloSatir}>
              <Text style={{ flex: 1 }}>{is.baslik}</Text>
              <Text style={{ width: 70 }}>
                {IS_DURUM_ETIKET[is.durum] ?? is.durum}
              </Text>
              {icKopya && (
                <Text style={{ width: 75, ...stiller.sag }}>
                  {formatPara(is.maliyet)}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {icKopya && (
        <View style={{ marginTop: 4 }}>
          <View style={stiller.gruToplam}>
            <Text style={{ flex: 1, fontSize: 8 }}>
              {`Anlaşılan: ${anlasilanMetni(segment.para)} · Tahsilat: ${tahsilatMetni(
                segment.para
              )} · Kalan: ${kalanMetni(segment.para)}`}
            </Text>
            {segment.isler.length > 0 && (
              <Text style={{ fontSize: 8 }}>
                Malzeme gideri: {formatPara(maliyet)}
              </Text>
            )}
          </View>
          {tutarliIsler.length > 0 && (
            <Text style={{ fontSize: 7, color: "#71717a", marginTop: 2 }}>
              {`İş bazlı not edilen tutarlar: ${tutarliIsler
                .map((i) => `${i.baslik} ${formatPara(i.isTutari ?? 0)}`)
                .join(" · ")} (hiçbir hesaba girmez)`}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

export function MusteriBelgesi({
  musteri,
  segmentler,
  icKopya,
  aralikEtiketi,
}: {
  musteri: PdfMusteri;
  segmentler: PdfSegment[];
  icKopya: boolean;
  /**
   * Tarih aralığıyla alındıysa başlıkta yazıyor. Yazmasa belge "tüm
   * geçmiş" sanılır ve eksik bir kayıt listesi tam sayılır — muhasebe
   * tarafında bu sessiz bir hata.
   */
  aralikEtiketi?: string;
}) {
  const toplamIs = segmentler.reduce((a, s) => a + s.isler.length, 0);
  const toplamTamamlanan = segmentler.reduce(
    (a, s) => a + s.isler.filter((i) => i.durum === "completed").length,
    0
  );
  const toplamMaliyet = segmentler.reduce(
    (a, s) => a + s.isler.reduce((b, i) => b + Number(i.maliyet), 0),
    0
  );

  /* Üç ayrı toplam. Tek bir "ciro" satırı yazmak artık yanlış olurdu:
     anlaşılan para ile alınan para farklı ve aradaki fark bu belgenin
     en çok sorulan sorusu ("bu müşteri bana ne kadar borçlu"). */
  const toplamAnlasilan = segmentler.reduce(
    (a, s) => a + (s.para.anlasilan ?? 0),
    0
  );
  const toplamTahsilat = segmentler.reduce(
    (a, s) => a + s.para.tahsilEdilen,
    0
  );
  /* Fazla tahsilat başka bir segmentin borcunu kapatmıyor: her segment
     kendi başına değerlendiriliyor, negatif kalanlar sıfıra çekiliyor. */
  const toplamKalan = segmentler.reduce(
    (a, s) => a + Math.max(s.para.kalan ?? 0, 0),
    0
  );

  return (
    <Belge
      belgeTuru="Müşteri Belgesi"
      altBilgi={aralikEtiketi ? `Dönem: ${aralikEtiketi}` : undefined}
    >
      <MusteriKutusu musteri={musteri} />

      {/* Dönem iki yerde yazıyor: sayfa başında (standart yer) ve liste
          başlığında (asıl okunan yer). Üçüncü kez bilgi kutusuna da
          koymak gürültüydü; ama ikisi birden kalıyor — aralıkla alınmış
          bir belgenin tüm geçmiş sanılması sessiz bir muhasebe hatası. */}
      <View style={stiller.kutu}>
        <BilgiSatiri
          etiket="Geliş"
          deger={`${segmentler.length} segment`}
        />
        <BilgiSatiri
          etiket="İş"
          deger={`${toplamIs} iş · ${toplamTamamlanan} tamamlandı`}
        />
      </View>

      <Text style={stiller.bolumBaslik}>
        {aralikEtiketi
          ? `Segment ve iş geçmişi (${aralikEtiketi})`
          : "Segment ve iş geçmişi"}
      </Text>

      {segmentler.length === 0 ? (
        <Text style={stiller.bosMesaj}>
          {aralikEtiketi
            ? "Bu tarih aralığında kayıt yok."
            : "Bu müşteri için henüz segment açılmamış."}
        </Text>
      ) : (
        <View>
          {/* Sütun başlıkları bir kez, blokların üstünde: her segment
              bloğunda tekrarlamak sayfayı gürültüye boğuyordu. */}
          <View style={stiller.tabloBaslik}>
            <Text style={{ flex: 1 }}>İş</Text>
            <Text style={{ width: 70 }}>Durum</Text>
            {icKopya && (
              <Text style={{ width: 75, ...stiller.sag }}>Malzeme gideri</Text>
            )}
          </View>

          {segmentler.map((s) => (
            <SegmentBlogu key={s.id} segment={s} icKopya={icKopya} />
          ))}
        </View>
      )}

      {icKopya && segmentler.length > 0 && (
        <View style={stiller.toplamKutu}>
          <View style={stiller.toplamSatir}>
            <Text>Toplam anlaşılan</Text>
            <Text style={stiller.toplamVurgu}>
              {formatPara(toplamAnlasilan)}
            </Text>
          </View>
          <View style={stiller.toplamSatir}>
            <Text>Toplam tahsil edilen</Text>
            <Text style={stiller.toplamVurgu}>
              {formatPara(toplamTahsilat)}
            </Text>
          </View>
          <View style={stiller.toplamSatir}>
            <Text>Kalan alacak</Text>
            <Text style={stiller.toplamVurgu}>{formatPara(toplamKalan)}</Text>
          </View>
          <View style={stiller.toplamSatir}>
            <Text>Toplam malzeme gideri</Text>
            <Text style={stiller.toplamVurgu}>
              {formatPara(toplamMaliyet)}
            </Text>
          </View>
          {/* Kâr/zarar TAHSİLAT üzerinden: panelin gelir tanımı da bu.
              Anlaşılan tutardan hesaplansa henüz eline geçmemiş parayı
              kâr saymış olurduk. */}
          <View style={stiller.toplamSatir}>
            <Text>
              {toplamTahsilat - toplamMaliyet < 0 ? "Zarar" : "Kâr"} (tahsilat
              üzerinden)
            </Text>
            <Text style={stiller.toplamVurgu}>
              {formatPara(toplamTahsilat - toplamMaliyet)}
            </Text>
          </View>
        </View>
      )}

      {icKopya && segmentler.length > 0 && (
        <Text style={{ fontSize: 7, color: "#71717a", marginTop: 8 }}>
          Anlaşılan tutar müşteriyle konuşulan toplamdır; tahsil edilen
          fiilen alınan paradır ve farkı kalan alacaktır. Kâr/zarar tahsil
          edilen para üzerinden hesaplanır. Malzeme gideri yalnızca
          tamamlanmış işlerden gelir. İş bazlı not edilen tutarlar hiçbir
          toplama dahil değildir.
        </Text>
      )}
    </Belge>
  );
}

/* ---------------------------------------------------------------------------
 * 4) Dönemsel kâr/zarar raporu
 * ------------------------------------------------------------------------- */

export type PdfDonemMusteri = {
  ad: string;
  tahsilat: number;
  maliyet: number;
  karZarar: number;
  kalanAlacak: number;
  isSayisi: number;
};

export function DonemRaporu({
  baslangic,
  bitis,
  ozet,
  musteriler,
}: {
  baslangic: string;
  bitis: string;
  ozet: {
    tahsilat: number;
    tahsilatSayisi: number;
    anlasilan: number;
    faturaliAnlasilan: number;
    eldenAnlasilan: number;
    faturaSayisi: number;
    eldenSayisi: number;
    vergi: number;
    kalanAlacak: number;
    maliyet: number;
    karZarar: number;
    tamamlananIs: number;
  };
  musteriler: PdfDonemMusteri[];
}) {
  return (
    <Belge
      belgeTuru="Dönemsel Kâr / Zarar Raporu"
      altBilgi={`${formatTarih(baslangic)} – ${formatTarih(bitis)}`}
    >
      {/* İki blok, iki ayrı soru. Tek listede karışsalar okuyan kişi
          anlaşılan parayı tahsil edilmiş sanardı — sistemin düzelttiği
          hatanın ta kendisi. */}
      <Text style={stiller.bolumBaslik}>Tahsilat (dönemde eline geçen)</Text>
      <View style={stiller.kutu}>
        <BilgiSatiri
          etiket="Tahsil edilen"
          deger={`${formatPara(ozet.tahsilat)}  (${ozet.tahsilatSayisi} vade)`}
        />
        <BilgiSatiri
          etiket="Malzeme gideri"
          deger={`${formatPara(ozet.maliyet)}  (${ozet.tamamlananIs} tamamlanan iş)`}
        />
      </View>

      <View style={stiller.toplamKutu}>
        <View style={stiller.toplamSatir}>
          <Text>{ozet.karZarar < 0 ? "Zarar" : "Kâr"}</Text>
          <Text style={stiller.toplamVurgu}>{formatPara(ozet.karZarar)}</Text>
        </View>
      </View>

      <Text style={stiller.bolumBaslik}>Anlaşılan tutar ve alacak</Text>
      <View style={stiller.kutu}>
        <BilgiSatiri
          etiket="Dönemde anlaşılan"
          deger={formatPara(ozet.anlasilan)}
        />
        <BilgiSatiri
          etiket="— faturalı"
          deger={`${formatPara(ozet.faturaliAnlasilan)}  (${ozet.faturaSayisi} fatura)`}
        />
        <BilgiSatiri
          etiket="— faturasız"
          deger={`${formatPara(ozet.eldenAnlasilan)}  (${ozet.eldenSayisi} segment)`}
        />
        <BilgiSatiri etiket="Fatura vergisi" deger={formatPara(ozet.vergi)} />
        {/* Bakiye, dönemin akışı değil: eski aylardan devreden borçları
            da içeriyor. Etiketi bunu söylemek zorunda. */}
        <BilgiSatiri
          etiket="Kalan alacak (dönem sonu, devreden dahil)"
          deger={formatPara(ozet.kalanAlacak)}
        />
      </View>

      <Text style={stiller.bolumBaslik}>Müşteri bazlı kırılım</Text>

      {musteriler.length === 0 ? (
        <Text style={stiller.bosMesaj}>
          Bu dönemde tahsilatı, tamamlanmış işi veya açık alacağı olan
          müşteri yok.
        </Text>
      ) : (
        <View>
          <View style={stiller.tabloBaslik}>
            <Text style={{ flex: 1 }}>Müşteri</Text>
            <Text style={{ width: 30, ...stiller.sag }}>İş</Text>
            <Text style={{ width: 72, ...stiller.sag }}>Tahsilat</Text>
            <Text style={{ width: 72, ...stiller.sag }}>Gider</Text>
            <Text style={{ width: 72, ...stiller.sag }}>Kâr / Zarar</Text>
            <Text style={{ width: 72, ...stiller.sag }}>Alacak</Text>
          </View>

          {musteriler.map((m, i) => (
            <View key={`${m.ad}-${i}`} style={stiller.tabloSatir}>
              <Text style={{ flex: 1 }}>{m.ad}</Text>
              <Text style={{ width: 30, ...stiller.sag }}>{m.isSayisi}</Text>
              <Text style={{ width: 72, ...stiller.sag }}>
                {formatPara(m.tahsilat)}
              </Text>
              <Text style={{ width: 72, ...stiller.sag }}>
                {formatPara(m.maliyet)}
              </Text>
              <Text
                style={{ width: 72, ...stiller.sag, fontWeight: "bold" }}
              >
                {formatPara(m.karZarar)}
              </Text>
              <Text style={{ width: 72, ...stiller.sag }}>
                {formatPara(m.kalanAlacak)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={{ fontSize: 7, color: "#71717a", marginTop: 12 }}>
        Gelir NAKİT esaslıdır: ölçüt paranın alındığı gün, fatura tarihi
        değil. Kâr/zarar bu yüzden tahsil edilen para üzerinden hesaplanır.
        Anlaşılan tutar faturaların brütü ile faturasız segment
        tutarlarından oluşur; bir segmentte ikisi birden olamaz, çifte
        sayım yoktur. İş bazlı not edilen tutarlar hiçbir hesaba girmez.
        Malzeme gideri yalnızca tamamlanmış işlerden hesaplanır;
        tamamlanmamış işlerin malzemesi henüz stoktan düşülmediği için
        gerçekleşmiş gider sayılmaz. Kalan alacak bir bakiyedir: dönem
        içinde doğmayan, önceki aylardan devreden borçları da içerir.
      </Text>
    </Belge>
  );
}
