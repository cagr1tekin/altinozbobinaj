"use client";

import { isDurumDegistir } from "@/lib/actions/isler";
import type { JobStatus } from "@/lib/supabase/database.types";
import { Form, GonderButonu } from "@/components/panel/Form";

/**
 * Bekliyor <-> Devam ediyor geçişi.
 *
 * Yeni işler doğrudan "devam ediyor" başlıyor (ayrıca başlatmak gerekmiyor),
 * bu yüzden buton çoğunlukla "Beklemeye Al" olarak görünür. Beklemeye alınan
 * bir iş buradan tekrar devam ettirilebiliyor.
 *
 * Tamamlama bilinçli olarak burada değil: stok düşümü ve QR üretimi
 * gerektirdiği için ayrı bir akış (TamamlamaPaneli).
 */
export default function IsDurumFormu({
  isId,
  mevcutDurum,
}: {
  isId: string;
  mevcutDurum: JobStatus;
}) {
  const hedef: JobStatus = mevcutDurum === "pending" ? "in_progress" : "pending";

  return (
    <Form action={isDurumDegistir}>
      {() => (
        <>
          <input type="hidden" name="job_id" value={isId} />
          <input type="hidden" name="status" value={hedef} />
          <GonderButonu tur="ikincil" tamGenislik={false}>
            {hedef === "in_progress" ? "Devam Ettir" : "Beklemeye Al"}
          </GonderButonu>
        </>
      )}
    </Form>
  );
}
