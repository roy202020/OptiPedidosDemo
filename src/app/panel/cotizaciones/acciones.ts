"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mensajeDb } from "@/lib/errores-db";
import { exigirOptica, exigirPermiso, sedeParaRegistrar } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const uuid = z.uuid();
const numero = (v: FormDataEntryValue | null) => v === null || v === "" ? null : Number(v);
const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export async function crearRegla(datos: FormData) {
  const optica = await exigirPermiso("administrarOptica");
  const producto = uuid.safeParse(texto(datos.get("producto_id")));
  const modalidad = z.enum(["terminada", "fabricacion_especial", "cotizacion_manual"]).safeParse(texto(datos.get("modalidad")));
  const unidad = z.enum(["por_luna", "por_par"]).safeParse(texto(datos.get("unidad_precio")));
  const vals = ["esfera_min", "esfera_max", "cilindro_min", "cilindro_max", "adicion_min", "adicion_max", "precio_base", "precio_venta", "costo"] as const;
  const n = Object.fromEntries(vals.map((k) => [k, numero(datos.get(k))])) as Record<(typeof vals)[number], number | null>;
  const volverConError = (mensaje: string): never => redirect(`/panel/cotizaciones/catalogo?error=${encodeURIComponent(mensaje)}`);
  if (!producto.success || !modalidad.success || !unidad.success || [n.esfera_min,n.esfera_max,n.cilindro_min,n.cilindro_max].some((x) => x === null || !Number.isFinite(x))) volverConError("Completa producto, modalidad y los cuatro límites de graduación.");
  if (n.esfera_min! > n.esfera_max!) volverConError("La esfera mínima no puede superar la máxima.");
  if (n.cilindro_min! > n.cilindro_max!) volverConError("El rango de cilindro está invertido: escribe primero el valor más negativo (por ejemplo, -2.00) y luego el más cercano a cero (por ejemplo, -0.25).");
  if (n.cilindro_min! < -10 || n.cilindro_max! > 0) volverConError("El cilindro debe estar entre -10.00 y 0.00.");
  const supabase = await crearClienteServidor();
  const {data: productoDb, error: errorProducto} = await supabase.from("lunas_productos").select("vision").eq("id",producto.data).eq("optica_id",optica.id).eq("activo",true).maybeSingle();
  if (errorProducto) volverConError("No se pudo comprobar el producto. Inténtalo nuevamente.");
  if (!productoDb) volverConError("El producto no está disponible en esta óptica.");
  const vision = productoDb?.vision;
  if (!vision) volverConError("El producto no tiene un diseño de visión configurado.");
  if (vision === "monofocal" && (n.adicion_min !== null || n.adicion_max !== null)) volverConError("El producto es monofocal: deja vacíos los campos de adición.");
  if (vision !== "monofocal" && (n.adicion_min === null || n.adicion_max === null || n.adicion_min > n.adicion_max)) volverConError("Este diseño requiere un rango de adición válido en ambos campos.");
  if (modalidad.data !== "cotizacion_manual" && (n.precio_base === null || n.precio_venta === null)) volverConError("Esta modalidad requiere precio base y precio de venta.");
  const { error } = await supabase.rpc("crear_regla_cotizacion_lunas", {
    p_producto: producto.data, p_modalidad: modalidad.data, p_esfera_min: n.esfera_min!, p_esfera_max: n.esfera_max!,
    p_cilindro_min: n.cilindro_min!, p_cilindro_max: n.cilindro_max!, p_adicion_min: n.adicion_min,
    p_adicion_max: n.adicion_max, p_unidad_precio: unidad.data, p_precio_base: n.precio_base,
    p_precio_venta: n.precio_venta, p_costo: n.costo,
  });
  if (error) redirect(`/panel/cotizaciones/catalogo?error=${encodeURIComponent(mensajeDb(error))}`);
  revalidatePath("/panel/cotizaciones", "layout");
  redirect("/panel/cotizaciones/catalogo?guardado=1");
}

export async function actualizarRegla(reglaId: string, datos: FormData) {
  const optica = await exigirPermiso("administrarOptica");
  if (!uuid.safeParse(reglaId).success) redirect("/panel/cotizaciones/catalogo");
  const n = (key: string) => numero(datos.get(key));
  const modalidad = z.enum(["terminada", "fabricacion_especial", "cotizacion_manual"]).safeParse(texto(datos.get("modalidad")));
  const unidad = z.enum(["por_luna", "por_par"]).safeParse(texto(datos.get("unidad_precio")));
  const values = { esfera_min:n("esfera_min"),esfera_max:n("esfera_max"),cilindro_min:n("cilindro_min"),cilindro_max:n("cilindro_max"),adicion_min:n("adicion_min"),adicion_max:n("adicion_max"),precio_base:n("precio_base"),precio_venta:n("precio_venta"),costo:n("costo") };
  if (!modalidad.success || !unidad.success || [values.esfera_min,values.esfera_max,values.cilindro_min,values.cilindro_max].some(x=>x===null)) redirect("/panel/cotizaciones/catalogo?error=datos");
  const supabase=await crearClienteServidor();
  const {costo,...regla}=values;
  const {error}=await supabase.from("lunas_reglas_cotizacion").update({modalidad:modalidad.data,unidad_precio:unidad.data,...regla,activo:datos.get("activo")==="on"}).eq("id",reglaId).eq("optica_id",optica.id);
  if(error) redirect(`/panel/cotizaciones/catalogo?error=${encodeURIComponent(mensajeDb(error))}`);
  const {error:errorCosto}=await supabase.from("lunas_reglas_cotizacion_costos").upsert({regla_id:reglaId,optica_id:optica.id,costo_unitario:costo},{onConflict:"regla_id"});
  if(errorCosto) redirect(`/panel/cotizaciones/catalogo?error=${encodeURIComponent(mensajeDb(errorCosto))}`);
  revalidatePath("/panel/cotizaciones","layout");redirect("/panel/cotizaciones/catalogo?guardado=1");
}

export async function crearCotizacion(datos: FormData) {
  await exigirOptica();
  const receta = uuid.safeParse(texto(datos.get("receta_id")));
  const paciente = uuid.safeParse(texto(datos.get("paciente_id")));
  const regla = uuid.safeParse(texto(datos.get("regla_id")));
  const { sede, error: errorSede } = await sedeParaRegistrar();
  const rutaError=(mensaje:string)=>{
    const params=new URLSearchParams();
    if(paciente.success)params.set("paciente",paciente.data);
    if(receta.success)params.set("receta",receta.data);
    params.set("error",mensaje);
    redirect(`/panel/cotizaciones/nueva?${params.toString()}`);
  };
  if (!receta.success || !regla.success || !sede) rutaError(errorSede ?? "Elige una receta y una regla");
  const vencimiento = texto(datos.get("vence_el")) || null;
  if (vencimiento && !/^\d{4}-\d{2}-\d{2}$/.test(vencimiento)) rutaError("La fecha de vencimiento no es válida.");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("crear_cotizacion_lunas", { p_receta: receta.data, p_sede: sede!.id, p_regla: regla.data, p_vence_el: vencimiento });
  if (error) rutaError(mensajeDb(error));
  revalidatePath("/panel/cotizaciones");
  redirect(`/panel/cotizaciones/${data}`);
}

export async function actualizarCotizacion(datos: FormData) {
  await exigirPermiso("administrarOptica");
  const id = uuid.safeParse(texto(datos.get("cotizacion_id")));
  if (!id.success) redirect("/panel/cotizaciones");
  const precio = numero(datos.get("precio_manual"));
  const descuento = numero(datos.get("descuento")) ?? 0;
  if ((precio !== null && (!Number.isFinite(precio) || precio < 0)) || !Number.isFinite(descuento) || descuento < 0) redirect(`/panel/cotizaciones/${id.data}?error=importe`);
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("actualizar_cotizacion_lunas", { p_cotizacion: id.data, p_precio_manual: precio, p_descuento: descuento });
  if (error) redirect(`/panel/cotizaciones/${id.data}?error=${encodeURIComponent(mensajeDb(error))}`);
  revalidatePath(`/panel/cotizaciones/${id.data}`);
  redirect(`/panel/cotizaciones/${id.data}?guardado=1`);
}

export async function aceptarCotizacion(datos: FormData) { await llamarEstado(datos, "aceptar_cotizacion_lunas"); }
export async function anularCotizacion(datos: FormData) { await llamarEstado(datos, "anular_cotizacion_lunas"); }

async function llamarEstado(datos: FormData, rpc: "aceptar_cotizacion_lunas" | "anular_cotizacion_lunas") {
  await exigirOptica();
  const id = uuid.safeParse(texto(datos.get("cotizacion_id")));
  if (!id.success) redirect("/panel/cotizaciones");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc(rpc, { p_cotizacion: id.data });
  if (error) redirect(`/panel/cotizaciones/${id.data}?error=${encodeURIComponent(mensajeDb(error))}`);
  revalidatePath(`/panel/cotizaciones/${id.data}`);
  redirect(`/panel/cotizaciones/${id.data}`);
}

export async function convertirCotizacion(datos: FormData) {
  await exigirOptica();
  const id = uuid.safeParse(texto(datos.get("cotizacion_id")));
  const laboratorio = uuid.safeParse(texto(datos.get("laboratorio_id")));
  const fecha = z.iso.date().safeParse(texto(datos.get("fecha_entrega")));
  if (!id.success || !laboratorio.success || !fecha.success) redirect("/panel/cotizaciones");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("convertir_cotizacion_lunas", {
    p_cotizacion: id.data, p_laboratorio: laboratorio.data,
    p_tipo_trabajo: texto(datos.get("tipo_trabajo")) || "lentes_completos",
    p_montura_descripcion: texto(datos.get("montura_descripcion")) || null,
    p_montura_origen: texto(datos.get("montura_origen")) || null,
    p_fecha_entrega: fecha.data,
    p_prioridad: texto(datos.get("prioridad")) === "urgente" ? "urgente" : "normal",
    p_observacion: texto(datos.get("observacion")) || null,
  });
  if (error) redirect(`/panel/cotizaciones/${id.data}?error=${encodeURIComponent(mensajeDb(error))}`);
  revalidatePath("/panel/ordenes", "layout");
  revalidatePath("/panel/cotizaciones");
  redirect(`/panel/ordenes/${data}`);
}
