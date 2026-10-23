import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { TarifaLuna } from "@/lib/ordenes/precio";

/** Solo precios de venta: los costos y márgenes no viajan al navegador. RLS sigue vigente. */
export async function tarifasParaPedidos(): Promise<TarifaLuna[]> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("lunas_reglas_cotizacion")
    .select("id,esfera_min,esfera_max,cilindro_min,cilindro_max,adicion_min,adicion_max,unidad_precio,precio_venta,lunas_productos!inner(nombre,material,indice,tratamiento,color_tratamiento,vision,activo)")
    .eq("optica_id", optica.id).eq("activo", true).eq("lunas_productos.activo", true).neq("modalidad", "cotizacion_manual").not("precio_venta", "is", null);
  if (error) throw new Error(`No se pudieron consultar los precios: ${error.message}`);
  return (data ?? []).map(r => {
    const p = r.lunas_productos as unknown as { nombre:string; material:string|null; indice:number|null; tratamiento:string|null; color_tratamiento:string|null; vision:string };
    return { id:r.id, nombre:p.nombre, material:p.material, indice:p.indice, tratamiento:p.tratamiento, color:p.color_tratamiento, vision:p.vision,
      unidad:r.unidad_precio as TarifaLuna["unidad"], precio:Number(r.precio_venta), esfera_min:Number(r.esfera_min), esfera_max:Number(r.esfera_max), cilindro_min:Number(r.cilindro_min), cilindro_max:Number(r.cilindro_max), adicion_min:r.adicion_min === null ? null : Number(r.adicion_min), adicion_max:r.adicion_max === null ? null : Number(r.adicion_max) };
  });
}
