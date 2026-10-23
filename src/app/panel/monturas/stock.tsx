"use client";
import { useActionState,useId } from "react";
import { Alerta,BotonEnviar,Campo } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { claseControl } from "@/components/ui";
import { registrarStock } from "./acciones";
export function FormularioStock({monturaId,sedeId}:{monturaId:string;sedeId:string}){
 const id=useId();const [estado,accion]=useActionState(registrarStock.bind(null,monturaId,sedeId),{} as EstadoFormulario);
 return <form action={accion} className="grid gap-4 sm:grid-cols-2">
  {estado.error&&<div className="sm:col-span-2"><Alerta tipo="error">{estado.error}</Alerta></div>}
  {estado.aviso&&<p role="status" className="text-sm text-emerald-800 sm:col-span-2">{estado.aviso}</p>}
  <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">Movimiento<select name="tipo" className={`${claseControl} h-11`}><option value="entrada">Entrada / compra</option><option value="devolucion">Devolución recibida</option><option value="conteo">Ajustar al stock físico contado</option></select></label>
  <Campo id={id+"-cantidad"} nombre="cantidad" etiqueta="Cantidad de unidades" tipo="number" inputMode="numeric" min="0" max="999999" step="1" required errores={estado.campos?.cantidad}/>
  <Campo id={id+"-motivo"} nombre="motivo" etiqueta="Motivo" required minLength={3} maxLength={300} placeholder="Compra, devolución o corrección del conteo" errores={estado.campos?.motivo} className="sm:col-span-2"/>
  <p className="text-xs text-slate-500 sm:col-span-2">En entradas y devoluciones, la cantidad se suma. En conteo, escribe el total físico de la sede, incluidas las unidades reservadas. No puede ser menor que las reservas pendientes.</p>
  <div className="sm:col-span-2"><BotonEnviar pendiente="Actualizando…">Registrar movimiento</BotonEnviar></div>
 </form>;
}
