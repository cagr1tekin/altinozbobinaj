"use client";

import { faturaSil } from "@/lib/actions/faturalar";
import { Form, GonderButonu } from "@/components/yonetim/Form";

export default function FaturaSilButonu({ faturaId }: { faturaId: string }) {
  return (
    <Form action={faturaSil}>
      {() => (
        <>
          <input type="hidden" name="id" value={faturaId} />
          <GonderButonu ikincil>Sil</GonderButonu>
        </>
      )}
    </Form>
  );
}
