"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { mensajeDb } from "@/lib/errores-db";
import { tienePermiso } from "@/lib/permisos";
import { exigirOptica, exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { valoresDe } from "@/lib/validacion/comun";
import { esquemaCompra, esquemaMovimiento, esquemaProducto, esquemaVariante } from "@/lib/validacion/inventario";

const idValido = (id: string) => z.uuid().safeParse(id).success;
const UNICO_PRODUCTO = { lunas_productos_optica_id_nombre_key: "Ya existe un producto con ese nombre." };

// ---------------------------------------------------------------- productos

export async function crearProducto(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  const valores = valoresDe(datos);
  const r = esquemaProducto.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("lunas_productos").insert({ ...r.data, optica_id: optica.id }).select("id").single();
  if (error) return { error: mensajeDb(error, UNICO_PRODUCTO), valores };
  revalidatePath("/panel/inventario", "layout");
  redirect(`/panel/inventario/productos/${data.id}`);
}

export async function actualizarProducto(id: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  if (!idValido(id)) return { error: "Producto inválido." };
  const valores = valoresDe(datos);
  const r = esquemaProducto.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("lunas_productos").update(r.data).eq("id", id).eq("optica_id", optica.id);
  if (error) return { error: mensajeDb(error, UNICO_PRODUCTO), valores };
  revalidatePath("/panel/inventario", "layout");
  redirect(`/panel/inventario/productos/${id}`);
}

export async function cambiarProductoActivo(id: string, activo: boolean, _previo: EstadoFormulario, _datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  if (!idValido(id)) return { error: "Producto inválido." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("lunas_productos").update({ activo }).eq("id", id).eq("optica_id", optica.id);
  if (error) return { error: mensajeDb(error) };
  revalidatePath("/panel/inventario", "layout");
  return { listo: true };
}

// ---------------------------------------------------------------- compras

/** Compra de muchas medidas (llegan como JSON desde la matriz). Una sola operación atómica. */
export async function registrarCompra(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  const valores = valoresDe(datos);
  let lineas: unknown = [];
  try {
    lineas = JSON.parse(String(datos.get("lineas") ?? "[]"));
  } catch {
    return { error: "No se pudieron leer las cantidades de la matriz.", valores };
  }
  const r = esquemaCompra.safeParse({ ...valores, lineas });
  if (!r.success) {
    const e = z.flattenError(r.error).fieldErrors;
    return { campos: e, error: e.lineas?.[0] ?? (Object.keys(e).length ? undefined : "Revisa las cantidades."), valores };
  }

  const d = r.data;
  const supabase = await crearClienteServidor();
  const { data: id, error } = await supabase.rpc("registrar_compra", {
    p_optica: optica.id,
    p_proveedor: d.proveedor ?? "",
    p_documento: d.documento ?? "",
    p_fecha: d.fecha,
    p_notas: d.notas ?? "",
    p_lineas: d.lineas.map((l) => ({ ...l, lote: d.lote })),
  });
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/panel/inventario", "layout");
  redirect(`/panel/inventario?vista=movimientos&compra=${id}`);
}

// ---------------------------------------------------------------- medidas

export async function actualizarVariante(id: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  if (!idValido(id)) return { error: "Medida inválida." };
  const valores = valoresDe(datos);
  const r = esquemaVariante.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("lunas_variantes").update(r.data).eq("id", id).eq("optica_id", optica.id);
  if (error) return { error: mensajeDb(error), valores };
  revalidatePath("/panel/inventario", "layout");
  return { listo: true, aviso: "Datos de la medida guardados.", valores };
}

/** Venta, pérdida o devolución (cualquier miembro) y ajuste (propietario o administrador). */
export async function registrarMovimiento(varianteId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  if (!idValido(varianteId)) return { error: "Medida inválida." };
  const valores = valoresDe(datos);
  const r = esquemaMovimiento.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const m = r.data;
  const jefe = tienePermiso(optica.rol, "administrarOptica");
  if (m.tipo === "ajuste" && !jefe) return { error: "Solo propietario o administrador registran ajustes.", valores };
  if (m.autoriza_negativo && !jefe) return { error: "Solo propietario o administrador autorizan stock negativo.", valores };

  const signo = m.tipo === "venta" || m.tipo === "perdida" ? -1 : 1;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("inventario_movimientos").insert({
    optica_id: optica.id,
    variante_id: varianteId,
    tipo: m.tipo,
    cantidad: m.tipo === "ajuste" ? m.cantidad : signo * Math.abs(m.cantidad),
    motivo: m.motivo,
    autoriza_negativo: m.autoriza_negativo,
  });
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/panel/inventario", "layout");
  return { listo: true, aviso: "Movimiento registrado." };
}

/** Inventario físico de un producto: solo las celdas contadas (c_<varianteId>). */
export async function registrarConteo(productoId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirPermiso("administrarOptica");
  if (!idValido(productoId)) return { error: "Producto inválido." };
  const lineas: { variante_id: string; contado: number }[] = [];
  for (const [k, v] of datos.entries()) {
    if (!k.startsWith("c_") || typeof v !== "string" || v.trim() === "") continue;
    const contado = Number(v);
    if (!Number.isInteger(contado) || contado < 0) return { error: "Las cantidades contadas deben ser números enteros, cero o más." };
    if (!idValido(k.slice(2))) return { error: "Medida inválida." };
    lineas.push({ variante_id: k.slice(2), contado });
  }
  if (!lineas.length) return { error: "Escribe la cantidad contada en al menos una medida." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("registrar_conteo", {
    p_optica: optica.id,
    p_notas: String(datos.get("notas") ?? "").slice(0, 300),
    p_lineas: lineas,
  });
  if (error) return { error: mensajeDb(error) };
  revalidatePath("/panel/inventario", "layout");
  redirect(`/panel/inventario/productos/${productoId}?conteo=ok`);
}

// ---------------------------------------------------------------- órdenes

export async function reservarLuna(ordenId: string, ojo: "OD" | "OI", varianteId: string, _previo: EstadoFormulario, _datos: FormData): Promise<EstadoFormulario> {
  await exigirOptica();
  if (!idValido(ordenId) || !idValido(varianteId) || (ojo !== "OD" && ojo !== "OI")) return { error: "Datos inválidos." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("reservar_luna", { p_orden: ordenId, p_ojo: ojo, p_variante: varianteId });
  if (error) return { error: mensajeDb(error) };
  revalidatePath(`/panel/ordenes/${ordenId}`);
  revalidatePath("/panel/inventario", "layout");
  return { listo: true };
}

export async function liberarLuna(ordenId: string, ojo: "OD" | "OI", _previo: EstadoFormulario, _datos: FormData): Promise<EstadoFormulario> {
  await exigirOptica();
  if (!idValido(ordenId) || (ojo !== "OD" && ojo !== "OI")) return { error: "Datos inválidos." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("liberar_luna", { p_orden: ordenId, p_ojo: ojo });
  if (error) return { error: mensajeDb(error) };
  revalidatePath(`/panel/ordenes/${ordenId}`);
  revalidatePath("/panel/inventario", "layout");
  return { listo: true };
}
