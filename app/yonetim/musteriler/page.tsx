import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  BolumBasligi,
  BosDurum,
  ButonLink,
  formatTarih,
} from "@/components/yonetim/ui";

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

  /* ilike ile arama: % karakteri kullanıcı girdisinde joker olarak
     yorumlanmasın diye kaçırılıyor. */
  if (q && q.trim().length > 0) {
    const temiz = q.trim().replace(/[%_]/g, (eslesme) => "\\" + eslesme);
    sorgu = sorgu.ilike("name", `%${temiz}%`);
  }

  const { data: musteriler, error } = await sorgu;

  return (
    <>
      <BolumBasligi
        baslik="Müşteriler"
        aciklama="Müşteri kartları, segmentler ve iş geçmişi."
        aksiyon={<ButonLink href="/yonetim/musteriler/yeni">Yeni Müşteri</ButonLink>}
      />

      <form className="mb-6" role="search">
        <label htmlFor="musteri-ara" className="mb-1.5 block text-sm font-medium text-paper">
          Müşteri ara
        </label>
        <div className="flex gap-2">
          <input
            id="musteri-ara"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="Ad ile ara"
            className="w-full max-w-sm rounded-lg border border-white/15 bg-ink px-3 py-2.5 text-sm text-paper placeholder:text-paper-muted/60 focus:border-silver-main focus:outline-none focus:ring-1 focus:ring-silver-main"
          />
          <button
            type="submit"
            className="min-h-[44px] cursor-pointer rounded-xl border border-white/15 px-4 text-sm font-semibold text-paper transition-colors hover:bg-white/5"
          >
            Ara
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Müşteriler yüklenemedi. Supabase bağlantısını ve migration&apos;ların
          uygulandığını kontrol edin.
        </p>
      )}

      {!error && (musteriler ?? []).length === 0 ? (
        <BosDurum
          baslik={q ? "Sonuç bulunamadı" : "Henüz müşteri yok"}
          aciklama={
            q
              ? "Arama terimini değiştirip tekrar deneyin."
              : "İlk müşteriyi ekleyerek başlayın. Her müşterinin altında ziyaret bazlı segmentler, segmentlerin altında da işler yer alır."
          }
          aksiyon={!q ? <ButonLink href="/yonetim/musteriler/yeni">Yeni Müşteri</ButonLink> : undefined}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {(musteriler ?? []).map((m) => (
            <li key={m.id}>
              <Link
                href={`/yonetim/musteriler/${m.id}`}
                className="block rounded-xl border border-white/10 bg-ink-soft/60 p-5 transition-colors hover:border-silver-main/40 hover:bg-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main"
              >
                <p className="font-medium text-paper">{m.name}</p>
                <p className="mt-1 text-sm text-paper-muted">
                  {m.phone ?? "Telefon girilmemiş"}
                </p>
                <p className="mt-2 text-xs text-paper-muted">
                  Kayıt: {formatTarih(m.created_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
