import { test as temel, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Test yardımcıları.
 *
 * Oturum gerektiren testler için Supabase'e doğrudan giriş yapılıp dönen
 * oturum, uygulamanın okuduğu çerez biçiminde tarayıcıya yazılıyor. Böylece
 * her testte giriş formu doldurmak gerekmiyor (o akış ayrıca test ediliyor).
 */

function envOku(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(".env", "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        })
    );
  } catch {
    return {};
  }
}

export const env = envOku();
export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/* Test hesabı .env üzerinden veriliyor. Tanımlı değilse oturum gerektiren
   testler atlanıyor — kimlik bilgisi koda gömülmemeli. */
export const TEST_EPOSTA = env.E2E_TEST_EPOSTA ?? "";
export const TEST_SIFRE = env.E2E_TEST_SIFRE ?? "";
export const oturumTestiMumkun = Boolean(
  SUPABASE_URL && SUPABASE_KEY && TEST_EPOSTA && TEST_SIFRE
);

/** Supabase'den oturum alır (giriş formunu kullanmadan). */
export async function oturumAl(): Promise<{
  access_token: string;
  refresh_token: string;
} | null> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EPOSTA, password: TEST_SIFRE }),
  });
  if (!r.ok) return null;
  return r.json();
}

/** Supabase proje referansı — çerez adı bundan türüyor. */
function projeRef(): string {
  return new URL(SUPABASE_URL).hostname.split(".")[0];
}

/**
 * Oturumu tarayıcıya yazar.
 *
 * @supabase/ssr oturumu `sb-<ref>-auth-token` çerezinde base64 önekli JSON
 * olarak saklıyor. Uzun değerler .0/.1 diye parçalanabildiği için tek
 * parçaya sığacak şekilde yazıp uygulamanın onu okumasını sağlıyoruz.
 */
export async function oturumuKur(page: Page): Promise<boolean> {
  const oturum = await oturumAl();
  if (!oturum) return false;

  const deger =
    "base64-" +
    Buffer.from(JSON.stringify(oturum)).toString("base64url");

  await page.context().addCookies([
    {
      name: `sb-${projeRef()}-auth-token`,
      value: deger,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  return true;
}

/** Panelde oturum gerçekten açıldı mı? */
export async function panelAcikMi(page: Page): Promise<boolean> {
  await page.goto("/yonetim");
  return !page.url().includes("/giris");
}

/**
 * Formdaki hata/başarı kutusu.
 *
 * Düz `getByRole("alert")` Next.js'in kendi route announcer'ını
 * (`__next-route-announcer__`, her zaman boş bir div) da yakalıyor;
 * bu yüzden form içine daraltılıyor.
 */
export function formHatasi(page: Page) {
  return page.locator('form [role="alert"]');
}

export function formBasarisi(page: Page) {
  return page.locator('form [role="status"]');
}

/** Test verilerini benzersiz kılmak için önek. */
export function testAdi(n: string): string {
  return `E2E-${n}-${Date.now().toString(36)}`;
}

export { temel as test, expect };
