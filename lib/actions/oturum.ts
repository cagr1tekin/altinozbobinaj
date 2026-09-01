"use server";

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
