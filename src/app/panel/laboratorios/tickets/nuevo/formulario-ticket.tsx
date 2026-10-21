"use client";

import { CopyPlus, Plus, Save, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { CampoFoto } from "@/components/campo-foto";
import { AreaTexto, Alerta, BotonEnviar, Campo, Selector } from "@/components/formulario";
import { Boton, claseControl } from "@/components/ui";
import type { OrdenParaTicket } from "@/lib/datos/cuentas-laboratorio";
import { fecha as formatoFecha, soles } from "@/lib/formato";
import { diferenciaOrdenes, vencimientoSugerido } from "@/lib/laboratorios/cuentas";
import { leerImporte } from "@/lib/validacion/orden";
import { agregarOrdenesATicket, buscarOrdenes, registrarTicket, type EstadoTicket } from "../../acciones-cuentas";

type Lab = { id: string; nombre: string; dias_credito: number };
type Linea = { orden_id: string; numero: number; paciente: string; monto: string };

const numeroOrden = (n: number) => `OT-${String(n).padStart(5, "0")}`;

export function FormularioTicket({
  laboratorios,
  hoy,
  sede,
  inicial,
}: {
  laboratorios: Lab[];
  hoy: string;
  sede: string;
  inicial?: { laboratorio?: string; orden?: OrdenParaTicket };
}) {
  const [estado, enviar] = useActionState(registrarTicket, {} as EstadoTicket);
  const v = estado.valores ?? {};
  const e = estado.campos ?? {};

  const [laboratorio, setLaboratorio] = useState(v.laboratorio_id ?? inicial?.laboratorio ?? "");
  const [fecha, setFecha] = useState(v.fecha ?? hoy);
  const [vence, setVence] = useState<string | null>(v.fecha_vencimiento ?? null);
  const [total, setTotal] = useState(v.monto_total ?? "");
  const [numero, setNumero] = useState(v.numero_ticket ?? "");
  // La confirmación vale solo para el número que se avisó como repetido.
  const confirmado = Boolean(estado.duplicado) && numero.trim().toLowerCase() === estado.duplicado?.numero_ticket.trim().toLowerCase();
  const [lineas, setLineas] = useState<Linea[]>(() => {
    if (v.ordenes) {
      try {
        return JSON.parse(v.lineas ?? "[]") as Linea[];
      } catch {
        return [];
      }
    }
    return inicial?.orden ? [{ orden_id: inicial.orden.id, numero: inicial.orden.numero, paciente: inicial.orden.paciente, monto: "" }] : [];
  });

  const lab = laboratorios.find((l) => l.id === laboratorio);
  const sugerido = lab ? vencimientoSugerido(fecha, lab.dias_credito) : fecha;
  const venceMostrado = vence ?? sugerido;
  const ordenesJson = JSON.stringify(lineas.map((l) => ({ orden_id: l.orden_id, monto: l.monto === "" ? "0" : l.monto })));
  const diferencia = useMemo(() => {
    const t = leerImporte(total);
    if (!Number.isFinite(t) || t <= 0 || lineas.length === 0) return 0;
    return diferenciaOrdenes(t, lineas.map((l) => (l.monto === "" ? 0 : leerImporte(l.monto))));
  }, [total, lineas]);

  const cambiarLab = (id: string) => {
    setLaboratorio(id);
    setVence(null);
    setLineas([]); // las órdenes son de un laboratorio
  };

  const repartir = () => {
    const t = leerImporte(total);
    if (!Number.isFinite(t) || lineas.length === 0) return;
    const parte = Math.floor((t / lineas.length) * 100) / 100;
    const ultima = Math.round((t - parte * (lineas.length - 1)) * 100) / 100;
    setLineas(lineas.map((l, i) => ({ ...l, monto: (i === lineas.length - 1 ? ultima : parte).toFixed(2) })));
  };

  return (
    <div className="flex flex-col gap-6">
      {confirmado && <AvisoDuplicado estado={estado} ordenesJson={ordenesJson} lineas={lineas} />}

      <form action={enviar} className="flex flex-col gap-6" noValidate>
        {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
        <input type="hidden" name="ordenes" value={ordenesJson} />
        <input type="hidden" name="lineas" value={JSON.stringify(lineas)} />
        <input type="hidden" name="fecha_vencimiento" value={venceMostrado} />
        {confirmado && <input type="hidden" name="confirmar_duplicado" value="on" />}

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Datos del ticket</legend>
          <Selector
            nombre="laboratorio_id"
            etiqueta="Laboratorio"
            required
            opciones={[{ valor: "", texto: "Elige el laboratorio" }, ...laboratorios.map((l) => ({ valor: l.id, texto: l.nombre }))]}
            value={laboratorio}
            onChange={(ev) => cambiarLab(ev.currentTarget.value)}
            errores={e.laboratorio_id}
          />
          <Campo
            nombre="numero_ticket"
            etiqueta="Número de ticket"
            required
            maxLength={40}
            autoComplete="off"
            value={numero}
            onChange={(ev) => setNumero(ev.currentTarget.value)}
            errores={e.numero_ticket}
          />
          <Campo nombre="fecha" etiqueta="Fecha del ticket" tipo="date" required max={hoy} value={fecha} onChange={(ev) => setFecha(ev.currentTarget.value)} errores={e.fecha} />
          <Campo
            nombre="monto_total"
            etiqueta="Monto total (S/)"
            inputMode="decimal"
            required
            autoComplete="off"
            value={total}
            onChange={(ev) => setTotal(ev.currentTarget.value)}
            errores={e.monto_total}
          />
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="vence" className="text-sm font-medium text-slate-700">
              Vence el
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="vence"
                type="date"
                min={fecha}
                value={venceMostrado}
                onChange={(ev) => setVence(ev.currentTarget.value || null)}
                className={`${claseControl} h-10 w-44`}
              />
              <span className="text-xs text-slate-500">
                {lab
                  ? lab.dias_credito === 0
                    ? "Contado: vence el mismo día."
                    : `${lab.dias_credito} días de crédito: ${formatoFecha(sugerido)}.`
                  : "Elige el laboratorio para calcularlo."}
                {vence && vence !== sugerido && (
                  <button type="button" onClick={() => setVence(null)} className="ml-2 font-medium text-marca-700 hover:underline">
                    Usar el calculado
                  </button>
                )}
              </span>
            </div>
            {e.fecha_vencimiento && <p className="text-xs text-red-600">{e.fecha_vencimiento[0]}</p>}
          </div>
          <div className="sm:col-span-2">
            <CampoFoto etiqueta="Foto del ticket" ayuda="Desde el celular se abre la cámara. Solo la ve el personal de esta sede." previa={v.foto_path || undefined} />
          </div>
        </fieldset>

        <section aria-labelledby="ordenes-ticket" className="flex flex-col gap-3 border-t border-slate-100 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="ordenes-ticket" className="text-sm font-semibold text-slate-900">
              Órdenes que cubre
            </h2>
            {lineas.length > 1 && (
              <Boton tamano="sm" onClick={repartir}>
                Repartir el total en partes iguales
              </Boton>
            )}
          </div>
          <BuscadorOrdenes laboratorio={laboratorio} elegidas={lineas.map((l) => l.orden_id)} onAgregar={(o) => setLineas([...lineas, { orden_id: o.id, numero: o.numero, paciente: o.paciente, monto: "" }])} />
          {lineas.length === 0 ? (
            <p className="text-sm text-slate-500">Busca por número de orden o por paciente y agrega las órdenes del ticket.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {lineas.map((l, i) => (
                <li key={l.orden_id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{numeroOrden(l.numero)}</p>
                    <p className="truncate text-xs text-slate-500">{l.paciente}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    Costo S/
                    <input
                      inputMode="decimal"
                      aria-label={`Costo de la orden ${numeroOrden(l.numero)}`}
                      value={l.monto}
                      onChange={(ev) => setLineas(lineas.map((x, j) => (j === i ? { ...x, monto: ev.currentTarget.value } : x)))}
                      placeholder="0.00"
                      className={`${claseControl} h-9 w-24 text-right`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setLineas(lineas.filter((_, j) => j !== i))}
                    aria-label={`Quitar la orden ${numeroOrden(l.numero)}`}
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {e.ordenes && <p className="text-xs text-red-600">{e.ordenes[0]}</p>}
          {diferencia !== 0 && (
            <Alerta tipo="aviso">
              La suma de las órdenes no coincide con el total del ticket: {diferencia > 0 ? "faltan" : "sobran"} {soles(Math.abs(diferencia))}.
              Puedes guardarlo así, pero revisa los costos.
            </Alerta>
          )}
        </section>

        <AreaTexto nombre="observaciones" etiqueta="Observaciones" maxLength={500} rows={2} defaultValue={v.observaciones} errores={e.observaciones} />

        <p className="text-xs text-slate-500">Se registra en la sede {sede}.</p>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
          <Link href="/panel/laboratorios" className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Cancelar
          </Link>
          <BotonEnviar pendiente="Guardando…" icono={confirmado ? CopyPlus : Save}>
            {confirmado ? "Registrar como ticket nuevo de todos modos" : "Registrar ticket"}
          </BotonEnviar>
        </div>
      </form>
    </div>
  );
}

function BuscadorOrdenes({ laboratorio, elegidas, onAgregar }: { laboratorio: string; elegidas: string[]; onAgregar: (o: OrdenParaTicket) => void }) {
  const [q, setQ] = useState("");
  const [resultado, setResultado] = useState<{ ordenes: OrdenParaTicket[]; error?: string } | null>(null);
  const [buscando, iniciar] = useTransition();

  const buscar = () => iniciar(async () => setResultado(await buscarOrdenes(laboratorio, q)));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="search"
          value={q}
          onChange={(ev) => setQ(ev.currentTarget.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              buscar();
            }
          }}
          placeholder={laboratorio ? "N.º de orden o paciente" : "Elige primero el laboratorio"}
          disabled={!laboratorio}
          aria-label="Buscar órdenes del laboratorio"
          className={`${claseControl} h-10 min-w-0 flex-1`}
        />
        <Boton icono={Search} onClick={buscar} disabled={!laboratorio || buscando}>
          {buscando ? "Buscando…" : "Buscar"}
        </Boton>
      </div>
      {resultado?.error && <p className="text-xs text-red-600">{resultado.error}</p>}
      {resultado && !resultado.error && (
        <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50">
          {resultado.ordenes.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Sin órdenes de este laboratorio en esta sede con esa búsqueda.</li>}
          {resultado.ordenes.map((o) => {
            const ya = elegidas.includes(o.id);
            return (
              <li key={o.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{numeroOrden(o.numero)}</p>
                  <p className="truncate text-xs text-slate-500">
                    {o.paciente} · {formatoFecha(o.creado_en)}
                  </p>
                </div>
                <Boton tamano="sm" icono={Plus} disabled={ya} onClick={() => onAgregar(o)}>
                  {ya ? "Agregada" : "Agregar"}
                </Boton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** El número ya existe en este laboratorio: ver ese ticket y agregarle las órdenes, o registrar uno nuevo. */
function AvisoDuplicado({ estado, ordenesJson, lineas }: { estado: EstadoTicket; ordenesJson: string; lineas: Linea[] }) {
  const d = estado.duplicado!;
  const [agregado, agregar] = useActionState(agregarOrdenesATicket.bind(null, d.id), {} as EstadoTicket);
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" aria-live="polite">
      <p className="font-semibold">Ya existe el ticket {d.numero_ticket} de este laboratorio.</p>
      {d.visible ? (
        <p>
          Del {formatoFecha(d.fecha)} por {soles(d.monto_total)}, con {d.ordenes} {d.ordenes === 1 ? "orden" : "órdenes"}.{" "}
          <Link href={`/panel/laboratorios/tickets/${d.id}`} className="font-medium underline" target="_blank">
            Ver ese ticket
          </Link>
        </p>
      ) : (
        <p>Está registrado en otra sede, así que no puedes verlo.</p>
      )}
      {agregado.error && <Alerta tipo="error">{agregado.error}</Alerta>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {d.visible && lineas.length > 0 && (
          <form action={agregar} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="ordenes" value={ordenesJson} />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="sumar_al_total" defaultChecked className="size-4" />
              Sumar el costo al total del ticket
            </label>
            <BotonEnviar pendiente="Agregando…" icono={Plus}>
              Agregar {lineas.length === 1 ? "la orden" : `las ${lineas.length} órdenes`} a ese ticket
            </BotonEnviar>
          </form>
        )}
      </div>
      <p className="text-xs">
        Si el laboratorio reutiliza talonarios y es otro ticket, confírmalo con el botón «Registrar como ticket nuevo de todos modos».
      </p>
    </section>
  );
}
