"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { leerImporte } from "@/lib/validacion/orden";
import { mensajeDb } from "@/lib/errores-db";
import type { EstadoFormulario } from "@/lib/estado-formulario";
const esquema=z.object({nombre:z.string().trim().min(1,"Escribe la marca y el modelo").max(160),codigo:z.string().trim().max(60),precio:z.preprocess(leerImporte,z.number("Escribe un precio válido con hasta 2 decimales").min(0).max(99999999)),activo:z.boolean()});
export async function guardarMontura(id:string|null,_prev:EstadoFormulario,datos:FormData):Promise<EstadoFormulario>{
  const optica=await exigirPermiso("administrarOptica");
  if(id&&!z.uuid().safeParse(id).success)return {error:"Montura inválida."};
  const r=esquema.safeParse({nombre:datos.get("nombre"),codigo:datos.get("codigo")??"",precio:datos.get("precio"),activo:datos.get("activo")==="on"});
  if(!r.success)return {campos:z.flattenError(r.error).fieldErrors};
  const db=await crearClienteServidor();const fila={...r.data,codigo:r.data.codigo||null};
  const {data,error}=id?await db.from("monturas").update(fila).eq("id",id).eq("optica_id",optica.id).select("id"):await db.from("monturas").insert({...fila,optica_id:optica.id}).select("id");
  if(error)return {error:mensajeDb(error)};
  if(!data?.length)return {error:"La montura ya no está disponible."};
  revalidatePath("/panel/monturas");revalidatePath("/panel/ordenes","layout");
  return {listo:true,aviso:"Montura guardada correctamente."};
}

export async function registrarStock(monturaId:string,sedeId:string,_prev:EstadoFormulario,datos:FormData):Promise<EstadoFormulario>{
  await exigirPermiso("administrarOptica");
  if(!z.uuid().safeParse(monturaId).success||!z.uuid().safeParse(sedeId).success)return {error:"Montura o sede inválida."};
  const r=z.object({tipo:z.enum(["entrada","conteo","devolucion"]),cantidad:z.preprocess(v=>typeof v==="string"&&/^\d+$/.test(v)?Number(v):Number.NaN,z.number("Escribe una cantidad entera").int().min(0).max(999999)),motivo:z.string().trim().min(3,"Indica el motivo").max(300)}).refine(d=>d.tipo==="conteo"||d.cantidad>0,{path:["cantidad"],message:"Ingresa al menos una unidad"}).safeParse({tipo:datos.get("tipo"),cantidad:datos.get("cantidad"),motivo:datos.get("motivo")});
  if(!r.success)return {campos:z.flattenError(r.error).fieldErrors};
  const db=await crearClienteServidor();const {error}=await db.rpc("registrar_stock_montura",{p_montura:monturaId,p_sede:sedeId,p_tipo:r.data.tipo,p_cantidad:r.data.cantidad,p_motivo:r.data.motivo});
  if(error)return {error:mensajeDb(error)};
  revalidatePath("/panel/monturas");revalidatePath("/panel/ordenes","layout");return {listo:true,aviso:"Stock actualizado correctamente."};
}
