"use client";

import { Trash2 } from "lucide-react";
import { faturaSil } from "@/lib/actions/faturalar";
import { Form, GonderButonu } from "@/components/panel/Form";
import { formatPara, formatTarih } from "@/components/panel/ui";

/**
 * Fatura satırı. Silme, dosyayı da kaldırdığı için ayrı bir form.
 */
export default function FaturaSatiri({
  fatura,
  segmentId,
}: {
  fatura: {
    id: string;
    invoice_no: string | null;
    issue_date: string;
    net_amount: number;
    gross_amount: number;
    supplier_name: string | null;
  };
  segmentId: string;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {fatura.invoice_no ?? "Numarasız fatura"}
        </p>
        <p className="mt-0.5 truncate text-sm text-pnl-muted">
          {formatTarih(fatura.issue_date)}
          {fatura.supplier_name && ` · ${fatura.supplier_name}`}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="font-semibold">{formatPara(fatura.gross_amount)}</p>
        <p className="text-xs text-pnl-faint">
          net {formatPara(fatura.net_amount)}
        </p>
      </div>

      <Form action={faturaSil}>
        {() => (
          <>
            <input type="hidden" name="id" value={fatura.id} />
            <input type="hidden" name="segment_id" value={segmentId} />
            <GonderButonu tur="ikincil" tamGenislik={false}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Faturayı sil</span>
            </GonderButonu>
          </>
        )}
      </Form>
    </li>
  );
}
