import { MEDIOS_PAGO, type MedioPago } from "@/lib/ordenes/pagos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/**
 * Ventas y metas. Regla: venta = precio − descuento de órdenes confirmadas (salieron de
 * "venta iniciada") y no anuladas, en el mes de su confirmación (hora de Lima).
 * Las funciones de la base vuelven a comprobar el rol (propietario o administrador).
 */
export type VentaMensual = { periodo: string; ventas: number; ordenes: number; meta: number | null };

export async function ventasMensuales(meses = 12): Promise<VentaMensual[]> {
  const optica = await exigirPermiso("verVentas");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("ventas_mensuales", { p_optica: optica.id, p_meses: meses });
  if (error) throw new Error(`No se pudieron leer las ventas: ${error.message}`);
  return (data as { periodo: string; ventas: string; ordenes: number; meta: string | null }[]).map((v) => ({
    periodo: v.periodo,
    ventas: Number(v.ventas),
    ordenes: v.ordenes,
    meta: v.meta == null ? null : Number(v.meta),
  }));
}

export async function ventasDelDia(): Promise<{ ventas: number; ordenes: number }> {
  const optica = await exigirPermiso("verVentas");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("ventas_del_dia", { p_optica: optica.id }).single();
  if (error) throw new Error(`No se pudieron leer las ventas del día: ${error.message}`);
  const d = data as { ventas: string; ordenes: number };
  return { ventas: Number(d.ventas), ordenes: d.ordenes };
}

/**
 * Caja del día: lo cobrado hoy (hora de Lima) según pagos vigentes, por medio de pago, y el saldo
 * pendiente de las órdenes no anuladas. Es dinero cobrado, no venta: no afecta la meta.
 */
export type CajaDelDia = {
  cobrado: number;
  pagos: number;
  porMedio: Record<MedioPago, number>;
  saldoPendiente: number;
  ordenesConSaldo: number;
};

export async function cajaDelDia(): Promise<CajaDelDia> {
  const optica = await exigirPermiso("verVentas");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("caja_del_dia", { p_optica: optica.id }).single();
  if (error) throw new Error(`No se pudo leer la caja del día: ${error.message}`);
  const d = data as { cobrado: string; pagos: number; por_medio: Record<string, number | string>; saldo_pendiente: string; ordenes_con_saldo: number };
  const porMedio = Object.fromEntries(
    (Object.keys(MEDIOS_PAGO) as MedioPago[]).map((m) => [m, Number(d.por_medio?.[m] ?? 0)]),
  ) as Record<MedioPago, number>;
  return {
    cobrado: Number(d.cobrado),
    pagos: d.pagos,
    porMedio,
    saldoPendiente: Number(d.saldo_pendiente),
    ordenesConSaldo: d.ordenes_con_saldo,
  };
}

/** Cumplimiento de una meta: porcentaje (sin tope) y lo que falta (0 si se superó). */
export function cumplimiento(ventas: number, meta: number | null) {
  if (!meta) return null;
  return { porcentaje: (ventas / meta) * 100, falta: Math.max(0, meta - ventas) };
}

/** Variación porcentual respecto del periodo anterior (null si no hay base de comparación). */
export function variacion(actual: number, anterior: number | undefined) {
  if (!anterior) return null;
  return ((actual - anterior) / anterior) * 100;
}
