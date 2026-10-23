import { notFound } from "next/navigation";
import type { VarianteDisponible } from "@/lib/cotizaciones/compatibilidad";
import { exigirOptica, obtenerSedeActual } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export async function listarReglasCotizacion() {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("lunas_reglas_cotizacion")
    .select("id, producto_id, modalidad, esfera_min, esfera_max, cilindro_min, cilindro_max, adicion_min, adicion_max, unidad_precio, precio_base, precio_venta, activo, lunas_productos(nombre,tipo,material,indice,tratamiento,color_tratamiento,superficie,vision,por_lado), lunas_reglas_cotizacion_costos(costo_unitario)")
    .eq("optica_id", optica.id)
    .order("activo", { ascending: false });
  if (error) throw new Error(`No se pudo leer el catálogo de cotización: ${error.message}`);
  return data ?? [];
}

export async function productosCotizables() {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("lunas_productos")
    .select("id,nombre,tipo,material,indice,tratamiento,color_tratamiento,superficie,vision,activo")
    .eq("optica_id", optica.id).eq("activo", true).order("nombre");
  if (error) throw new Error(`No se pudo leer los productos: ${error.message}`);
  return data ?? [];
}

export async function variantesDisponiblesCotizacion(sedeId: string, productos: string[]) {
  if (!productos.length) return [] as (VarianteDisponible & { producto_id: string })[];
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("lunas_variantes")
    .select("id,producto_id,esfera,cilindro,eje,adicion,lado,stock,reservado")
    .eq("optica_id",optica.id).eq("sede_id",sedeId).eq("activo",true).in("producto_id",productos);
  if (error) throw new Error(`No se pudo comprobar el stock exacto: ${error.message}`);
  return (data ?? []) as (VarianteDisponible & {producto_id:string})[];
}

export async function listarCotizaciones(pacienteId?: string) {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  let query = supabase.from("cotizaciones_lunas")
    .select("id,paciente_id,receta_id,sede_id,estado,version_actual,vence_el,creado_en,pacientes(nombres,apellidos),sedes(nombre),cotizaciones_lunas_versiones(numero,total,descuento,subtotal,estado,cotizaciones_lunas_lineas(producto_nombre,modalidad))")
    .eq("optica_id", optica.id).order("creado_en", { ascending: false }).limit(100);
  if (pacienteId) query = query.eq("paciente_id", pacienteId);
  const { data, error } = await query;
  if (error) throw new Error(`No se pudo leer el historial de cotizaciones: ${error.message}`);
  return data ?? [];
}

export async function obtenerCotizacion(id: string) {
  const { optica, actual } = await obtenerSedeActual();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("cotizaciones_lunas")
    .select("*,pacientes(id,nombres,apellidos,telefono),sedes(id,nombre),recetas(*),cotizaciones_lunas_versiones(*,cotizaciones_lunas_lineas(*)) ,cotizaciones_lunas_eventos(*)")
    .eq("id", id).eq("optica_id", optica.id).maybeSingle();
  if (error) throw new Error(`No se pudo leer la cotización: ${error.message}`);
  if (!data || (actual && data.sede_id !== actual.id)) notFound();
  return data;
}
