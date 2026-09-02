import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { PublicJobView } from "@/lib/supabase/database.types";
import { ISLEM_TURU_CUMLE, formatTarih } from "@/lib/bicim";

const PHONE = "+905425918372";
const PHONE_GORUNEN = "0542 591 83 72";
const WHATSAPP_URL = `https://wa.me/905425918372?text=${encodeURIComponent(
  "Merhaba, motorumun işlemi hakkında bilgi almak istiyorum."
)}`;

/* Metadata ve tema rengi (belge) layout'unda; burada tekrarlanmıyor. */

export default async function QrMalzemeSayfasi({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isSupabaseConfigured()) notFound();

  const supabase = await createClient();

  /* public_job_by_token security definer: anon rolunun tablolara erisimi
     yok, veri yalnizca bu fonksiyonun dondurdugu alanlar kadar gorunur.
     Alis fiyati, MIKTAR ve musteri kimligi bilincli olarak disarida. */
  const { data, error } = await supabase.rpc("public_job_by_token", {
    p_token: token,
  });

  if (error || !data) notFound();
  const is = data as unknown as PublicJobView;

  /* Eski kayıtlarda işlem türü olmayabilir; metin o durumda da tutarlı
     kalıyor. */
  const islem = is.service_type ? ISLEM_TURU_CUMLE[is.service_type] : null;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Marka çubuğu — pazarlama menüsü YOK.
          Logo ana sayfaya bağlı: müşteri firmayı merak ederse gidebilir,
          ama sayfanın kendisi bir belge olarak duruyor. */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-lg items-center justify-center px-4 py-5">
          <Link href="/" aria-label="Altınöz Bobinaj ana sayfası">
            {/* Logo kaynağı beyaz; koyu zeminde filtre gerekmiyor. */}
            <span className="relative block h-12 w-36">
              <Image
                src="/logo2.webp"
                alt="Altınöz Bobinaj"
                fill
                priority
                sizes="144px"
                className="object-contain"
              />
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
        <p className="text-xs uppercase tracking-widest text-paper-muted">
          İşlem Belgesi
        </p>
        <h1 className="mt-2 font-display text-2xl leading-tight">
          {is.job_title}
        </h1>
        {is.completed_at && (
          <p className="mt-2 text-sm text-paper-muted">
            Tamamlanma: {formatTarih(is.completed_at)}
          </p>
        )}

        {/* Ne yapıldığını anlatan bölüm.
            Müşteri bu sayfaya işini teslim alırken bakıyor ve "ne yapıldı,
            ne kullanıldı, güvenebilir miyim" sorularının cevabını arıyor.
            Anlatı işin niteliğine dayanıyor, malzeme miktarına değil —
            miktar bilinçli olarak gösterilmiyor. */}
        <div className="mt-6 rounded-xl border border-white/10 bg-ink-soft p-5">
          <p className="text-[15px] leading-relaxed">
            Motorunuz atölyemize alınmış, kontrol edilmiş ve aşağıda
            listelenen malzemeler kullanılarak{" "}
            <strong className="font-semibold">
              {islem ? `${islem} işlemi` : "bakım işlemi"}
            </strong>{" "}
            uygulanmıştır. Uygulanan işlemin ardından motorunuz test edilerek
            çalışır durumda teslime hazır hâle getirilmiştir.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-paper-muted">
            Kullanılan malzemeler, 1976&apos;dan bu yana sürdürdüğümüz işçilik
            anlayışına uygun olarak seçilmiştir. İşleminizle ilgili aklınıza
            takılan bir konu olursa aşağıdaki numaradan bize ulaşabilirsiniz.
          </p>
        </div>

        <h2 className="mb-3 mt-8 text-base font-semibold">
          Kullanılan malzemeler
        </h2>

        {is.materials.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-ink-soft p-5 text-sm text-paper-muted">
            Bu işlemde yeni malzeme kullanılmamış; yapılan çalışma tamamen
            işçilikten oluşmaktadır.
          </p>
        ) : (
          <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-ink-soft">
            {is.materials.map((m, i) => (
              <li key={`${m.name}-${i}`} className="px-5 py-3.5 font-medium">
                {m.name}
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* İletişim — sayfanın sonunda, iki büyük hedef.
          Müşteri bir soru sormak isterse numarayı aramak zorunda kalmasın.
          Dokunma hedefi 56px: telefonda tek elle kullanılıyor. */}
      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-lg px-4 py-6">
          <p className="text-sm text-paper-muted">Sorularınız için:</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <a
              href={`tel:${PHONE}`}
              className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-silver-cta px-5 font-semibold text-ink transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main"
            >
              <Phone className="h-5 w-5" aria-hidden="true" />
              {PHONE_GORUNEN}
            </a>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-white/20 px-5 font-semibold transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              WhatsApp
            </a>
          </div>
          <p className="mt-5 text-xs text-paper-muted">
            Altınöz Bobinaj · 1976&apos;dan beri · Karesi / Balıkesir
          </p>
        </div>
      </footer>
    </div>
  );
}
