/**
 * OptiPedidos · Egresos generales de la sede: categorías, medios y totales. Módulo puro (sin base de datos).
 */

export const CATEGORIAS_EGRESO = {
  servicios: "Servicios (luz, agua, internet, teléfono)",
  alquiler: "Alquiler",
  sueldos: "Sueldos",
  movilidad: "Movilidad",
  compras: "Compras menores",
  otros: "Otros",
} as const;
export type CategoriaEgreso = keyof typeof CATEGORIAS_EGRESO;

/** Nombre corto para tablas e indicadores. */
export const CATEGORIA_CORTA: Record<CategoriaEgreso, string> = {
  servicios: "Servicios",
  alquiler: "Alquiler",
  sueldos: "Sueldos",
  movilidad: "Movilidad",
  compras: "Compras",
  otros: "Otros",
};

export const MEDIOS_EGRESO = {
  efectivo_caja: "Efectivo de caja",
  yape: "Yape",
  plin: "Plin",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  otro: "Otro",
} as const;
export type MedioEgreso = keyof typeof MEDIOS_EGRESO;

/** Total y monto por categoría de los egresos vigentes (los anulados no cuentan). */
export function totalesEgresos(filas: { categoria: CategoriaEgreso; monto: number | string; anulado_en: string | null }[]) {
  const porCategoria = new Map<CategoriaEgreso, number>();
  let total = 0;
  for (const f of filas) {
    if (f.anulado_en) continue;
    const m = Math.round(Number(f.monto) * 100);
    total += m;
    porCategoria.set(f.categoria, (porCategoria.get(f.categoria) ?? 0) + m);
  }
  return {
    total: total / 100,
    porCategoria: [...porCategoria.entries()].map(([categoria, m]) => ({ categoria, monto: m / 100 })).sort((a, b) => b.monto - a.monto),
  };
}

/** Primer y último día del mes AAAA-MM. */
export function rangoMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}
