"use client";

import { ArrowLeft, ArrowRight, Save } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Alerta, AreaTexto, BotonEnviar, Campo, Seccion, Selector } from "@/components/formulario";
import { ConfiguracionLentes } from "./configuracion-lentes";
import { Boton, EnlaceBoton } from "@/components/ui";
import { sumarPreciosPedido, calcularPrecioLunas, type RecetaPrecio, type TarifaLuna, type ResultadoPrecio } from "@/lib/ordenes/precio";
import { leerFormularioOrden, leerImporte } from "@/lib/validacion/orden";
import type { MonturaCatalogo } from "@/lib/monturas";
import { soles } from "@/lib/formato";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { ORIGENES_MONTURA, PRIORIDADES, TIPOS_TRABAJO } from "@/lib/ordenes/estados";

type Opcion = { valor: string; texto: string; ojos?: ("od" | "oi")[]; rx?: RecetaPrecio };

type Props = {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  recetas: Opcion[];
  tarifas?: TarifaLuna[];
  monturas?: MonturaCatalogo[];
  laboratorios: Opcion[];
  /** Ojos que tiene la receta (en edición, los de la orden). */
  ojos: ("od" | "oi")[];
  inicial?: Record<string, string>;
  hoy: string;
  cancelar: string;
  edicion?: boolean;
};

const opciones = (o: Record<string, string>, vacio?: string): Opcion[] => [
  ...(vacio ? [{ valor: "", texto: vacio }] : []),
  ...Object.entries(o).map(([valor, texto]) => ({ valor, texto })),
];

export function FormularioOrden({ accion, recetas, laboratorios, ojos, inicial = {}, hoy, cancelar, edicion, tarifas, monturas = [] }: Props) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const [paso, setPaso] = useState(0);
  const [recetaElegida, setRecetaElegida] = useState(inicial.receta_id ?? recetas[0]?.valor);
  const formulario = useRef<HTMLFormElement>(null);
  const tituloPaso = useRef<HTMLHeadingElement>(null);
  const [revision, setRevision] = useState<{receta:string; laboratorio:string; entrega:string; trabajo:string; lentes:string} | null>(null);
  const [monturaId, setMonturaId] = useState(inicial.montura_catalogo_id ?? "");
  const [origenMontura, setOrigenMontura] = useState(inicial.montura_origen ?? "");
  const [descripcionMontura, setDescripcionMontura] = useState(inicial.montura_descripcion ?? "");
  const [montura, setMontura] = useState(inicial.precio_montura ?? "");
  const [descuento, setDescuento] = useState(inicial.descuento ?? "");
  const [automatico, setAutomatico] = useState(!edicion);
  const [calculo, setCalculo] = useState<ResultadoPrecio>({error:"Elige material e índice para calcular el precio."});
  const [precioManual, setPrecioManual] = useState(inicial.precio ? (Number(inicial.precio) - Number(inicial.precio_montura ?? 0)).toFixed(2) : "");
  const etapas = ["Receta y entrega", "Lentes y montura", "Precio y revisión"];
  const ir = (indice: number) => { setPaso(indice); requestAnimationFrame(() => { tituloPaso.current?.focus(); tituloPaso.current?.scrollIntoView({block:"start", behavior:"instant"}); }); };
  useEffect(() => {
    const campos = Object.keys(estado.campos ?? {});
    if (!campos.length && !estado.error) return;
    const nodo = campos.length ? formulario.current?.elements.namedItem(campos[0]) : null;
    const seccion = nodo instanceof HTMLElement ? nodo.closest<HTMLElement>("[data-paso]") : null;
    const indice = seccion ? Number(seccion.dataset.paso) : 2;
    const frame = requestAnimationFrame(() => { setPaso(indice); requestAnimationFrame(() => { if(nodo instanceof HTMLElement) nodo.focus(); else tituloPaso.current?.focus(); }); });
    return () => cancelAnimationFrame(frame);
  }, [estado]);
  const continuar = () => {
    const actual = formulario.current?.querySelector<HTMLElement>(`[data-paso="${paso}"]`);
    const campos = actual?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
    for (const campo of campos ?? []) { if (!campo.checkValidity()) { campo.reportValidity(); return; } }
    ir(paso+1);
  };
  const v = estado.valores ?? inicial;
  const e = estado.campos ?? {};

  const precioLunas = tarifas && automatico ? calculo.total ?? Number.NaN : leerImporte(precioManual);
  const precioMontura = leerImporte(montura);
  const precioTotal = sumarPreciosPedido(precioLunas, precioMontura);
  const descuentoNumero = leerImporte(descuento);
  const importe = Number.isFinite(precioTotal) && Number.isFinite(descuentoNumero) && descuentoNumero <= precioTotal ? soles(Math.round((precioTotal - descuentoNumero) * 100) / 100) : "Revisa los importes";
  return (
    <form ref={formulario} action={enviar} onSubmit={event => { if(paso < 2) { event.preventDefault(); continuar(); } }} onChange={() => { requestAnimationFrame(() => {
      const datos = formulario.current ? new FormData(formulario.current) : null;
      if (datos?.get("modo_precio") === "automatico" && tarifas) {
        const rx = recetas.find(r => r.valor === datos.get("receta_id"))?.rx;
        const resultado = rx ? calcularPrecioLunas(leerFormularioOrden(datos), rx, tarifas) : {error:"Elige una receta para calcular el precio."};
        setCalculo(resultado);
      }
      if(datos) setRevision({
        lentes: datos.get("ojos_pedido") === "od" ? "Solo ojo derecho (1 lente)" : datos.get("ojos_pedido") === "oi" ? "Solo ojo izquierdo (1 lente)" : "Ambos ojos (2 lentes)",
        receta: recetas.find(r=>r.valor===datos.get("receta_id"))?.texto ?? "Sin receta",
        laboratorio: laboratorios.find(l=>l.valor===datos.get("laboratorio_id"))?.texto ?? "Sin laboratorio",
        entrega: String(datos.get("fecha_entrega_prometida") ?? ""),
        trabajo: TIPOS_TRABAJO[String(datos.get("tipo_trabajo")) as keyof typeof TIPOS_TRABAJO] ?? "",
      });
    }); }} className="flex flex-col gap-6" noValidate>
      <ol aria-label="Pasos del pedido" className="grid grid-cols-3 gap-2">{etapas.map((etapa,i)=><li key={etapa}><button type="button" onClick={()=>ir(i)} aria-current={paso===i?"step":undefined} className={`flex min-h-16 w-full flex-col items-start gap-1 rounded-xl border p-3 text-left text-sm font-medium leading-5 ${paso===i?"border-marca-500 bg-marca-50 text-marca-800":"border-slate-200 text-slate-500"}`}><span className="text-xs">Paso {i+1}</span><strong className="font-medium">{etapa}</strong></button></li>)}</ol>
      <h2 ref={tituloPaso} tabIndex={-1} className="text-lg font-semibold text-slate-900 outline-none">{etapas[paso]}</h2>
      <p className="-mt-4 text-sm text-slate-500">Los campos con * son obligatorios. Puedes volver a los pasos anteriores sin perder lo escrito.</p>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      {Object.keys(e).length > 0 && <Alerta tipo="error">Revisa los campos marcados.</Alerta>}

      <div data-paso="0" hidden={paso !== 0} className="space-y-6">
      <Seccion titulo="Receta y laboratorio" descripcion="La graduación se copia de la receta al crear la orden y no cambia después.">
        {edicion ? (
          <>
            <input type="hidden" name="receta_id" value={v.receta_id} />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Receta</span>
              <p className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                {recetas[0]?.texto}
              </p>
            </div>
          </>
        ) : (
          <Selector
            onChange={event => setRecetaElegida(event.target.value)}
            nombre="receta_id"
            etiqueta="Receta"
            required
            opciones={recetas}
            defaultValue={v.receta_id ?? recetas[0]?.valor}
            errores={e.receta_id}
          />
        )}
        <Selector
          nombre="laboratorio_id"
          etiqueta="Laboratorio"
          required
          opciones={[{ valor: "", texto: "Elige un laboratorio" }, ...laboratorios]}
          defaultValue={v.laboratorio_id ?? (laboratorios.length === 1 ? laboratorios[0].valor : "")}
          errores={e.laboratorio_id}
        />
      </Seccion>

      <Seccion titulo="Trabajo" descripcion="Qué se pide al laboratorio y para cuándo.">
        <Selector nombre="tipo_trabajo" etiqueta="Tipo de trabajo" opciones={opciones(TIPOS_TRABAJO)} defaultValue={v.tipo_trabajo ?? "lentes_completos"} errores={e.tipo_trabajo} />
        <Selector nombre="prioridad" etiqueta="Prioridad" opciones={opciones(PRIORIDADES)} defaultValue={v.prioridad ?? "normal"} errores={e.prioridad} />
        <Campo
          nombre="fecha_entrega_prometida"
          etiqueta="Entrega prometida al paciente"
          tipo="date"
          required
          min={hoy}
          defaultValue={v.fecha_entrega_prometida}
          errores={e.fecha_entrega_prometida}
        />
      </Seccion>
      </div>
      <div data-paso="1" hidden={paso !== 1} className="space-y-6">
      <Seccion titulo="Montura" descripcion="Elige del catálogo para completar su descripción y precio automáticamente.">
        <Selector nombre="montura_catalogo_id" etiqueta="Montura del catálogo" opciones={[{valor:"",texto:"Ingreso manual / montura del paciente"},...monturas.map(m=>({valor:m.id,texto:`${m.nombre}${m.codigo ? ` · ${m.codigo}` : ""} · ${soles(m.precio)} · ${m.disponible > 0 ? `${m.disponible} ${m.disponible === 1 ? "disponible" : "disponibles"}` : "Sin stock"}${m.activo ? "" : " (pedido anterior)"}`,disabled:m.disponible<=0 && m.id!==inicial.montura_catalogo_id}))]} value={monturaId} onChange={event=>{const id=event.target.value;setMonturaId(id);const m=monturas.find(m=>m.id===id);if(m){setMontura(m.precio.toFixed(2));setDescripcionMontura(m.nombre);setOrigenMontura("optica");}else{setMontura("");setDescripcionMontura("");}}} errores={e.montura_catalogo_id} className="sm:col-span-2" ayuda={monturaId ? "Se reservará una unidad al guardar y se descontará del stock al enviar el pedido al laboratorio." : "También puedes ingresar una montura y su precio manualmente."}/>
        <a href="/panel/monturas" target="_blank" rel="noopener noreferrer" className="min-h-11 py-2 text-sm font-medium text-marca-700 underline sm:col-span-2">Ver catálogo de monturas</a>
        <Selector
          nombre="montura_origen"
          etiqueta="Origen de la montura"
          opciones={opciones(ORIGENES_MONTURA, "Sin especificar")}
          value={origenMontura}
          onChange={event=>{setOrigenMontura(event.target.value);if(event.target.value!=="optica"){setMonturaId("");setMontura("");setDescripcionMontura("");}}}
          errores={e.montura_origen}
        />
        <Campo
          nombre="montura_descripcion"
          etiqueta="Descripción de la montura"
          placeholder="Marca, modelo, color, medida"
          maxLength={200}
          className="sm:col-span-2"
          value={descripcionMontura} onChange={event=>setDescripcionMontura(event.target.value)} readOnly={Boolean(monturaId)}
          errores={e.montura_descripcion}
        />
      </Seccion>
      <ConfiguracionLentes ojos={recetas.find(r => r.valor === recetaElegida)?.ojos ?? ojos} valores={v} errores={e} edicion={edicion} />

      </div>
      <div data-paso="2" hidden={paso !== 2} className="space-y-6">
      {revision && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm"><h3 className="mb-3 font-semibold text-slate-900">Revisa antes de guardar</h3><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Laboratorio</dt><dd>{revision.laboratorio}</dd></div><div><dt className="text-xs text-slate-500">Entrega prometida</dt><dd>{revision.entrega || "Sin fecha"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-slate-500">Receta</dt><dd className="break-words">{revision.receta}</dd></div><div><dt className="text-xs text-slate-500">Trabajo</dt><dd>{revision.trabajo}</dd></div><div><dt className="text-xs text-slate-500">Lentes del pedido</dt><dd>{revision.lentes}</dd></div></dl><button type="button" onClick={()=>ir(0)} className="mt-3 min-h-11 text-sm font-medium text-marca-700 underline">Cambiar datos</button></div>}
      <Seccion titulo="Importe" descripcion="En soles, IGV incluido. Solo se puede cambiar mientras la venta está iniciada.">
        {tarifas && <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2"><input type="checkbox" checked={automatico} onChange={event => setAutomatico(event.target.checked)} className="size-5 accent-marca-700" />Calcular automáticamente desde el catálogo de lunas</label>}
        <input type="hidden" name="precio" value={Number.isFinite(precioTotal) ? precioTotal.toFixed(2) : ""} />
        <input type="hidden" name="modo_precio" value={tarifas && automatico ? "automatico" : "manual"} />
        {tarifas && automatico ? <>
          <Campo nombre="precio_lunas" etiqueta="Precio de las lunas (S/)" readOnly value={calculo.total?.toFixed(2) ?? ""} errores={e.precio} ayuda="Incluye los tratamientos de la tarifa. La montura se suma por separado." />
          <div role="status" className="text-sm sm:col-span-2">{calculo.error ? <p className="text-amber-800">{calculo.error} Configura el precio en Cotizaciones → Catálogo o desactiva el cálculo para un precio acordado.</p> : <ul className="space-y-1 text-slate-600">{calculo.lineas?.map(l => <li key={l.ojo}>{l.ojo} · {l.nombre}: {soles(l.importe)}</li>)}</ul>}</div>
        </> : <Campo nombre="precio_lunas" etiqueta="Precio acordado de las lunas (S/)" inputMode="decimal" required placeholder="0.00" value={precioManual} onChange={event => setPrecioManual(event.target.value)} errores={e.precio} />}
        <Campo nombre="precio_montura" etiqueta="Precio de la montura (S/)" inputMode="decimal" placeholder="0.00" value={montura} readOnly={Boolean(monturaId)} onChange={event => setMontura(event.target.value)} errores={e.precio_montura} ayuda={monturaId ? `${edicion && monturaId === inicial.montura_catalogo_id ? "Precio guardado" : "Precio del catálogo"}: ${descripcionMontura}. Se cobra una sola vez.` : "Opcional. Déjalo en 0 si no vendes una montura; se cobra una sola vez."} />
        <Campo nombre="descuento" etiqueta="Descuento (S/)" inputMode="decimal" placeholder="0.00" value={descuento} onChange={event => setDescuento(event.target.value)} errores={e.descuento} />
      </Seccion>


      {!edicion && (
        <Seccion titulo="Observación" descripcion="Opcional. Queda registrada en la orden con tu usuario.">
          <AreaTexto nombre="observacion" etiqueta="Observación inicial" maxLength={1000} className="sm:col-span-2" defaultValue={v.observacion} errores={e.observacion} />
        </Seccion>
      )}

      <div className="rounded-xl bg-marca-50 p-4"><p className="text-xs font-medium text-marca-700">Total del pedido · IGV incluido</p><dl className="my-3 space-y-1 text-sm text-slate-700"><div className="flex justify-between gap-3"><dt>Lunas</dt><dd>{Number.isFinite(precioLunas) ? soles(precioLunas) : "Pendiente"}</dd></div><div className="flex justify-between gap-3"><dt>Montura</dt><dd>{Number.isFinite(precioMontura) ? soles(precioMontura) : "Revisa el importe"}</dd></div><div className="flex justify-between gap-3"><dt>Descuento</dt><dd>{Number.isFinite(descuentoNumero) ? soles(descuentoNumero) : "Revisa el importe"}</dd></div></dl><output aria-live="polite" className="mt-1 block text-2xl font-semibold text-marca-900">{tarifas && automatico && calculo.error ? "Pendiente de tarifa" : importe}</output><p className="mt-2 text-sm text-slate-600">Se guardará como venta iniciada. Después podrás registrar el adelanto, enviar al laboratorio e imprimir los tickets.</p></div>
      </div>
      <div className="acciones-formulario flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Paso {paso+1} de 3</p>
        <div className="flex flex-wrap items-center gap-2">
        <EnlaceBoton href={cancelar}>Cancelar</EnlaceBoton>
        {paso > 0 && <Boton icono={ArrowLeft} onClick={()=>ir(paso-1)}>Atrás</Boton>}
        {paso < 2 ? <Boton variante="primario" icono={ArrowRight} onClick={continuar}>Continuar</Boton> : <BotonEnviar pendiente="Guardando…" icono={Save} disabled={Boolean(tarifas && automatico && calculo.error)}>
          {edicion ? "Guardar cambios" : "Guardar pedido"}
        </BotonEnviar>}
        </div>
      </div>
    </form>
  );
}
