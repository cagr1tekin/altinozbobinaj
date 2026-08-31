"use client";

import { isOlustur } from "@/lib/actions/isler";
import { Alan, Form, GonderButonu } from "@/components/yonetim/Form";

export default function IsFormu({ segmentId }: { segmentId: string }) {
  return (
    <Form action={isOlustur}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            <input type="hidden" name="segment_id" value={segmentId} />
            <Alan
              ad="title"
              etiket="İş başlığı"
              zorunlu
              placeholder="Örn: 75 kW asenkron motor sarımı"
              hatalar={hatalar}
            />
            <Alan ad="description" etiket="Açıklama" cokSatir hatalar={hatalar} />
            <p className="text-xs text-paper-muted">
              Eklenen iş doğrudan &quot;devam ediyor&quot; durumunda başlar.
            </p>
            <GonderButonu>İş Ekle</GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}
