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
  /** İş başına alınan tutar. NOT niteliğinde: hiçbir toplama girmiyor. */
  alinanTutar: number | null;
  malzemeler: PdfMalzeme[];
  qrToken?: string | null;
};

/**
 * Segment cirosu: YA fatura YA elle alınan tutar.
 *
 * İkisi bir arada olamıyor (veritabanı trigger'ı engelliyor), o yüzden
 * belgede tek bir tahsilat satırı yazılıyor — hangisi doluysa o.
 */
export type PdfCiro = {
  faturaSayisi: number;
  faturaToplam: number;
  eldenTutar: number | null;
};

export type PdfSegment = {
  id: string;
  tarih: string;
  not: string | null;
  durum: string;
  ciro: PdfCiro;
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

/** Segmentin cirosunu tek satırda anlatır: fatura mı, elden mi, yok mu. */
function ciroMetni(ciro: PdfCiro): string {
  if (ciro.faturaSayisi > 0) {
    return `${formatPara(ciro.faturaToplam)} (${ciro.faturaSayisi} fatura)`;
  }
  if (ciro.eldenTutar !== null) {
    return `${formatPara(ciro.eldenTutar)} (faturasız, elden)`;
  }
  return "Girilmemiş";
}

/**
 * Segmentin tahsilat bölümü — yalnızca iç kopyada.
 *
 * İki farklı para bir arada duruyor ve karışmaması gerekiyor:
 *   • Segment cirosu — gerçek gelir, raporlara giren tutar
 *   • İş tutarları  — usta not olarak girmiş, HİÇBİR hesaba girmiyor
 *
 * İkisinin toplanmaması bilinçli; alt not bunu yazıyor, yoksa okuyan
 * kişi ikisini toplar ve ciroyu iki kez sayar.
 */
function TahsilatBolumu({ segment }: { segment: PdfSegment }) {
  const tutarliIsler = segment.isler.filter((i) => i.alinanTutar !== null);

  return (
    <View style={{ marginTop: 14 }} wrap={false}>
      <Text style={stiller.bolumBaslik}>Tahsilat</Text>
      <View style={stiller.kutu}>
        <BilgiSatiri etiket="Segment cirosu" deger={ciroMetni(segment.ciro)} />
      </View>

      {tutarliIsler.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 9, fontWeight: "bold", marginBottom: 3 }}>
            İş bazlı girilen tutarlar (not)
          </Text>
          {tutarliIsler.map((is) => (
            <View key={is.id} style={stiller.tabloSatir}>
              <Text style={{ flex: 1 }}>{is.baslik}</Text>
              <Text style={{ width: 90, ...stiller.sag }}>
                {formatPara(is.alinanTutar ?? 0)}
              </Text>
            </View>
          ))}
          <Text style={{ fontSize: 7, color: "#71717a", marginTop: 4 }}>
            İş bazlı tutarlar not amaçlıdır; segment cirosuna eklenmez ve
            hiçbir rapora girmez. Gerçek gelir yukarıdaki segment cirosudur.
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
          "Not" olduğu açıkça yazılıyor: bu belgeye bakıp ciro toplamı
          çıkaran biri yanlış sayıya varırdı. Ciro segment belgesinde. */}
      {icKopya && is.alinanTutar !== null && (
        <View style={{ marginTop: 14 }} wrap={false}>
          <Text style={stiller.bolumBaslik}>Alınan tutar (not)</Text>
          <View style={stiller.kutu}>
            <BilgiSatiri
              etiket="Bu iş için alınan"
              deger={formatPara(is.alinanTutar)}
            />
          </View>
          <Text style={{ fontSize: 7, color: "#71717a", marginTop: 4 }}>
            Elle girilen bir nottur; hiçbir ciro, kâr veya rapor hesabına
            girmez. Segmentin gerçek cirosu segment belgesinde yazar.
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
  const tutarliIsler = segment.isler.filter((i) => i.alinanTutar !== null);

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
              Ciro: {ciroMetni(segment.ciro)}
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
                .map((i) => `${i.baslik} ${formatPara(i.alinanTutar ?? 0)}`)
                .join(" · ")} (ciroya eklenmez)`}
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

  /* Ciro toplamı: fatura varsa faturadan, yoksa elden tutardan. İkisi bir
     arada olamıyor, o yüzden basit toplama yeterli — çifte sayım yok. */
  const toplamCiro = segmentler.reduce(
    (a, s) =>
      a +
      (s.ciro.faturaSayisi > 0
        ? s.ciro.faturaToplam
        : (s.ciro.eldenTutar ?? 0)),
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
            <Text>Toplam ciro</Text>
            <Text style={stiller.toplamVurgu}>{formatPara(toplamCiro)}</Text>
          </View>
          <View style={stiller.toplamSatir}>
            <Text>Toplam malzeme gideri</Text>
            <Text style={stiller.toplamVurgu}>
              {formatPara(toplamMaliyet)}
            </Text>
          </View>
          <View style={stiller.toplamSatir}>
            <Text>{toplamCiro - toplamMaliyet < 0 ? "Zarar" : "Kâr"}</Text>
            <Text style={stiller.toplamVurgu}>
              {formatPara(toplamCiro - toplamMaliyet)}
            </Text>
          </View>
        </View>
      )}

      {icKopya && segmentler.length > 0 && (
        <Text style={{ fontSize: 7, color: "#71717a", marginTop: 8 }}>
          Malzeme gideri yalnızca tamamlanmış işlerden hesaplanır. İş bazlı
          not edilen tutarlar ciroya dahil değildir.
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
  netGelir: number;
  maliyet: number;
  karZarar: number;
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
    brutGelir: number;
    netGelir: number;
    vergi: number;
    faturaSayisi: number;
    faturaliGelir: number;
    eldenGelir: number;
    eldenSayisi: number;
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
      <Text style={stiller.bolumBaslik}>Dönem özeti</Text>
      <View style={stiller.kutu}>
        <BilgiSatiri
          etiket="Brüt gelir"
          deger={formatPara(ozet.brutGelir)}
        />
        {/* Gelirin kaynağı ayrı yazılıyor: "3 fatura" tek başına
            yazsaydı faturasız ciro görünmez olurdu. */}
        <BilgiSatiri
          etiket="— faturalı"
          deger={`${formatPara(ozet.faturaliGelir)}  (${ozet.faturaSayisi} fatura)`}
        />
        <BilgiSatiri
          etiket="— faturasız (elden)"
          deger={`${formatPara(ozet.eldenGelir)}  (${ozet.eldenSayisi} segment)`}
        />
        <BilgiSatiri etiket="Vergi" deger={formatPara(ozet.vergi)} />
        <BilgiSatiri etiket="Net gelir" deger={formatPara(ozet.netGelir)} />
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

      <Text style={stiller.bolumBaslik}>Müşteri bazlı kırılım</Text>

      {musteriler.length === 0 ? (
        <Text style={stiller.bosMesaj}>
          Bu dönemde cirosu veya tamamlanmış işi olan müşteri yok.
        </Text>
      ) : (
        <View>
          <View style={stiller.tabloBaslik}>
            <Text style={{ flex: 1 }}>Müşteri</Text>
            <Text style={{ width: 40, ...stiller.sag }}>İş</Text>
            <Text style={{ width: 80, ...stiller.sag }}>Net gelir</Text>
            <Text style={{ width: 80, ...stiller.sag }}>Gider</Text>
            <Text style={{ width: 80, ...stiller.sag }}>Kâr / Zarar</Text>
          </View>

          {musteriler.map((m, i) => (
            <View key={`${m.ad}-${i}`} style={stiller.tabloSatir}>
              <Text style={{ flex: 1 }}>{m.ad}</Text>
              <Text style={{ width: 40, ...stiller.sag }}>{m.isSayisi}</Text>
              <Text style={{ width: 80, ...stiller.sag }}>
                {formatPara(m.netGelir)}
              </Text>
              <Text style={{ width: 80, ...stiller.sag }}>
                {formatPara(m.maliyet)}
              </Text>
              <Text
                style={{ width: 80, ...stiller.sag, fontWeight: "bold" }}
              >
                {formatPara(m.karZarar)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={{ fontSize: 7, color: "#71717a", marginTop: 12 }}>
        Gelir faturalardan ve faturasız segment tutarlarından oluşur; bir
        segmentte ikisi birden olamaz, çifte sayım yoktur. İş bazlı not
        edilen tutarlar bu hesaba girmez. Malzeme gideri yalnızca
        tamamlanmış işlerden hesaplanır; tamamlanmamış işlerin malzemesi
        henüz stoktan düşülmediği için gerçekleşmiş gider sayılmaz.
        Tahsilat durumu bu raporun kapsamı dışındadır.
      </Text>
    </Belge>
  );
}
