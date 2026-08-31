/**
 * Header yüksekliği kadar offset bırakarak bölüme yumuşak kaydırma.
 * Header, Hero ve Footer'daki üç ayrı kopyanın yerini alır.
 */
export const HEADER_HEIGHT = 80;

export function scrollToSection(hash: string) {
  const targetId = hash.replace("#", "");
  if (!targetId) return;

  const element = document.getElementById(targetId);
  if (!element) return;

  const offsetPosition =
    element.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT;

  window.scrollTo({ top: offsetPosition, behavior: "smooth" });
}

/**
 * Anchor link'ler için tıklama handler'ı. Sadece "#..." ile başlayan
 * href'leri yakalar; tel:/mailto:/harici linkler doğal davranışını korur.
 */
export function handleAnchorClick(
  e: React.MouseEvent<HTMLAnchorElement>,
  href: string
) {
  if (!href.startsWith("#") || href === "#") return;
  e.preventDefault();
  scrollToSection(href);
}
