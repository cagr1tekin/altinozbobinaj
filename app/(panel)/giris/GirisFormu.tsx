"use client";

import { girisYap } from "@/lib/actions/oturum";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";

export default function GirisFormu({ devam }: { devam?: string }) {
  return (
    <Form action={girisYap}>
      {(state) => (
        <div className="space-y-4">
          {devam && <input type="hidden" name="devam" value={devam} />}

          <Alan
            ad="email"
            etiket="E-posta"
            tip="email"
            zorunlu
            hatalar={state.status === "error" ? state.fieldErrors : undefined}
          />
          <Alan
            ad="password"
            etiket="Şifre"
            tip="password"
            zorunlu
            hatalar={state.status === "error" ? state.fieldErrors : undefined}
          />

          <GonderButonu>Giriş Yap</GonderButonu>
        </div>
      )}
    </Form>
  );
}
