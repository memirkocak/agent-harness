/**
 * Garde-fous fetch_url (SSRF basique).
 */
export function assertSafeUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("url requis");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`URL invalide : ${trimmed.slice(0, 80)}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Protocole non autorisé : ${parsed.protocol}`);
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local")
  ) {
    throw new Error(`Hôte non autorisé : ${host}`);
  }

  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error(`IP privée non autorisée : ${host}`);
  }

  if (host === "169.254.169.254" || host.startsWith("169.254.")) {
    throw new Error(`Hôte metadata non autorisé : ${host}`);
  }
}
