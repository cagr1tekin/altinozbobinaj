import { createClient } from "@/lib/supabase/server";
import {
  BosDurum,
  ButonLink,
  Icerik,
  Liste,
  ListeSatiri,
  UstCubuk,
  Uyari,
  formatTarih,
} from "@/components/panel/ui";
import MusteriArama from "@/components/panel/MusteriArama";

export default async function MusterilerSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let sorgu = supabase
    .from("customers")
    .select("id, name, phone, created_at")
    .order("name", { ascending: true })
    .limit(200);

  /* ilike ile arama: % ve _ kullanıcı girdisinde joker olarak
     yorumlanmasın diye kaçırılıyor. */
  if (q && q.trim().length > 0) {
    const temiz = q.trim().replace(/[%_]/g, (eslesme) => "\\" + eslesme);
    sorgu = sorgu.ilike("name", `%${temiz}%`);
  }

  const { data: musteriler, error } = await sorgu;
  const liste = musteriler ?? [];

  return (
    <>
      <UstCubuk
        baslik="Müşteriler"
        eylem={
          <ButonLink href="/yonetim/musteriler/yeni" tur="birincil">
            Yeni
          </ButonLink>
        }
      />

      <Icerik>
        <div className="mb-4">
          <MusteriArama varsayilan={q ?? ""} />
        </div>

        {error && (
          <div className="mb-4">
            <Uyari tur="hata" baslik="Müşteriler yüklenemedi">
              Supabase bağlantısını ve migration&apos;ların uygulandığını
              kontrol edin.
            </Uyari>
          </div>
        )}

        {liste.length === 0 ? (
          <BosDurum
            baslik={q ? "Sonuç bulunamadı" : "Henüz müşteri yok"}
            aciklama={
              q
                ? "Arama terimini değiştirip tekrar deneyin."
                : "İlk müşteriyi ekleyerek başlayın. Her müşterinin altında ziyaret bazlı segmentler, segmentlerin altında işler yer alır."
            }
            eylem={
              !q ? (
                <ButonLink href="/yonetim/musteriler/yeni">
                  Yeni Müşteri
                </ButonLink>
              ) : undefined
            }
          />
        ) : (
          <Liste>
            {liste.map((m) => (
              <ListeSatiri
                key={m.id}
                href={`/yonetim/musteriler/${m.id}`}
                baslik={m.name}
                altBilgi={m.phone ?? `Kayıt: ${formatTarih(m.created_at)}`}
              />
            ))}
          </Liste>
        )}
      </Icerik>
    </>
  );
}
