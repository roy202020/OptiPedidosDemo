import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import type { EstadoPago, EstadoVencimiento, FilaDeuda, MedioPagoLab } from "@/lib/laboratorios/cuentas";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/*
 * Cuentas con los laboratorios. Todas las consultas pasan por RLS: el vendedor ve los tickets de sus
 * sedes; pagos, caja, deuda y ganancia solo propietario y administrador de la sede.
 */

export type TicketLab = {
  id: string;
  sede_id: string;
  laboratorio_id: string;
  laboratorio: string;
  numero_ticket: string;
  fecha: string;
  monto_total: number;
  fecha_vencimiento: string;
  foto_path: string | null;
  observaciones: string | null;
  registrado_por: string | null;
  creado_en: string;
  anulado_en: string | null;
  motivo_anulacion: string | null;
  pagado: number;
  deuda: number;
  estado_pago: EstadoPago;
  estado_vencimiento: EstadoVencimiento;
  dias_para_vencer: number;
  monto_ordenes: number;
  ordenes: number;
};

const COLUMNAS_TICKET =
  "id, sede_id, laboratorio_id, laboratorio, numero_ticket, fecha, monto_total, fecha_vencimiento, foto_path, observaciones, registrado_por, creado_en, anulado_en, motivo_anulacion, pagado, deuda, estado_pago, estado_vencimiento, dias_para_vencer, monto_ordenes, ordenes";

export type FiltrosCuenta = { laboratorio?: string; sede?: string | null; desde?: string; hasta?: string };

/** Tickets (vigentes y anulados) con su estado, del más próximo a vencer al más lejano. */
export async function listarTicketsLab(f: FiltrosCuenta & { soloPendientes?: boolean; limite?: number } = {}): Promise<TicketLab[]> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  let c = supabase.from("lab_tickets_estado").select(COLUMNAS_TICKET).eq("optica_id", optica.id);
  if (f.laboratorio) c = c.eq("laboratorio_id", f.laboratorio);
  if (f.sede) c = c.eq("sede_id", f.sede);
  if (f.desde) c = c.gte("fecha", f.desde);
  if (f.hasta) c = c.lte("fecha", f.hasta);
  if (f.soloPendientes) c = c.is("anulado_en", null).gt("deuda", 0);
  const { data, error } = await c.order("fecha_vencimiento").order("fecha").limit(f.limite ?? 200);
  if (error) throw new Error(`No se pudieron leer los tickets: ${error.message}`);
  return data as unknown as TicketLab[];
}

export type LineaTicket = { id: string; orden_id: string; monto: number; numero: number; paciente: string; precio_neto: number };
export type AplicacionTicket = {
  id: string;
  monto: number;
  pago: { id: string; fecha: string; medio: MedioPagoLab; numero_operacion: string | null; anulado_en: string | null };
};

export const obtenerTicketLab = cache(async (id: string) => {
  if (!z.uuid().safeParse(id).success) notFound();
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const [t, lineas, aplicaciones] = await Promise.all([
    supabase.from("lab_tickets_estado").select(COLUMNAS_TICKET).eq("optica_id", optica.id).eq("id", id).maybeSingle(),
    supabase
      .from("lab_ticket_ordenes")
      .select("id, orden_id, monto, orden:ordenes(numero, precio, descuento, paciente:pacientes(nombres, apellidos))")
      .eq("ticket_id", id)
      .order("creado_en"),
    // Vacío para el vendedor (RLS).
    supabase
      .from("lab_pago_aplicaciones")
      .select("id, monto, pago:lab_pagos(id, fecha, medio, numero_operacion, anulado_en)")
      .eq("ticket_id", id),
  ]);
  const error = t.error ?? lineas.error ?? aplicaciones.error;
  if (error) throw new Error(`No se pudo leer el ticket: ${error.message}`);
  if (!t.data) notFound();

  type Fila = { id: string; orden_id: string; monto: number; orden: { numero: number; precio: number; descuento: number; paciente: { nombres: string; apellidos: string } } };
  return {
    ticket: t.data as unknown as TicketLab,
    lineas: (lineas.data as unknown as Fila[]).map((l) => ({
      id: l.id,
      orden_id: l.orden_id,
      monto: Number(l.monto),
      numero: l.orden.numero,
      paciente: `${l.orden.paciente.apellidos}, ${l.orden.paciente.nombres}`,
      precio_neto: Number(l.orden.precio) - Number(l.orden.descuento),
    })) as LineaTicket[],
    aplicaciones: aplicaciones.data as unknown as AplicacionTicket[],
  };
});

/** Tickets que incluyen esta orden (costo de laboratorio de la orden). */
export async function ticketsDeOrden(ordenId: string) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("lab_ticket_ordenes")
    .select("monto, ticket_id")
    .eq("orden_id", ordenId);
  if (error) throw new Error(`No se pudo leer el costo de laboratorio: ${error.message}`);
  const lineas = data as { monto: number; ticket_id: string }[];
  if (lineas.length === 0) return [];
  const tickets = await supabase
    .from("lab_tickets_estado")
    .select("id, numero_ticket, estado_pago, estado_vencimiento, fecha_vencimiento, dias_para_vencer, anulado_en")
    .in("id", lineas.map((l) => l.ticket_id));
  if (tickets.error) throw new Error(`No se pudo leer el ticket: ${tickets.error.message}`);
  const porId = new Map((tickets.data as { id: string }[]).map((t) => [t.id, t]));
  return lineas.map((l) => ({
    monto: Number(l.monto),
    ticket: porId.get(l.ticket_id) as {
      id: string;
      numero_ticket: string;
      estado_pago: EstadoPago;
      estado_vencimiento: EstadoVencimiento;
      fecha_vencimiento: string;
      dias_para_vencer: number;
      anulado_en: string | null;
    },
  }));
}

export type PagoLab = {
  id: string;
  sede_id: string;
  laboratorio_id: string;
  fecha: string;
  monto: number;
  medio: MedioPagoLab;
  numero_operacion: string | null;
  foto_path: string | null;
  pagado_por: string | null;
  observaciones: string | null;
  creado_en: string;
  anulado_en: string | null;
  motivo_anulacion: string | null;
  aplicaciones: { monto: number; ticket: { id: string; numero_ticket: string } }[];
};

/** Historial de pagos (solo propietario y administrador: RLS). */
export async function listarPagosLab(f: FiltrosCuenta = {}): Promise<PagoLab[]> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  let c = supabase
    .from("lab_pagos")
    .select(
      "id, sede_id, laboratorio_id, fecha, monto, medio, numero_operacion, foto_path, pagado_por, observaciones, creado_en, anulado_en, motivo_anulacion, aplicaciones:lab_pago_aplicaciones(monto, ticket:lab_tickets(id, numero_ticket))",
    )
    .eq("optica_id", optica.id);
  if (f.laboratorio) c = c.eq("laboratorio_id", f.laboratorio);
  if (f.sede) c = c.eq("sede_id", f.sede);
  if (f.desde) c = c.gte("fecha", f.desde);
  if (f.hasta) c = c.lte("fecha", f.hasta);
  const { data, error } = await c.order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(200);
  if (error) throw new Error(`No se pudieron leer los pagos: ${error.message}`);
  return data as unknown as PagoLab[];
}

/** Correos de quienes registraron o pagaron (miembros de la óptica). */
export async function nombresMiembros(): Promise<Map<string, string>> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("miembros_optica", { p_optica: optica.id });
  return new Map(((data ?? []) as { usuario_id: string; email: string }[]).map((m) => [m.usuario_id, m.email]));
}

/** Deuda pendiente por laboratorio y vencimiento (propietario y administrador). */
export async function deudaLaboratorios(sede: string | null): Promise<FilaDeuda[]> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("lab_deuda_resumen", { p_optica: optica.id, p_sede: sede });
  if (error) throw new Error(`No se pudo leer la deuda con laboratorios: ${error.message}`);
  return (data as FilaDeuda[]).map((f) => ({ ...f, deuda: Number(f.deuda) }));
}

export type GananciaOrden = {
  orden_id: string;
  numero: number;
  paciente: string;
  sede: string;
  venta: number;
  costo_laboratorio: number;
  ganancia: number;
  con_ticket: boolean;
};

/** Ganancia de las órdenes confirmadas en el mes (venta neta − costo de laboratorio). */
export async function gananciaDelMes(sede: string | null): Promise<GananciaOrden[]> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("ganancia_ordenes_mes", { p_optica: optica.id, p_sede: sede });
  if (error) throw new Error(`No se pudo leer la ganancia: ${error.message}`);
  return (data as GananciaOrden[]).map((g) => ({
    ...g,
    venta: Number(g.venta),
    costo_laboratorio: Number(g.costo_laboratorio),
    ganancia: Number(g.ganancia),
  }));
}

export type OrdenParaTicket = { id: string; numero: number; paciente: string; estado: string; creado_en: string; precio_neto: number };

/** Órdenes del laboratorio y la sede para agregar a un ticket (por número o por paciente). */
export async function buscarOrdenesParaTicket(laboratorio: string, sede: string, q: string): Promise<OrdenParaTicket[]> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  let c = supabase
    .from("ordenes")
    .select("id, numero, estado, creado_en, precio, descuento, paciente:pacientes!inner(nombres, apellidos)")
    .eq("optica_id", optica.id)
    .eq("laboratorio_id", laboratorio)
    .eq("sede_id", sede)
    .neq("estado", "anulada");
  const texto = q.trim().replace(/[%_,()*]/g, " ").slice(0, 60);
  const numero = Number.parseInt(texto.replace(/\D/g, ""), 10);
  if (/^\D*\d+$/.test(texto) && Number.isFinite(numero)) c = c.eq("numero", numero);
  else for (const p of texto.split(/\s+/).filter(Boolean)) c = c.or(`nombres.ilike.*${p}*,apellidos.ilike.*${p}*`, { referencedTable: "pacientes" });
  const { data, error } = await c.order("creado_en", { ascending: false }).limit(20);
  if (error) throw new Error(`No se pudieron buscar las órdenes: ${error.message}`);
  type Fila = { id: string; numero: number; estado: string; creado_en: string; precio: number; descuento: number; paciente: { nombres: string; apellidos: string } };
  return (data as unknown as Fila[]).map((o) => ({
    id: o.id,
    numero: o.numero,
    estado: o.estado,
    creado_en: o.creado_en,
    paciente: `${o.paciente.apellidos}, ${o.paciente.nombres}`,
    precio_neto: Number(o.precio) - Number(o.descuento),
  }));
}

export type Caja = {
  id: string;
  sede_id: string;
  abierta_en: string;
  abierta_por: string;
  monto_inicial: number;
  cerrada_en: string | null;
  cerrada_por: string | null;
  monto_contado: number | null;
  observaciones: string | null;
};

/** Caja abierta de la sede (o null). Solo propietario y administrador la ven. */
export async function cajaAbierta(sede: string): Promise<Caja | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("cajas").select("*").eq("sede_id", sede).is("cerrada_en", null).maybeSingle();
  if (error) throw new Error(`No se pudo leer la caja: ${error.message}`);
  return data as Caja | null;
}

export async function listarCajas(sede: string, limite = 10): Promise<Caja[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("cajas").select("*").eq("sede_id", sede).order("abierta_en", { ascending: false }).limit(limite);
  if (error) throw new Error(`No se pudieron leer las cajas: ${error.message}`);
  return data as Caja[];
}

export type ResumenCaja = { monto_inicial: number; cobros_efectivo: number; egresos: number; esperado: number };

export async function resumenCaja(caja: string): Promise<ResumenCaja> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("caja_resumen", { p_caja: caja }).single();
  if (error) throw new Error(`No se pudo leer el resumen de caja: ${error.message}`);
  const r = data as ResumenCaja;
  return {
    monto_inicial: Number(r.monto_inicial),
    cobros_efectivo: Number(r.cobros_efectivo),
    egresos: Number(r.egresos),
    esperado: Number(r.esperado),
  };
}

export type MovimientoCaja = {
  id: string;
  tipo: "egreso";
  monto: number;
  concepto: string;
  lab_pago_id: string | null;
  creado_por: string | null;
  creado_en: string;
  anulado_en: string | null;
  motivo_anulacion: string | null;
};

export async function movimientosCaja(caja: string): Promise<MovimientoCaja[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("caja_movimientos").select("*").eq("caja_id", caja).order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`);
  return data as MovimientoCaja[];
}
