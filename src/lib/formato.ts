/** Graduación con signo y dos decimales: +1.25, -0.50, 0.00. */
export function graduacion(n: number | string | null | undefined): string {
  if (n == null || n === "") return "—";
  const v = Number(n);
  if (v === 0) return "0.00";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
}

/** Valor simple o guion si está vacío. */
export function valor(n: number | string | null | undefined, sufijo = ""): string {
  return n == null || n === "" ? "—" : `${n}${sufijo}`;
}

/** AAAA-MM-DD → DD/MM/AAAA sin pasar por Date (evita desfases de zona horaria). */
export function fecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Edad en años a partir de la fecha de nacimiento. */
export function edad(nacimiento: string | null | undefined, hoy = new Date()): number | null {
  if (!nacimiento) return null;
  const [a, m, d] = nacimiento.split("-").map(Number);
  let anios = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) anios--;
  return anios;
}
