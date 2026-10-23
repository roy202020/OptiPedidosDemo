"use client";
import { useActionState, useId } from "react";
import { Alerta, BotonEnviar, Campo } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import type { MonturaCatalogo } from "@/lib/monturas";
import { guardarMontura } from "./acciones";
export function FormularioMontura({montura}:{montura?:MonturaCatalogo}){
  const prefijo=useId();
  const [estado,accion]=useActionState(guardarMontura.bind(null,montura?.id??null),{} as EstadoFormulario);
  return <form action={accion} className="grid gap-4 sm:grid-cols-2">
    {estado.error&&<div className="sm:col-span-2"><Alerta tipo="error">{estado.error}</Alerta></div>}
    {estado.aviso&&<div role="status" className="text-sm text-emerald-800 sm:col-span-2">{estado.aviso}</div>}
    <Campo id={`${prefijo}-nombre`} nombre="nombre" etiqueta="Marca, modelo y color" required maxLength={160} defaultValue={montura?.nombre} placeholder="Ej. Acetato 520 · Negro" errores={estado.campos?.nombre}/>
    <Campo id={`${prefijo}-codigo`} nombre="codigo" etiqueta="Código (opcional)" maxLength={60} defaultValue={montura?.codigo??""} errores={estado.campos?.codigo}/>
    <Campo id={`${prefijo}-precio`} nombre="precio" etiqueta="Precio de venta (S/)" required inputMode="decimal" defaultValue={montura?.precio.toFixed(2)} errores={estado.campos?.precio}/>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="activo" defaultChecked={montura?.activo??true} className="size-5 accent-marca-700"/>Disponible para nuevos pedidos</label>
    <div className="sm:col-span-2"><BotonEnviar pendiente="Guardando…">{montura?"Guardar cambios":"Agregar montura"}</BotonEnviar></div>
  </form>;
}
