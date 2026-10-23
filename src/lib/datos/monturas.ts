import { exigirOptica, sedeFiltro } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { MonturaCatalogo } from "@/lib/monturas";
export async function listarMonturas(soloActivas=false,sedeId?:string):Promise<MonturaCatalogo[]> {
  const optica=await exigirOptica(); const db=await crearClienteServidor();
  const sede=sedeId??await sedeFiltro();
  let q=db.from("monturas").select("id,nombre,codigo,precio,activo").eq("optica_id",optica.id).order("nombre");
  if(soloActivas) q=q.eq("activo",true);
  let existencias=db.from("monturas_stock").select("montura_id,stock,reservado").eq("optica_id",optica.id);
  if(sede)existencias=existencias.eq("sede_id",sede);
  const [modelos,stock]=await Promise.all([q,existencias]);
  if(modelos.error||stock.error) throw new Error("No se pudo leer el catálogo y stock de monturas.");
  const cantidades=new Map<string,{stock:number;reservado:number}>();
  for(const s of stock.data??[]){const actual=cantidades.get(s.montura_id)??{stock:0,reservado:0};actual.stock+=Number(s.stock);actual.reservado+=Number(s.reservado);cantidades.set(s.montura_id,actual)}
  return (modelos.data??[]).map(m=>{const s=cantidades.get(m.id)??{stock:0,reservado:0};return {...m,precio:Number(m.precio),...s,disponible:s.stock-s.reservado}});
}
export async function movimientosMonturas(){
  const optica=await exigirOptica();const sede=await sedeFiltro();const db=await crearClienteServidor();
  let q=db.from("monturas_movimientos").select("id,tipo,variacion_stock,variacion_reservado,motivo,creado_en,orden_id,monturas(nombre),sedes(nombre)").eq("optica_id",optica.id).order("creado_en",{ascending:false}).order("id",{ascending:false}).limit(30);
  if(sede)q=q.eq("sede_id",sede);
  const {data,error}=await q;if(error)throw new Error("No se pudo leer el historial de monturas.");return data??[];
}
