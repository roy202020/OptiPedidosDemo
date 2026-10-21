/** Medios que se ofrecen al registrar un cobro (0015: Yape y Plin por separado). */
export const MEDIOS_COBRO = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
} as const;
export type MedioCobro = keyof typeof MEDIOS_COBRO;

/** Nombre de cualquier medio guardado, incluido "Yape / Plin" de los cobros anteriores a la 0015. */
export const NOMBRE_MEDIO: Record<string, string> = { ...MEDIOS_COBRO, yape_plin: "Yape / Plin" };

/** Totales de la caja del día (caja_del_dia): Yape y Plin se suman en "Yape / Plin". */
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
  medio: MedioCobro | "yape_plin";
  numero_operacion: string | null;
  caja_id: string | null;
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
