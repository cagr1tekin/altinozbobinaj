"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { type ActionState, idleState } from "@/lib/actions/types";

type ServerAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

/**
 * Server action'ı useActionState ile saran form.
 *
 * Alan bazlı hatalar context üzerinden değil, doğrudan Alan bileşenine
 * geçirilen `hatalar` prop'u ile iletiliyor — tek seviyeli bir formda
 * context kurmak gereksiz karmaşıklık.
 */
export function Form({
  action,
  children,
  className = "",
}: {
  action: ServerAction;
  children: (state: ActionState) => ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, idleState);

  return (
    <form action={formAction} className={className} noValidate>
      {state.status === "error" && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {state.message}
        </p>
      )}
      {state.status === "success" && state.message && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
        >
          {state.message}
        </p>
      )}
      {children(state)}
    </form>
  );
}

/** Gönderim sırasında butonu kilitler — çift kayıt oluşmasını engeller. */
export function GonderButonu({
  children = "Kaydet",
  ikincil = false,
}: {
  children?: ReactNode;
  ikincil?: boolean;
}) {
  const { pending } = useFormStatus();

  const ortak =
    "inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl px-5 text-sm font-semibold transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        ikincil
          ? `${ortak} border border-white/15 text-paper hover:bg-white/5 focus-visible:outline-silver-main`
          : `${ortak} bg-silver-cta text-ink hover:opacity-90 focus-visible:outline-silver-light`
      }
    >
      {pending ? "Kaydediliyor…" : children}
    </button>
  );
}

const girdiSinif =
  "w-full rounded-lg border border-white/15 bg-ink px-3 py-2.5 text-sm text-paper placeholder:text-paper-muted/60 focus:border-silver-main focus:outline-none focus:ring-1 focus:ring-silver-main";

/**
 * Etiketli form alanı.
 *
 * label her zaman görünür (placeholder tek başına etiket değildir) ve
 * htmlFor/id eşleşmesi zorunlu tutuluyor.
 */
export function Alan({
  ad,
  etiket,
  tip = "text",
  varsayilan,
  zorunlu = false,
  ipucu,
  hatalar,
  placeholder,
  adim,
  cokSatir = false,
  secenekler,
}: {
  ad: string;
  etiket: string;
  tip?: "text" | "email" | "password" | "tel" | "date" | "number";
  varsayilan?: string | number | null;
  zorunlu?: boolean;
  ipucu?: string;
  hatalar?: Record<string, string[]>;
  placeholder?: string;
  adim?: string;
  cokSatir?: boolean;
  secenekler?: Array<{ deger: string; etiket: string }>;
}) {
  const hata = hatalar?.[ad]?.[0];
  const id = `alan-${ad}`;
  const ipucuId = ipucu ? `${id}-ipucu` : undefined;
  const hataId = hata ? `${id}-hata` : undefined;
  const describedBy = [ipucuId, hataId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-paper">
        {etiket}
        {zorunlu && (
          <span className="ml-1 text-silver-main" aria-hidden="true">
            *
          </span>
        )}
        {zorunlu && <span className="sr-only"> (zorunlu)</span>}
      </label>

      {secenekler ? (
        <select
          id={id}
          name={ad}
          defaultValue={varsayilan ?? undefined}
          required={zorunlu}
          aria-invalid={hata ? true : undefined}
          aria-describedby={describedBy}
          className={girdiSinif}
        >
          {secenekler.map((s) => (
            <option key={s.deger} value={s.deger}>
              {s.etiket}
            </option>
          ))}
        </select>
      ) : cokSatir ? (
        <textarea
          id={id}
          name={ad}
          rows={3}
          defaultValue={varsayilan ?? undefined}
          required={zorunlu}
          placeholder={placeholder}
          aria-invalid={hata ? true : undefined}
          aria-describedby={describedBy}
          className={girdiSinif}
        />
      ) : (
        <input
          id={id}
          name={ad}
          type={tip}
          step={adim}
          inputMode={tip === "number" ? "decimal" : undefined}
          defaultValue={varsayilan ?? undefined}
          required={zorunlu}
          placeholder={placeholder}
          aria-invalid={hata ? true : undefined}
          aria-describedby={describedBy}
          className={girdiSinif}
        />
      )}

      {ipucu && (
        <p id={ipucuId} className="mt-1.5 text-xs text-paper-muted">
          {ipucu}
        </p>
      )}
      {hata && (
        <p id={hataId} className="mt-1.5 text-xs text-red-300">
          {hata}
        </p>
      )}
    </div>
  );
}
