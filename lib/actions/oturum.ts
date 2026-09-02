"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { type ActionState, zodHatasi } from "@/lib/actions/types";

const girisSchema = z.object({
  email: z.string().trim().email("Geçerli bir e-posta girin"),
  password: z.string().min(1, "Şifre girilmeli"),
  devam: z.string().optional(),
});

/**
 * Giriş denemesini denetim günlüğüne yazar.
 *
 * Neden hata fırlatmıyor? Günlük yazılamadı diye kullanıcının girişi
 * engellenmemeli — kayıt yardımcı bir iz, işin kendisi değil. Sorun
 * sunucu günlüğüne yazılıyor ki sessiz kalmasın.
 */
async function girisKaydet(
  eposta: string | null,
  sonuc: "allowed" | "blocked_country" | "unknown_country"
): Promise<void> {
  try {
    const basliklar = await headers();
    const ulke =
      basliklar.get("x-vercel-ip-country") ?? basliklar.get("cf-ipcountry");

    /* IP'nin son okteti maskeleniyor: tam IP kişisel veri ve "aynı ağdan
       mı geliyor" sorusuna ilk üç oktet zaten cevap veriyor. */
    const hamIp =
      basliklar.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      basliklar.get("x-real-ip") ??
      null;
    let ipOnek: string | null = null;
    if (hamIp) {
      if (hamIp.includes(":")) {
        const p = hamIp.split(":");
        ipOnek = `${p[0]}:${p[1]}:…`;
      } else {
        const p = hamIp.split(".");
        if (p.length === 4) ipOnek = `${p[0]}.${p[1]}.${p[2]}.x`;
      }
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("giris_kaydet", {
      p_eposta: eposta,
      p_country: ulke,
      p_outcome: sonuc,
      p_ip_prefix: ipOnek,
      p_user_agent: basliklar.get("user-agent") ?? null,
    });
    if (error) console.error("[giris] kayit yazilamadi:", error.message);
  } catch (e) {
    console.error("[giris] kayit yazilamadi:", (e as Error).message);
  }
}

export async function girisYap(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = girisSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodHatasi(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    /* Supabase'in "Invalid login credentials" mesajı e-postanın kayıtlı olup
       olmadığını sızdırmaz; aynı belirsizliği koruyoruz. */
    return {
      status: "error",
      message: "E-posta veya şifre hatalı",
    };
  }

  /* Başarılı giriş kaydediliyor. Başarısız denemeler bilinçli olarak
     yazılmıyor: e-posta + zaman damgası birikimi, saldırgan günlüğü ele
     geçirirse hangi adreslerin denendiğini gösterir ve zaten Supabase'in
     kendi oran sınırı devrede. */
  const ulkeBasligi = (await headers()).get("x-vercel-ip-country");
  await girisKaydet(
    parsed.data.email,
    ulkeBasligi ? "allowed" : "unknown_country"
  );

  // Hedefin uygulama içi olduğunu doğrula: açık yönlendirme (open redirect)
  // için kullanılabilecek harici adresleri kabul etmiyoruz.
  const devam = parsed.data.devam;
  const hedef =
    devam && devam.startsWith("/yonetim") && !devam.startsWith("//")
      ? devam
      : "/yonetim";

  revalidatePath("/yonetim", "layout");
  redirect(hedef);
}

export async function cikisYap(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/yonetim", "layout");
  redirect("/giris");
}
