/**
 * Medidas del inventario de lunas. El stock se guarda en convención de cilindro negativo.
 * Módulo puro: se usa en el servidor y en la matriz del cliente.
 */

export type Medida = { esfera: number; cilindro: number; eje: number | null };

/**
 * Pasa una medida a cilindro negativo. Con cilindro positivo es la transposición óptica:
 * esfera + cilindro, cilindro cambiado de signo y eje girado 90°. Es la misma luna, no otra medida.
 */
export function aCilindroNegativo(m: Medida): Medida & { transpuesta: boolean } {
  if (m.cilindro <= 0) return { ...m, cilindro: m.cilindro === 0 ? 0 : m.cilindro, transpuesta: false };
  const eje = m.eje == null ? null : m.eje <= 90 ? m.eje + 90 : m.eje - 90;
  return { esfera: redondear(m.esfera + m.cilindro), cilindro: redondear(-m.cilindro), eje, transpuesta: true };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Valores de un rango con paso fijo (incluye los extremos): -1, -0.75 … 1. */
export function rango(desde: number, hasta: number, paso = 0.25): number[] {
  const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
  const n = Math.round((b - a) / paso);
  return Array.from({ length: n + 1 }, (_, i) => redondear(a + i * paso));
}

/** Clave de una celda de la matriz. */
export const clave = (esfera: number, columna: number) => `${esfera.toFixed(2)}|${columna.toFixed(2)}`;

export type EstadoStock = "agotado" | "bajo" | "ok";

/** Mismo criterio que la vista lunas_existencias. */
export function estadoStock(disponible: number, minimo: number): EstadoStock {
  if (disponible <= 0) return "agotado";
  if (minimo > 0 && disponible <= minimo) return "bajo";
  return "ok";
}

/** Lunas sueltas expresadas también en pares: 13 → "6 pares + 1". */
export function enPares(lunas: number): string {
  const pares = Math.trunc(lunas / 2);
  const resto = lunas % 2;
  if (lunas === 0) return "0 pares";
  if (pares === 0) return `${resto} luna`;
  return `${pares} ${pares === 1 ? "par" : "pares"}${resto ? ` + ${Math.abs(resto)}` : ""}`;
}

/** Medida legible: "-2.00 / -0.50", con adición y lado si los hay. */
export function textoMedida(v: { esfera: number; cilindro: number; eje?: number | null; adicion?: number | null; lado?: string | null }) {
  const s = (n: number) => (n === 0 ? "0.00" : `${n > 0 ? "+" : ""}${Number(n).toFixed(2)}`);
  return [
    `${s(Number(v.esfera))} / ${s(Number(v.cilindro))}`,
    v.eje != null ? `× ${v.eje}°` : null,
    v.adicion != null ? `Ad ${s(Number(v.adicion))}` : null,
    v.lado ?? null,
  ]
    .filter(Boolean)
    .join(" ");
}

export const TIPOS_LUNA = {
  resina: "Resina",
  policarbonato: "Policarbonato",
  alto_indice: "Alto índice",
  fotocromatica: "Fotocromática",
  trivex: "Trivex",
  cristal: "Cristal",
  otro: "Otro",
} as const;

export const VISIONES = { monofocal: "Monofocal", bifocal: "Bifocal", progresivo: "Progresivo", ocupacional: "Ocupacional" } as const;
export const SUPERFICIES = { esferica: "Esférica", asferica: "Asférica" } as const;

export const TIPOS_MOVIMIENTO = {
  compra: "Compra",
  venta: "Venta",
  consumo: "Consumo en orden",
  devolucion: "Devolución",
  perdida: "Pérdida",
  ajuste: "Ajuste",
} as const;
export type TipoMovimiento = keyof typeof TIPOS_MOVIMIENTO;
