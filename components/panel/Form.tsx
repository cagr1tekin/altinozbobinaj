"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { type ActionState, idleState } from "@/lib/actions/types";
import { butonStilleri } from "./ui";

/**
 * Panel formları — design-system/PANEL.md
 *
 * Kurallar: etiket her zaman görünür, hata input'un altında, sayısal
 * alanlarda telefon klavyesi, dokunma hedefi 48px.
 */

type ServerAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

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
          className="mb-4 rounded-lg border border-pnl-danger/40 bg-red-50 px-4 py-3 text-sm font-medium text-pnl-danger"
        >
          {state.message}
        </p>
      )}
      {state.status === "success" && state.message && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-pnl-success/40 bg-green-50 px-4 py-3 text-sm font-medium text-pnl-success"
        >
          {state.message}
        </p>
      )}
      {children(state)}
    </form>
  );
}

/** Gönderim sırasında kilitlenir — çift kayıt oluşmasını engeller. */
export function GonderButonu({
  children = "Kaydet",
  tur = "birincil",
  tamGenislik = true,
  devreDisi = false,
}: {
  children?: ReactNode;
  tur?: keyof typeof butonStilleri;
  tamGenislik?: boolean;
  /** Zorunlu bir seçim yapılmadıysa gönderimi baştan engelle */
  devreDisi?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || devreDisi}
      className={`${butonStilleri[tur]} ${tamGenislik ? "w-full" : ""}`}
    >
      {pending ? "Kaydediliyor…" : children}
    </button>
  );
}

const girdiSinif =
  "w-full min-h-[48px] rounded-lg border border-pnl-edge bg-pnl-surface px-3 text-base text-pnl-text placeholder:text-pnl-faint focus:border-pnl-primary focus:outline-none focus:ring-2 focus:ring-pnl-primary/30";

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
  onChange,
  deger,
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
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  deger?: string;
}) {
  const hata = hatalar?.[ad]?.[0];
  const id = `alan-${ad}`;
  const ipucuId = ipucu ? `${id}-ipucu` : undefined;
  const hataId = hata ? `${id}-hata` : undefined;
  const describedBy = [ipucuId, hataId].filter(Boolean).join(" ") || undefined;

  /* Sayısal alanlarda telefonun sayı klavyesi açılsın. Türkçe klavyede
     ondalık ayırıcı virgül olduğu için "decimal" kullanılıyor. */
  const inputMode = tip === "number" ? "decimal" : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {etiket}
        {zorunlu && (
          <>
            <span className="ml-0.5 text-pnl-danger" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> (zorunlu)</span>
          </>
        )}
      </label>

      {secenekler ? (
        <select
          id={id}
          name={ad}
          defaultValue={deger === undefined ? (varsayilan ?? undefined) : undefined}
          value={deger}
          onChange={onChange}
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
          className={`${girdiSinif} py-3`}
        />
      ) : (
        <input
          id={id}
          name={ad}
          type={tip}
          step={adim}
          inputMode={inputMode}
          defaultValue={varsayilan ?? undefined}
          required={zorunlu}
          placeholder={placeholder}
          aria-invalid={hata ? true : undefined}
          aria-describedby={describedBy}
          /* type="number" alanı odaktayken fare tekerleği değeri bir adım
             değiştiriyor. Kullanıcı sayfayı kaydırmak isterken girdiği
             miktar sessizce bozuluyordu (4 → 3,999). Tekerlek gelince odak
             bırakılıyor: değer korunuyor, sayfa normal kayıyor. */
          onWheel={
            tip === "number"
              ? (e) => (e.target as HTMLInputElement).blur()
              : undefined
          }
          className={girdiSinif}
        />
      )}

      {ipucu && (
        <p id={ipucuId} className="mt-1.5 text-sm text-pnl-faint">
          {ipucu}
        </p>
      )}
      {hata && (
        <p id={hataId} className="mt-1.5 text-sm font-medium text-pnl-danger">
          {hata}
        </p>
      )}
    </div>
  );
}
