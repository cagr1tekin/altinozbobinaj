import { createClient } from "@/lib/supabase/server";
import {
  BosDurum,
  Icerik,
  Liste,
  ListeSatiri,
  UstCubuk,
  Uyari,
  formatTarih,
} from "@/components/panel/ui";
import MusteriArama from "@/components/panel/MusteriArama";
import EkleAcilir from "@/components/panel/EkleAcilir";
import MusteriFormu from "@/components/panel/MusteriFormu";

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
    .is("deleted_at", null)
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
      <UstCubuk baslik="Müşteriler" />

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

        {/* Arama sonucu boşken ekleme formu açık gelmesin: kullanıcı
            aramaya gelmiş, kayıt eklemeye değil. */}
        {liste.length === 0 && q ? (
          <BosDurum
            baslik="Sonuç bulunamadı"
            aciklama="Arama terimini değiştirip tekrar deneyin."
          />
        ) : (
          <Liste
            ekleme={
              <EkleAcilir
                etiket="Yeni müşteri ekle"
                ilkAcik={liste.length === 0 && !q}
              >
                <MusteriFormu />
              </EkleAcilir>
            }
          >
            {liste.length > 0 &&
              liste.map((m) => (
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
