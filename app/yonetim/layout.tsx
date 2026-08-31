import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Users, Package, Receipt, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { cikisYap } from "@/lib/actions/oturum";

export const metadata: Metadata = {
  title: "Yönetim Paneli | Altınöz Bobinaj",
  robots: { index: false, follow: false },
};

const menu = [
  { href: "/yonetim", etiket: "Özet", ikon: LayoutDashboard },
  { href: "/yonetim/musteriler", etiket: "Müşteriler", ikon: Users },
  { href: "/yonetim/urunler", etiket: "Ürünler & Stok", ikon: Package },
  { href: "/yonetim/faturalar", etiket: "Faturalar", ikon: Receipt },
];

export default async function YonetimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* Supabase yoksa kurulum talimatı göster: middleware bu durumda
     yönlendirme yapamıyor, sayfa da veri çekemez. */
  if (!isSupabaseConfigured()) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="font-display text-2xl font-bold text-paper">
          Yönetim paneli henüz yapılandırılmadı
        </h1>
        <div className="mt-6 space-y-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-100">
          <p>Panelin çalışması için sırasıyla:</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              supabase.com üzerinde bir proje oluşturun (bölge olarak
              Frankfurt önerilir, Türkiye&apos;ye en yakın).
            </li>
            <li>
              <code className="font-mono">supabase/migrations/</code>{" "}
              altındaki üç SQL dosyasını numara sırasıyla SQL Editor&apos;de
              çalıştırın.
            </li>
            <li>
              Authentication → Users bölümünden personel için e-posta/şifre
              ile kullanıcı oluşturun (kayıt formu bilinçli olarak yok).
            </li>
            <li>
              <code className="font-mono">.env.example</code> dosyasını{" "}
              <code className="font-mono">.env</code> olarak kopyalayıp
              Project Settings → API bilgileriyle doldurun.
            </li>
            <li>Geliştirme sunucusunu yeniden başlatın.</li>
          </ol>
        </div>
      </div>
    );
  }

  /* Middleware zaten yönlendiriyor; burada tekrar kontrol etmek
     savunma amaçlı (middleware matcher'ı yanlış yapılandırılırsa
     panel açıkta kalmasın). Gerçek yetki sınırı RLS. */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/giris");

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:gap-10 lg:px-8">
        {/* Yan menü */}
        <aside className="lg:w-56 lg:shrink-0">
          <nav aria-label="Panel menüsü">
            <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              {menu.map((m) => {
                const Ikon = m.ikon;
                return (
                  <li key={m.href} className="shrink-0">
                    <Link
                      href={m.href}
                      className="flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-paper/80 transition-colors hover:bg-white/5 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main"
                    >
                      <Ikon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {m.etiket}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-6 border-t border-white/10 pt-4">
            <p className="truncate px-3 text-xs text-paper-muted" title={user.email ?? ""}>
              {user.email}
            </p>
            <form action={cikisYap} className="mt-2">
              <button
                type="submit"
                className="flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-paper/80 transition-colors hover:bg-white/5 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver-main"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                Çıkış Yap
              </button>
            </form>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
