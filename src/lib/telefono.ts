/**
 * Celulares de Perú en formato internacional sin "+" (lo que usan WhatsApp y wa.me):
 * "987 654 321" → "51987654321". Devuelve null si no es un celular válido.
 * Misma regla que public.normalizar_celular_pe() en la base de datos.
 */
export function normalizarCelularPe(telefono: string | null | undefined): string | null {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (/^9\d{8}$/.test(d)) return `51${d}`;
  if (/^519\d{8}$/.test(d)) return d;
  if (/^00519\d{8}$/.test(d)) return d.slice(2);
  return null;
}
