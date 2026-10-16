/** Medios de pago (mismos valores que el CHECK de orden_pagos.medio). */
export const MEDIOS_PAGO = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  yape_plin: "Yape / Plin",
} as const;

export type MedioPago = keyof typeof MEDIOS_PAGO;

export type Pago = {
  id: string;
  importe: number | string;
  medio: MedioPago;
  fecha: string;
  creado_por: string;
  creado_en: string;
  anulado_en: string | null;
  anulado_por: string | null;
  motivo_anulacion: string | null;
};

const centimos = (n: number | string) => Math.round(Number(n) * 100);

/**
 * Importe neto, lo pagado (solo pagos vigentes) y el saldo de una orden.
 * Se suma en céntimos para no arrastrar errores de coma flotante.
 */
export function resumenPagos(orden: { precio: number | string; descuento: number | string }, pagos: Pick<Pago, "importe" | "anulado_en">[]) {
  const neto = centimos(orden.precio) - centimos(orden.descuento);
  const pagado = pagos.filter((p) => !p.anulado_en).reduce((s, p) => s + centimos(p.importe), 0);
  return { neto: neto / 100, pagado: pagado / 100, saldo: Math.max(0, neto - pagado) / 100 };
}
