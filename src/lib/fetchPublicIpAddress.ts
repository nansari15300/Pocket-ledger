/** Best-effort public IPv4 for port-forward hint — empty field only; never overwrite user DDNS. */
const PUBLIC_IP_PROVIDERS = [
  "https://api.ipify.org?format=text",
  "https://checkip.amazonaws.com",
  "https://ipv4.icanhazip.com",
] as const;

function parseIpv4(text: string): string | null {
  const m = String(text || "")
    .trim()
    .match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
  if (!m) return null;
  const ip = m[1]!;
  const parts = ip.split(".").map((x) => Number(x));
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return ip;
}

export async function fetchPublicIpAddress(signal?: AbortSignal): Promise<string | null> {
  for (const url of PUBLIC_IP_PROVIDERS) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 8000);
      const linked = signal
        ? (() => {
            if (signal.aborted) ac.abort();
            else signal.addEventListener("abort", () => ac.abort(), { once: true });
            return ac.signal;
          })()
        : ac.signal;
      try {
        const res = await fetch(url, { method: "GET", cache: "no-store", signal: linked });
        if (!res.ok) continue;
        const ip = parseIpv4(await res.text());
        if (ip) return ip;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      /* try next provider */
    }
  }
  return null;
}
