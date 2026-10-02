/** Lighten a #RRGGBB color by mixing toward white (for readable PDF backgrounds). */
export function lightenInvoiceBackgroundHex(hex: string, whiteWeight = 0.88): string {
  const normalized = hex.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) return "#FFFFFF";
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const mix = (channel: number) => Math.round(channel * (1 - whiteWeight) + 255 * whiteWeight);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`.toUpperCase();
}
