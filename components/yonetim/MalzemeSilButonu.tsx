"use client";

import { isMalzemeSil } from "@/lib/actions/isler";
import { Form, GonderButonu } from "@/components/yonetim/Form";

export default function MalzemeSilButonu({
  malzemeId,
  isId,
}: {
  malzemeId: string;
  isId: string;
}) {
  return (
    <Form action={isMalzemeSil}>
      {() => (
        <>
          <input type="hidden" name="id" value={malzemeId} />
          <input type="hidden" name="job_id" value={isId} />
          <GonderButonu ikincil>Kaldır</GonderButonu>
        </>
      )}
    </Form>
  );
}
