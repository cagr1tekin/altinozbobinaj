"use client";

import { isDurumDegistir } from "@/lib/actions/isler";
import type { JobStatus } from "@/lib/supabase/database.types";
import { Form, GonderButonu } from "@/components/yonetim/Form";

/**
 * Bekliyor <-> Devam ediyor geçişi.
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
          <GonderButonu ikincil>
            {hedef === "in_progress" ? "İşe Başla" : "Beklemeye Al"}
          </GonderButonu>
        </>
      )}
    </Form>
  );
}
