"use client";

import { segmentOlustur } from "@/lib/actions/musteriler";
import { Alan, Form, GonderButonu } from "@/components/panel/Form";

export default function SegmentFormu({ musteriId }: { musteriId: string }) {
  // Varsayılan tarih bugün: segment "bugün gelen işler" anlamına geliyor
  const bugun = new Date().toISOString().slice(0, 10);

  return (
    <Form action={segmentOlustur}>
      {(state) => {
        const hatalar = state.status === "error" ? state.fieldErrors : undefined;
        return (
          <div className="space-y-4">
            <input type="hidden" name="customer_id" value={musteriId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Alan ad="segment_date" etiket="Tarih" tip="date" zorunlu varsayilan={bugun} hatalar={hatalar} />
              <Alan ad="note" etiket="Not" placeholder="Örn: 4 kalem iş geldi" hatalar={hatalar} />
            </div>
            <GonderButonu>Segment Aç</GonderButonu>
          </div>
        );
      }}
    </Form>
  );
}
