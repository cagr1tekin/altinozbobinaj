import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { PANEL_EPOSTA_BASLIGI } from "@/lib/supabase/middleware";
import { cikisYap } from "@/lib/actions/oturum";
import AltNavigasyon from "@/components/panel/AltNavigasyon";
import { Uyari } from "@/components/panel/ui";

export const metadata: Metadata = {
  title: "Yönetim Paneli | Altınöz Bobinaj",
  robots: { index: false, follow: false },
};

export default async function YonetimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* Supabase yoksa kurulum talimatı göster: middleware bu durumda
     yönlendirme yapamıyor, sayfa da veri çekemez. */
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-xl font-semibold">
          Yönetim paneli henüz yapılandırılmadı
        </h1>
        <div className="mt-4">
          <Uyari baslik="Kurulum adımları">
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>supabase.com üzerinde proje oluşturun (Frankfurt bölgesi).</li>
              <li>
                Authentication → Providers → Email altında{" "}
                <strong>&quot;Allow new users to sign up&quot;</strong> seçeneğini
                kapatın.
              </li>
              <li>
                <code>supabase/kurulum-tumu.sql</code> dosyasını SQL
                Editor&apos;de çalıştırın.
              </li>
              <li>Authentication → Users → Add user ile personel hesabı açın.</li>
              <li>
                <code>.env.example</code> dosyasını <code>.env</code> olarak
                kopyalayıp doldurun.
              </li>
            </ol>
          </Uyari>
        </div>
      </div>
    );
  }

  /* Oturum middleware'de getUser() ile doğrulanıyor ve doğrulanmış e-posta
     başlık üzerinden buraya taşınıyor. Burada tekrar getUser() çağırmak
     aynı doğrulamayı ikinci kez ağ üzerinden yapmak olurdu — fonksiyon ile
     veritabanı ayrı kıtalarda olduğu için sayfa başına ~200 ms bedeli vardı.
     Başlığın YOKLUĞU oturumsuzluk demek; boş olması değil (e-postasız bir
     oturumda değer boş gelir ama kullanıcı geçerlidir). Gerçek yetki
     sınırı yine RLS. */
  const eposta = (await headers()).get(PANEL_EPOSTA_BASLIGI);

  if (eposta === null) redirect("/giris");

  return (
    <>
      <AltNavigasyon />
      {children}

      {/* Çıkış: navigasyonda yer kaplamasın diye sayfa sonunda.
          Günde bir kez kullanılan bir eylem sekme hak etmiyor. */}
      <div className="mx-auto max-w-4xl px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-2 md:pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-pnl-line pt-4">
          <p className="truncate text-sm text-pnl-faint" title={eposta}>
            {eposta || "Oturum açık"}
          </p>
          <form action={cikisYap}>
            <button
              type="submit"
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium text-pnl-muted transition-colors hover:bg-pnl-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-pnl-primary"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Çıkış Yap
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
