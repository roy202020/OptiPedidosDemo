"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { archivoDe, subirFoto } from "@/lib/datos/archivos-laboratorio";
import { buscarOrdenesParaTicket, type OrdenParaTicket } from "@/lib/datos/cuentas-laboratorio";
import { mensajeDb } from "@/lib/errores-db";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { exigirOptica, exigirPermiso, sedeParaRegistrar } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { valoresDe } from "@/lib/validacion/comun";
import { esquemaAnulacion, esquemaEdicionTicket, esquemaPagoLab, esquemaTicket } from "@/lib/validacion/cuentas-laboratorio";

/*
 * Tickets y pagos a laboratorios. Las reglas (sede, laboratorio, deuda, duplicados, caja abierta,
 * permisos) las aplican las funciones de la base; aquí se valida el formulario y se sube la foto.
 */

const idValido = (id: string) => z.uuid().safeParse(id).success;

export type TicketDuplicado = {
  id: string;
  numero_ticket: string;
  fecha: string | null;
  monto_total: number | null;
  ordenes: number | null;
  /** false: el ticket es de una sede que el usuario no ve. */
  visible: boolean;
};

export type EstadoTicket = EstadoFormulario & { duplicado?: TicketDuplicado };

/** Búsqueda de órdenes del laboratorio en la sede donde se registra el ticket. */
export async function buscarOrdenes(laboratorio: string, q: string): Promise<{ ordenes: OrdenParaTicket[]; error?: string }> {
  await exigirOptica();
  if (!idValido(laboratorio)) return { ordenes: [], error: "Elige primero el laboratorio." };
  const { sede, error } = await sedeParaRegistrar();
  if (!sede) return { ordenes: [], error };
  return { ordenes: await buscarOrdenesParaTicket(laboratorio, sede.id, q) };
}

/** Foto nueva del formulario o la ya subida en un intento anterior (misma carpeta). */
async function fotoDelFormulario(
  datos: FormData,
  opticaId: string,
  sedeId: string,
  tipo: "tickets" | "pagos",
): Promise<{ ruta?: string; error?: string }> {
  const archivo = archivoDe(datos);
  if (archivo) return subirFoto(archivo, { opticaId, sedeId, tipo });
  const previa = String(datos.get("foto_path") ?? "");
  return { ruta: previa.startsWith(`${opticaId}/${sedeId}/${tipo}/`) ? previa : undefined };
}

export async function registrarTicket(_previo: EstadoTicket, datos: FormData): Promise<EstadoTicket> {
  const optica = await exigirOptica();
  const valores = valoresDe(datos);
  const { sede, error: errorSede } = await sedeParaRegistrar();
  if (!sede) return { error: errorSede, valores };
  const r = esquemaTicket.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const foto = await fotoDelFormulario(datos, optica.id, sede.id, "tickets");
  if (foto.error) return { error: foto.error, valores };
  const conFoto = { ...valores, foto_path: foto.ruta ?? "" };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("registrar_lab_ticket", {
    p_sede: sede.id,
    p_laboratorio: r.data.laboratorio_id,
    p_numero: r.data.numero_ticket,
    p_fecha: r.data.fecha,
    p_monto_total: r.data.monto_total,
    p_ordenes: r.data.ordenes,
    p_fecha_vencimiento: r.data.fecha_vencimiento,
    p_foto: foto.ruta ?? null,
    p_observaciones: r.data.observaciones,
    p_confirmar_duplicado: r.data.confirmar_duplicado,
  });
  if (error?.code === "LT409" && error.details) {
    const existente = await supabase
      .from("lab_tickets_estado")
      .select("id, numero_ticket, fecha, monto_total, ordenes")
      .eq("id", error.details)
      .maybeSingle();
    const t = existente.data as Omit<TicketDuplicado, "visible"> | null;
    return {
      valores: conFoto,
      duplicado: t
        ? { ...t, visible: true }
        : { id: error.details, numero_ticket: r.data.numero_ticket, fecha: null, monto_total: null, ordenes: null, visible: false },
    };
  }
  if (error) return { error: mensajeDb(error), valores: conFoto };

  revalidatePath("/panel", "layout");
  redirect(`/panel/laboratorios/tickets/${data}`);
}

/** Agrega las órdenes elegidas a un ticket ya registrado (número repetido). */
export async function agregarOrdenesATicket(ticketId: string, _previo: EstadoTicket, datos: FormData): Promise<EstadoTicket> {
  await exigirOptica();
  if (!idValido(ticketId)) return { error: "Ticket inválido." };
  const valores = valoresDe(datos);
  const r = esquemaTicket.shape.ordenes.safeParse(valores.ordenes);
  if (!r.success) return { error: "Agrega al menos una orden.", valores };

  const supabase = await crearClienteServidor();
  for (const o of r.data) {
    const { error } = await supabase.rpc("agregar_orden_lab_ticket", {
      p_ticket: ticketId,
      p_orden: o.orden_id,
      p_monto: o.monto,
      p_sumar_al_total: valores.sumar_al_total === "on",
    });
    if (error) return { error: mensajeDb(error, { lab_ticket_ordenes_ticket_id_orden_id_key: "Esa orden ya está en el ticket." }), valores };
  }
  revalidatePath("/panel", "layout");
  redirect(`/panel/laboratorios/tickets/${ticketId}`);
}

export async function actualizarTicket(ticketId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirPermiso("gestionarCuentasLaboratorio");
  if (!idValido(ticketId)) return { error: "Ticket inválido." };
  const valores = valoresDe(datos);
  const r = esquemaEdicionTicket.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  let ruta: string | null = null;
  const archivo = archivoDe(datos);
  if (archivo) {
    const { data: t } = await supabase.from("lab_tickets").select("sede_id").eq("id", ticketId).maybeSingle();
    if (!t) return { error: "No se encontró el ticket." };
    const foto = await subirFoto(archivo, { opticaId: optica.id, sedeId: t.sede_id, tipo: "tickets" });
    if (foto.error) return { error: foto.error, valores };
    ruta = foto.ruta ?? null;
  }
  const { error } = await supabase.rpc("actualizar_lab_ticket", {
    p_ticket: ticketId,
    p_fecha_vencimiento: r.data.fecha_vencimiento,
    p_monto_total: r.data.monto_total,
    p_observaciones: r.data.observaciones,
    p_foto: ruta,
  });
  if (error) return { error: mensajeDb(error), valores };
  revalidatePath("/panel", "layout");
  return { listo: true, aviso: "Ticket actualizado." };
}

export async function anularTicket(ticketId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  await exigirPermiso("gestionarCuentasLaboratorio");
  if (!idValido(ticketId)) return { error: "Ticket inválido." };
  const r = esquemaAnulacion.safeParse(valoresDe(datos));
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anular_lab_ticket", { p_ticket: ticketId, p_motivo: r.data.motivo });
  if (error) return { error: mensajeDb(error) };
  revalidatePath("/panel", "layout");
  return { listo: true };
}

export async function registrarPagoLab(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirPermiso("gestionarCuentasLaboratorio");
  const valores = valoresDe(datos);
  const { sede, error: errorSede } = await sedeParaRegistrar();
  if (!sede) return { error: errorSede, valores };
  const r = esquemaPagoLab.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const foto = await fotoDelFormulario(datos, optica.id, sede.id, "pagos");
  if (foto.error) return { error: foto.error, valores };
  const conFoto = { ...valores, foto_path: foto.ruta ?? "" };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("registrar_lab_pago", {
    p_sede: sede.id,
    p_laboratorio: r.data.laboratorio_id,
    p_fecha: r.data.fecha,
    p_medio: r.data.medio,
    p_aplicaciones: r.data.aplicaciones.filter((a) => a.monto > 0),
    p_numero_operacion: r.data.numero_operacion,
    p_foto: foto.ruta ?? null,
    p_observaciones: r.data.observaciones,
  });
  if (error) return { error: mensajeDb(error), valores: conFoto };

  revalidatePath("/panel", "layout");
  redirect(`/panel/laboratorios/${r.data.laboratorio_id}?vista=cuenta&pagado=1`);
}

export async function anularPagoLab(pagoId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  await exigirPermiso("gestionarCuentasLaboratorio");
  if (!idValido(pagoId)) return { error: "Pago inválido." };
  const r = esquemaAnulacion.safeParse(valoresDe(datos));
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anular_lab_pago", { p_pago: pagoId, p_motivo: r.data.motivo });
  if (error) return { error: mensajeDb(error) };
  revalidatePath("/panel", "layout");
  return { listo: true };
}
