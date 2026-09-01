"use client";

import { faturaSil } from "@/lib/actions/faturalar";
import { Form, GonderButonu } from "@/components/panel/Form";

export default function FaturaSilButonu({ faturaId }: { faturaId: string }) {
  return (
    <Form action={faturaSil}>
      {() => (
        <>
          <input type="hidden" name="id" value={faturaId} />
          <GonderButonu tur="ikincil" tamGenislik={false}>Sil</GonderButonu>
        </>
      )}
    </Form>
  );
}
