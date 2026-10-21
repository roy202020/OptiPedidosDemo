import type { EstadoInterno } from "@/lib/ordenes/estados";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/*
 * Saldos de los clientes. La base calcula el saldo (precio − descuento − cobros vigentes) y limita
 * cada consulta a las sedes del usuario: nadie de otra sede u otra óptica los ve.
 */

export type SaldoPendiente = {
  orden_id: string;
  numero: number;
  paciente_id: string;
  paciente: string;
  telefono: string | null;
  sede_id: string;
  sede: string;
  estado: EstadoInterno;
  total: number;
  pagado: number;
  saldo: number;
  creado_en: string;
  dias: number;
};

/** Pedidos con saldo, del más antiguo al más reciente. `diasMin`: solo los que tienen al menos esa antigüedad. */
export async function saldosPendientes(sede: string | null, diasMin: number | null): Promise<SaldoPendiente[]> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("saldos_pendientes", { p_optica: optica.id, p_sede: sede, p_dias_min: diasMin });
  if (error) throw new Error(`No se pudieron leer los saldos: ${error.message}`);
  return (data as SaldoPendiente[]).map((s) => ({ ...s, total: Number(s.total), pagado: Number(s.pagado), saldo: Number(s.saldo) }));
}

export type ResumenPorCobrar = { por_cobrar: number; ordenes: number; en_listos: number; ordenes_listas: number };

/** Panel del dueño y del administrador: total por cobrar y cuánto está en pedidos listos para entregar. */
export async function resumenPorCobrar(sede: string | null): Promise<ResumenPorCobrar> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("resumen_por_cobrar", { p_optica: optica.id, p_sede: sede }).single();
  if (error) throw new Error(`No se pudo leer el total por cobrar: ${error.message}`);
  const r = data as ResumenPorCobrar;
  return { por_cobrar: Number(r.por_cobrar), ordenes: r.ordenes, en_listos: Number(r.en_listos), ordenes_listas: r.ordenes_listas };
}
