"use client";

import type { Customer } from "@/lib/supabase/database.types";
import { musteriOlustur, musteriGuncelle } from "@/lib/actions/musteriler";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";

export default function MusteriFormu({ musteri }: { musteri?: Customer }) {
  const duzenleme = Boolean(musteri);

  return (
    <Form action={duzenleme ? musteriGuncelle : musteriOlustur}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            {musteri && <input type="hidden" name="id" value={musteri.id} />}

            <Alan ad="name" etiket="Müşteri adı" zorunlu varsayilan={musteri?.name} hatalar={hatalar} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Alan ad="phone" etiket="Telefon" tip="tel" varsayilan={musteri?.phone} hatalar={hatalar} />
              <Alan ad="email" etiket="E-posta" tip="email" varsayilan={musteri?.email} hatalar={hatalar} />
            </div>

            <Alan ad="tax_number" etiket="Vergi numarası" varsayilan={musteri?.tax_number} hatalar={hatalar} />
            <Alan ad="address" etiket="Adres" cokSatir varsayilan={musteri?.address} hatalar={hatalar} />
            <Alan ad="notes" etiket="Notlar" cokSatir varsayilan={musteri?.notes} hatalar={hatalar} />

            <GonderButonu>{duzenleme ? "Değişiklikleri Kaydet" : "Müşteriyi Kaydet"}</GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}
