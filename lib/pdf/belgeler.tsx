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
  malzemeler: PdfMalzeme[];
  qrToken?: string | null;
};

export type PdfSegment = {
  id: string;
  tarih: string;
  not: string | null;
  durum: string;
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
 * `maliyetGoster` false ise fiyat sütunları hiç çizilmiyor. Müşteriye
 * verilen çıktılarda alış fiyatı görünmemeli (PRD 5.6 ile aynı gerekçe:
 * alış fiyatı ticari bilgi).
 */
function MalzemeTablosu({
  malzemeler,
  maliyetGoster,
}: {
  malzemeler: PdfMalzeme[];
  maliyetGoster: boolean;
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
        <Text style={{ width: 100, ...stiller.sag }}>Miktar</Text>
        {maliyetGoster && (
          <Text style={{ width: 80, ...stiller.sag }}>Birim maliyet</Text>
        )}
      </View>

      {malzemeler.map((m, i) => (
        <View key={`${m.ad}-${i}`} style={stiller.tabloSatir}>
          <Text style={{ width: 24 }}>{i + 1}</Text>
          <Text style={{ flex: 1 }}>{m.ad}</Text>
          <Text style={{ width: 100, ...stiller.sag }}>
            {`${formatSayi(m.miktar)} ${m.birim === "piece" ? "adet" : "gram"}`}
          </Text>
          {maliyetGoster && (
            <Text style={{ width: 80, ...stiller.sag }}>
              {formatPara(m.birimMaliyet)}
            </Text>
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

/* ---------------------------------------------------------------------------
 * 1) İş belgesi
 * ------------------------------------------------------------------------- */

export function IsBelgesi({
  musteri,
  segment,
  is,
  maliyetGoster,
  qrUrl,
}: {
  musteri: PdfMusteri;
  segment: { tarih: string };
  is: PdfIs;
  maliyetGoster: boolean;
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
      <MalzemeTablosu malzemeler={is.malzemeler} maliyetGoster={maliyetGoster} />

      {maliyetGoster && is.malzemeler.length > 0 && (
        <View style={stiller.toplamKutu}>
          <View style={stiller.toplamSatir}>
            <Text>Toplam malzeme maliyeti</Text>
            <Text style={stiller.toplamVurgu}>{formatPara(is.maliyet)}</Text>
          </View>
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
  maliyetGoster,
}: {
  musteri: PdfMusteri;
  segment: PdfSegment;
  maliyetGoster: boolean;
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
              <MalzemeTablosu
                malzemeler={is.malzemeler}
                maliyetGoster={maliyetGoster}
              />
            </View>
            {maliyetGoster && is.malzemeler.length > 0 && (
              <Text style={{ fontSize: 8, textAlign: "right", marginTop: 3 }}>
                İş maliyeti: {formatPara(is.maliyet)}
              </Text>
            )}
          </View>
        ))
      )}

      {maliyetGoster && segment.isler.length > 0 && (
        <View style={stiller.toplamKutu}>
          <View style={stiller.toplamSatir}>
            <Text>Segment toplam maliyeti</Text>
            <Text style={stiller.toplamVurgu}>{formatPara(toplamMaliyet)}</Text>
          </View>
        </View>
      )}
    </Belge>
  );
}

/* ---------------------------------------------------------------------------
 * 3) Müşteri belgesi — segment/iş özeti
 * ------------------------------------------------------------------------- */

export function MusteriBelgesi({
  musteri,
  segmentler,
  maliyetGoster,
}: {
  musteri: PdfMusteri;
  segmentler: PdfSegment[];
  maliyetGoster: boolean;
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

  return (
    <Belge belgeTuru="Müşteri Belgesi">
      <MusteriKutusu musteri={musteri} />

      <View style={stiller.kutu}>
        <BilgiSatiri etiket="Segment" deger={`${segmentler.length} adet`} />
        <BilgiSatiri
          etiket="İş"
          deger={`${toplamIs} iş · ${toplamTamamlanan} tamamlandı`}
        />
      </View>

      <Text style={stiller.bolumBaslik}>Segment ve iş geçmişi</Text>

      {segmentler.length === 0 ? (
        <Text style={stiller.bosMesaj}>
          Bu müşteri için henüz segment açılmamış.
        </Text>
      ) : (
        <View>
          <View style={stiller.tabloBaslik}>
            <Text style={{ width: 65 }}>Tarih</Text>
            <Text style={{ flex: 1 }}>İş</Text>
            <Text style={{ width: 70 }}>Durum</Text>
            {maliyetGoster && (
              <Text style={{ width: 75, ...stiller.sag }}>Maliyet</Text>
            )}
          </View>

          {segmentler.flatMap((s) =>
            s.isler.length === 0
              ? [
                  <View key={`${s.id}-bos`} style={stiller.tabloSatir}>
                    <Text style={{ width: 65 }}>{formatTarih(s.tarih)}</Text>
                    <Text style={{ flex: 1, color: "#71717a" }}>
                      (iş kaydı yok)
                    </Text>
                    <Text style={{ width: 70 }}>—</Text>
                    {maliyetGoster && (
                      <Text style={{ width: 75, ...stiller.sag }}>—</Text>
                    )}
                  </View>,
                ]
              : s.isler.map((is, idx) => (
                  <View key={is.id} style={stiller.tabloSatir}>
                    <Text style={{ width: 65 }}>
                      {idx === 0 ? formatTarih(s.tarih) : ""}
                    </Text>
                    <Text style={{ flex: 1 }}>{is.baslik}</Text>
                    <Text style={{ width: 70 }}>
                      {IS_DURUM_ETIKET[is.durum] ?? is.durum}
                    </Text>
                    {maliyetGoster && (
                      <Text style={{ width: 75, ...stiller.sag }}>
                        {formatPara(is.maliyet)}
                      </Text>
                    )}
                  </View>
                ))
          )}
        </View>
      )}

      {maliyetGoster && toplamIs > 0 && (
        <View style={stiller.toplamKutu}>
          <View style={stiller.toplamSatir}>
            <Text>Toplam malzeme maliyeti</Text>
            <Text style={stiller.toplamVurgu}>{formatPara(toplamMaliyet)}</Text>
          </View>
        </View>
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
          deger={`${formatPara(ozet.brutGelir)}  (${ozet.faturaSayisi} fatura)`}
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
          Bu dönemde faturası veya tamamlanmış işi olan müşteri yok.
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
        Malzeme gideri yalnızca tamamlanmış işlerden hesaplanır; tamamlanmamış
        işlerin malzemesi henüz stoktan düşülmediği için gerçekleşmiş gider
        sayılmaz. Tahsilat durumu bu raporun kapsamı dışındadır.
      </Text>
    </Belge>
  );
}
