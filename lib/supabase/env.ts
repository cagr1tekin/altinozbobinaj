/**
 * Supabase ortam değişkenlerinin tek doğrulama noktası.
 *
 * Değişken eksikse hata mesajı, "undefined is not a valid URL" gibi
 * kaynağı belirsiz bir çökme yerine ne yapılacağını söylüyor.
 */
function required(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      `${name} tanımlı değil. .env.example dosyasını .env olarak kopyalayıp ` +
        `Supabase panelindeki Project Settings → API bilgileriyle doldurun.`
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function getSupabaseAnonKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Supabase yapılandırılmış mı? Kurulum uyarısı göstermek için kullanılır. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://altinozbobinaj.com";
