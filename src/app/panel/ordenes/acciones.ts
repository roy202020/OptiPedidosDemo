"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { mensajeDb } from "@/lib/errores-db";
import { procesarAviso } from "@/lib/notificaciones";
import { ESTADOS_INTERNOS } from "@/lib/ordenes/estados";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { valoresDe } from "@/lib/validacion/comun";
import {
  erroresOrden,
  esquemaMotivo,
  esquemaObservacion,
  esquemaOrden,
  esquemaPago,
  leerFormularioOrden,
  ojosParaRpc,
  valoresOrden,
} from "@/lib/validacion/orden";

const idValido = (id: string) => z.uuid().safeParse(id).success;

/** `sedeId` es la sede mostrada en el formulario; la base valida acceso y que esté activa. */
export async function crearOrden(pacienteId: string, sedeId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  await exigirOptica();
  const valores = valoresOrden(datos);
  if (!idValido(pacienteId) || !idValido(sedeId)) return { error: "Paciente o sede inválidos.", valores };
  const r = esquemaOrden.safeParse(leerFormularioOrden(datos));
  if (!r.success) return { campos: erroresOrden(r.error), valores };

  const d = r.data;
  const supabase = await crearClienteServidor();
  const { data: id, error } = await supabase.rpc("crear_orden", {
    p_paciente: pacienteId,
    p_receta: d.receta_id,
    p_laboratorio: d.laboratorio_id,
    p_tipo_trabajo: d.tipo_trabajo,
    p_montura_descripcion: d.montura_descripcion,
    p_montura_origen: d.montura_origen,
    p_fecha_entrega: d.fecha_entrega_prometida,
    p_prioridad: d.prioridad,
    p_ojos: ojosParaRpc(d),
    p_observacion: d.observacion,
    p_precio: d.precio,
    p_descuento: d.descuento,
    p_sede: sedeId,
  });
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/panel/ordenes");
  redirect(`/panel/ordenes/${id}`);
}

export async function actualizarOrden(id: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  await exigirOptica();
  const valores = valoresOrden(datos);
  if (!idValido(id)) return { error: "Orden inválida.", valores };
  const r = esquemaOrden.safeParse(leerFormularioOrden(datos));
  if (!r.success) return { campos: erroresOrden(r.error), valores };

  const d = r.data;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("actualizar_orden_borrador", {
    p_orden: id,
    p_laboratorio: d.laboratorio_id,
    p_tipo_trabajo: d.tipo_trabajo,
    p_montura_descripcion: d.montura_descripcion ?? "",
    p_montura_origen: d.montura_origen ?? "",
    p_fecha_entrega: d.fecha_entrega_prometida,
    p_prioridad: d.prioridad,
    p_ojos: ojosParaRpc(d),
    p_precio: d.precio,
    p_descuento: d.descuento,
  });
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/panel/ordenes", "layout");
  redirect(`/panel/ordenes/${id}`);
}

const esquemaEstado = z.enum(ESTADOS_INTERNOS);

/**
 * Cambia el estado de una orden. La base valida la transición (transiciones_estado),
 * registra el historial y la auditoría. `desde` evita aplicar dos veces un cambio
 * hecho desde una pantalla desactualizada.
 */
export async function cambiarEstado(
  id: string,
  desde: string,
  hasta: string,
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  const d = esquemaEstado.safeParse(desde);
  const h = esquemaEstado.safeParse(hasta);
  if (!idValido(id) || !d.success || !h.success) return { error: "Cambio de estado inválido." };

  const cambios: { estado: string; motivo_anulacion?: string } = { estado: h.data };
  if (h.data === "anulada") {
    const m = esquemaMotivo.safeParse({ motivo: datos.get("motivo") ?? "" });
    if (!m.success) return { campos: z.flattenError(m.error).fieldErrors };
    cambios.motivo_anulacion = m.data.motivo;
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("ordenes")
    .update(cambios)
    .eq("id", id)
    .eq("optica_id", optica.id)
    .eq("estado", d.data)
    .select("id");
  if (error) return { error: mensajeDb(error) };
  if (!data.length) return { error: "La orden cambió mientras la veías. Recarga la página para ver su estado actual." };

  // La base ya encoló el aviso por WhatsApp; se envía después de responder, sin bloquear al usuario.
  if (h.data === "recibida_optica") after(() => procesarAviso(supabase, { orden_id: id }));

  revalidatePath("/panel", "layout");
  return { listo: true };
}

export async function agregarObservacion(id: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  if (!idValido(id)) return { error: "Orden inválida." };
  const r = esquemaObservacion.safeParse({ texto: datos.get("texto") ?? "" });
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("orden_observaciones").insert({ optica_id: optica.id, orden_id: id, texto: r.data.texto });
  if (error) return { error: mensajeDb(error) };

  revalidatePath(`/panel/ordenes/${id}`);
  return { listo: true };
}

/** Reintenta un aviso fallido u omitido (recalcula teléfono y consentimiento) y lo envía. */
export async function reintentarAviso(
  notificacionId: string,
  ordenId: string,
  _previo: EstadoFormulario,
  _datos: FormData,
): Promise<EstadoFormulario> {
  await exigirOptica();
  if (!idValido(notificacionId) || !idValido(ordenId)) return { error: "Aviso inválido." };
  const supabase = await crearClienteServidor();
  const { data: estado, error } = await supabase.rpc("reintentar_notificacion", { p_id: notificacionId });
  if (error) return { error: mensajeDb(error) };
  if (estado === "pendiente") await procesarAviso(supabase, { notificacion_id: notificacionId });
  revalidatePath(`/panel/ordenes/${ordenId}`);
  return { listo: true };
}

/** Registra un pago (adelanto o saldo). La base comprueba que no supere el saldo pendiente. */
export async function registrarPago(id: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  const valores = valoresDe(datos);
  if (!idValido(id)) return { error: "Orden inválida.", valores };
  const r = esquemaPago.safeParse({ importe: datos.get("importe") ?? "", medio: datos.get("medio") ?? "", fecha: datos.get("fecha") ?? "" });
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("orden_pagos").insert({ optica_id: optica.id, orden_id: id, ...r.data });
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath(`/panel/ordenes/${id}`);
  return { listo: true };
}

/** Anula un pago con motivo (los pagos no se editan ni se borran). */
export async function anularPago(pagoId: string, ordenId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  if (!idValido(pagoId) || !idValido(ordenId)) return { error: "Pago inválido." };
  const m = esquemaMotivo.safeParse({ motivo: datos.get("motivo") ?? "" });
  if (!m.success) return { campos: z.flattenError(m.error).fieldErrors };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("orden_pagos")
    .update({ motivo_anulacion: m.data.motivo })
    .eq("id", pagoId)
    .eq("optica_id", optica.id)
    .is("anulado_en", null)
    .select("id");
  if (error) return { error: mensajeDb(error) };
  if (!data.length) return { error: "El pago ya no está vigente. Recarga la página." };

  revalidatePath(`/panel/ordenes/${ordenId}`);
  return { listo: true };
}
