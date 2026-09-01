"use client";

import { segmentDurumDegistir } from "@/lib/actions/musteriler";
import type { SegmentStatus } from "@/lib/supabase/database.types";
import { Form, GonderButonu } from "@/components/panel/Form";

export default function SegmentDurumButonu({
  segmentId,
  mevcutDurum,
}: {
  segmentId: string;
  mevcutDurum: SegmentStatus;
}) {
  const hedef = mevcutDurum === "open" ? "closed" : "open";

  return (
    <Form action={segmentDurumDegistir}>
      {() => (
        <>
          <input type="hidden" name="id" value={segmentId} />
          <input type="hidden" name="status" value={hedef} />
          <GonderButonu tur="ikincil" tamGenislik={false}>
            {hedef === "closed" ? "Segmenti Kapat" : "Segmenti Aç"}
          </GonderButonu>
        </>
      )}
    </Form>
  );
}
