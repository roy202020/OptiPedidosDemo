"use client";

import { useState } from "react";
import { Alerta, Campo, Seccion, Selector } from "@/components/formulario";
import { indiceAlCambiarMaterial, indicesParaMaterial, MATERIALES_LUNA } from "@/lib/ordenes/materiales";
import { DISENOS, TRATAMIENTOS } from "@/lib/ordenes/estados";

type Ojo = "od" | "oi";
type Props = { ojos: Ojo[]; valores: Record<string, string>; errores: Record<string, string[] | undefined>; edicion?: boolean };
const CAMPOS = ["material", "indice", "diseno", "diametro_mm", "tinte", "tratamientos"] as const;


const NOMBRE = { ambos: "Ambos ojos (2 lentes)", od: "Solo ojo derecho · OD (1 lente)", oi: "Solo ojo izquierdo · OI (1 lente)" };

function opcionesConActual(opciones: string[], actual: string) {
  return [{ valor: "", texto: "Sin especificar" }, ...[...new Set([...opciones, ...(actual ? [actual] : [])])].map(valor => ({ valor, texto: valor }))];
}

export function ConfiguracionLentes({ ojos, valores, errores, edicion }: Props) {
  const primero = ojos[0] ?? "od";
  const diferentes = ojos.length === 2 && CAMPOS.some(c => (valores[`od_${c}`] ?? "") !== (valores[`oi_${c}`] ?? ""));
  const [modo, setModo] = useState(valores.configuracion_lentes ?? (diferentes ? "por_ojo" : "compartida"));
  const [seleccion, setSeleccion] = useState(valores.ojos_pedido ?? (ojos.length === 1 ? primero : "ambos"));
  const disponibles = [...(ojos.length === 2 ? ["ambos"] : []), ...ojos] as (keyof typeof NOMBRE)[];
  const elegido = disponibles.includes(seleccion as keyof typeof NOMBRE) ? seleccion : (disponibles[0] ?? primero);
  const activos = elegido === "ambos" ? ojos : ojos.filter(o => o === elegido);
  const comunes = Object.fromEntries(CAMPOS.map(c => [`luna_${c}`, valores[`luna_${c}`] ?? valores[`${primero}_${c}`] ?? ""]));

  return (
    <div className="space-y-6">
      <Seccion titulo="¿Qué lentes necesita?" descripcion="Para reponer un lente roto o rayado, elige únicamente el ojo correspondiente.">
        <Selector nombre="ojos_pedido" etiqueta="Lentes del pedido" opciones={disponibles.map(valor => ({ valor, texto: NOMBRE[valor] }))} value={elegido} onChange={event => setSeleccion(event.target.value)} disabled={edicion} errores={errores.ojos_pedido} className="sm:col-span-2" />
        {edicion && <input type="hidden" name="ojos_pedido" value={elegido} />}
        {edicion && <p className="text-xs text-slate-500 sm:col-span-2">Los ojos de este pedido se conservan. Para una reposición de otro ojo, crea un pedido nuevo.</p>}
        <p className="rounded-xl bg-marca-50 p-3 text-sm font-medium text-marca-800 sm:col-span-2" aria-live="polite">{NOMBRE[elegido as keyof typeof NOMBRE]}. La graduación de cada ojo se toma de la receta.</p>
      </Seccion>
      <input type="hidden" name="configuracion_lentes" value={modo} />
      <fieldset hidden={modo !== "compartida"} disabled={modo !== "compartida"}>
        <DatosLuna prefijo="luna" titulo="Datos de la luna" descripcion={elegido === "ambos" ? "Completa una sola vez: se aplicará el mismo material, índice y tratamiento a ambos lentes." : "Especificaciones del único lente que se fabricará."} valores={comunes} errores={errores} />
      </fieldset>
      {ojos.length === 2 && <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={modo === "por_ojo"} onChange={event => setModo(event.target.checked ? "por_ojo" : "compartida")} className="size-5 accent-marca-700" />Usar especificaciones diferentes por ojo (opcional)</label>}
      {modo === "por_ojo" && diferentes && <Alerta tipo="aviso">Este pedido tiene especificaciones distintas por ojo. Se conservan sin cambios mientras no elijas unificarlas.</Alerta>}
      {ojos.map(o => <fieldset key={o} hidden={modo !== "por_ojo" || !activos.includes(o)} disabled={modo !== "por_ojo" || !activos.includes(o)}><DatosLuna prefijo={o} titulo={o === "od" ? "Luna derecha (OD)" : "Luna izquierda (OI)"} descripcion="Especificaciones particulares de este ojo." valores={valores} errores={errores} /></fieldset>)}
    </div>
  );
}

function DatosLuna({ prefijo, titulo, descripcion, valores, errores }: { prefijo: string; titulo: string; descripcion: string; valores: Record<string,string>; errores: Record<string,string[] | undefined> }) {
  const v = (campo: string) => valores[`${prefijo}_${campo}`] ?? "";
  const e = (campo: string) => errores[`${prefijo}_${campo}`];
  const original = v("indice") && Number.isFinite(Number(v("indice"))) ? Number(v("indice")).toFixed(2) : v("indice");
  const [material, setMaterial] = useState(v("material"));
  const [indice, setIndice] = useState(() => {
    const permitidos = indicesParaMaterial(v("material"));
    return v("material") && permitidos ? indiceAlCambiarMaterial(v("material"), original) : original;
  });
  const compatibles = indicesParaMaterial(material);
  const opcionesIndice = compatibles ?? (original ? [original] : []);
  const anteriorIncompatible = material && material === v("material") && original && compatibles && !compatibles.includes(original);
  const cambiarMaterial = (nuevo: string) => {
    setMaterial(nuevo);
    setIndice(!indicesParaMaterial(nuevo) && nuevo === v("material") ? original : indiceAlCambiarMaterial(nuevo, indice));
  };
  return <Seccion titulo={titulo} descripcion={descripcion}>
    <Selector nombre={`${prefijo}_material`} etiqueta="Material" opciones={opcionesConActual(MATERIALES_LUNA, v("material"))} value={material} onChange={event => cambiarMaterial(event.target.value)} errores={e("material")} />
    <Selector nombre={`${prefijo}_indice`} etiqueta="Índice de la luna" opciones={[...(opcionesIndice.length === 1 ? [] : [{valor:"",texto:material ? "Elige un índice" : "Elige primero el material"}]), ...opcionesIndice.map(valor => ({valor,texto:valor}))]} value={indice} onChange={event => setIndice(event.target.value)} disabled={!material || !opcionesIndice.length} ayuda={compatibles?.length === 1 ? "Seleccionado automáticamente: es el único índice compatible." : undefined} errores={e("indice")} />
    {(!material || !opcionesIndice.length) && <input type="hidden" name={`${prefijo}_indice`} value={indice} />}
    {anteriorIncompatible && <p role="status" className="text-sm text-amber-800 sm:col-span-2">El índice anterior ({original}) no corresponde a este material. Revisa el índice compatible antes de guardar.</p>}
    {material && !compatibles && <p className="text-sm text-slate-500 sm:col-span-2">Material anterior: se conserva su índice. Elige un material de la lista para cambiarlo.</p>}
    <Selector nombre={`${prefijo}_diseno`} etiqueta="Diseño" opciones={[{valor:"",texto:"Sin especificar"},...Object.entries(DISENOS).map(([valor,texto])=>({valor,texto}))]} defaultValue={v("diseno")} errores={e("diseno")} />
    <Campo nombre={`${prefijo}_diametro_mm`} etiqueta="Diámetro (mm)" inputMode="numeric" defaultValue={v("diametro_mm")} errores={e("diametro_mm")} />
    <Campo nombre={`${prefijo}_tinte`} etiqueta="Tinte" maxLength={60} className="sm:col-span-2" defaultValue={v("tinte")} errores={e("tinte")} />
    <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm font-medium text-slate-700">Tratamientos</legend><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(TRATAMIENTOS).map(([valor,texto])=><label key={valor} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"><input type="checkbox" name={`${prefijo}_tratamientos`} value={valor} defaultChecked={v("tratamientos").split(",").includes(valor)} className="size-5 shrink-0 accent-marca-700" />{texto}</label>)}</div>{e("tratamientos") && <p role="alert" className="mt-2 text-xs text-red-600">{e("tratamientos")?.[0]}</p>}</fieldset>
  </Seccion>;
}
