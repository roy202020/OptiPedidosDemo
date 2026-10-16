import { ClipboardList, Columns3, List, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, claseBoton, claseControl, Encabezado, EnlaceBoton, EstadoVacio, Paginacion } from "@/components/ui";
import { listarLaboratorios } from "@/lib/datos/laboratorios";
import { listarOrdenes, listarTablero, ORDENES_POR_PAGINA, type FiltrosOrdenes, type OrdenResumen } from "@/lib/datos/ordenes";
import { fecha } from "@/lib/formato";
import { COMERCIAL, COMERCIAL_DE, ESTADOS_COMERCIALES, numeroOrden, type EstadoComercial } from "@/lib/ordenes/estados";
import { hoyISO } from "@/lib/validacion/comun";
import { MarcasOrden, TablaOrdenes } from "./componentes";

export const metadata: Metadata = { title: "Órdenes" };

type Props = PageProps<"/panel/ordenes">;

export default function PaginaOrdenes({ searchParams }: Props) {
  return (
    <>
      <Encabezado titulo="Órdenes de trabajo" descripcion="Seguimiento de cada pedido desde la venta hasta la entrega.">
        <EnlaceBoton href="/panel/ordenes/nueva" variante="primario" icono={Plus}>
          Nueva orden
        </EnlaceBoton>
      </Encabezado>
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 100) : undefined);

async function Contenido({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const filtros: FiltrosOrdenes = {
    q: texto(sp.q),
    estado: ESTADOS_COMERCIALES.includes(sp.estado as EstadoComercial) ? (sp.estado as EstadoComercial) : undefined,
    laboratorio: texto(sp.laboratorio),
    desde: texto(sp.desde),
    hasta: texto(sp.hasta),
    atrasadas: sp.atrasadas === "1",
    conSaldo: sp.saldo === "1",
    pagina: Math.max(1, Number.parseInt(String(sp.pagina ?? "1"), 10) || 1),
  };
  const tablero = sp.vista === "tablero";
  const labs = await listarLaboratorios();
  const hay = Object.entries(filtros).some(([k, v]) => k !== "pagina" && v);

  const href = (cambios: Record<string, string | undefined>) => {
    const actual: Record<string, string | undefined> = {
      q: filtros.q,
      estado: filtros.estado,
      laboratorio: filtros.laboratorio,
      desde: filtros.desde,
      hasta: filtros.hasta,
      atrasadas: filtros.atrasadas ? "1" : undefined,
      saldo: filtros.conSaldo ? "1" : undefined,
      vista: tablero ? "tablero" : undefined,
    };
    const s = new URLSearchParams(Object.entries({ ...actual, ...cambios }).filter((e): e is [string, string] => Boolean(e[1]))).toString();
    return `/panel/ordenes${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-tarjeta sm:grid-cols-2 lg:grid-cols-6">
        {tablero && <input type="hidden" name="vista" value="tablero" />}
        <div className="relative sm:col-span-2">
          <label htmlFor="f-q" className="sr-only">
            Buscar
          </label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input id="f-q" type="search" name="q" defaultValue={filtros.q} placeholder="N.º de orden o paciente" className={`${claseControl} h-10 pl-9`} />
        </div>
        {!tablero && (
          <select name="estado" aria-label="Estado" defaultValue={filtros.estado ?? ""} className={`${claseControl} h-10`}>
            <option value="">Todos los estados</option>
            {ESTADOS_COMERCIALES.map((e) => (
              <option key={e} value={e}>
                {COMERCIAL[e].texto}
              </option>
            ))}
          </select>
        )}
        <select name="laboratorio" aria-label="Laboratorio" defaultValue={filtros.laboratorio ?? ""} className={`${claseControl} h-10`}>
          <option value="">Todos los laboratorios</option>
          {labs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
              {l.activo ? "" : " (inactivo)"}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 lg:col-span-2">
          <input type="date" name="desde" aria-label="Creadas desde" defaultValue={filtros.desde} className={`${claseControl} h-10`} />
          <span className="text-slate-400">–</span>
          <input type="date" name="hasta" aria-label="Creadas hasta" defaultValue={filtros.hasta} className={`${claseControl} h-10`} />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="atrasadas" value="1" defaultChecked={filtros.atrasadas} className="size-4 accent-marca-700" />
            Solo atrasadas (fecha prometida vencida y aún no llegan a la óptica)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="saldo" value="1" defaultChecked={filtros.conSaldo} className="size-4 accent-marca-700" />
            Con saldo pendiente
          </label>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2 lg:justify-end">
          {hay && (
            <Link href={tablero ? "/panel/ordenes?vista=tablero" : "/panel/ordenes"} className={claseBoton("fantasma")}>
              Limpiar
            </Link>
          )}
          <button className={claseBoton("primario")}>Filtrar</button>
        </div>
      </form>

      <div className="flex justify-end">
        <div role="group" aria-label="Vista" className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm">
          {[
            { texto: "Tabla", icono: List, valor: undefined },
            { texto: "Tablero", icono: Columns3, valor: "tablero" },
          ].map(({ texto: t, icono: Icono, valor }) => {
            const activo = tablero === Boolean(valor);
            return (
              <Link
                key={t}
                href={href({ vista: valor, pagina: undefined })}
                aria-current={activo ? "true" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${activo ? "bg-marca-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <Icono aria-hidden className="size-4" />
                {t}
              </Link>
            );
          })}
        </div>
      </div>

      {tablero ? <Tablero filtros={filtros} /> : <Listado filtros={filtros} hay={hay} href={href} />}
    </div>
  );
}

async function Listado({ filtros, hay, href }: { filtros: FiltrosOrdenes; hay: boolean; href: (c: Record<string, string | undefined>) => string }) {
  const { ordenes, total } = await listarOrdenes(filtros);
  if (ordenes.length === 0) {
    return hay ? (
      <EstadoVacio icono={Search} titulo="Sin resultados" descripcion="No hay órdenes con los filtros elegidos." />
    ) : (
      <EstadoVacio icono={ClipboardList} titulo="Aún no hay órdenes" descripcion="Crea la primera orden a partir de la receta de un paciente.">
        <EnlaceBoton href="/panel/ordenes/nueva" variante="primario" icono={Plus}>
          Nueva orden
        </EnlaceBoton>
      </EstadoVacio>
    );
  }
  return (
    <TablaOrdenes
      ordenes={ordenes}
      hoy={hoyISO()}
      pie={
        <Paginacion
          pagina={filtros.pagina ?? 1}
          total={total}
          porPagina={ORDENES_POR_PAGINA}
          href={(p) => href({ pagina: p > 1 ? String(p) : undefined })}
        />
      }
    />
  );
}

const COLUMNAS: EstadoComercial[] = ["venta_iniciada", "en_laboratorio", "listo_entrega", "entregado"];

async function Tablero({ filtros }: { filtros: FiltrosOrdenes }) {
  const ordenes = await listarTablero(filtros);
  const hoy = hoyISO();
  const por = (c: EstadoComercial) => ordenes.filter((o) => COMERCIAL_DE[o.estado] === c);

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[960px] grid-cols-4 gap-4">
        {COLUMNAS.map((c) => {
          const lista = por(c);
          return (
            <section key={c} aria-labelledby={`col-${c}`} className="flex flex-col rounded-xl bg-slate-100/80 p-3">
              <h2 id={`col-${c}`} className="mb-3 flex items-center justify-between px-1 text-sm font-semibold text-slate-700">
                {COMERCIAL[c].texto}
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 tabular-nums">{lista.length}</span>
              </h2>
              {c === "entregado" && <p className="-mt-2 mb-2 px-1 text-xs text-slate-500">Últimos 14 días</p>}
              <ul className="flex flex-col gap-2">
                {lista.map((o) => (
                  <li key={o.id}>
                    <TarjetaOrden orden={o} hoy={hoy} />
                  </li>
                ))}
                {lista.length === 0 && <li className="px-1 py-4 text-center text-xs text-slate-400">Sin órdenes</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TarjetaOrden({ orden: o, hoy }: { orden: OrdenResumen; hoy: string }) {
  return (
    <Link
      href={`/panel/ordenes/${o.id}`}
      className="block rounded-lg border border-slate-200 bg-white p-3 shadow-tarjeta transition-colors hover:border-marca-300"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-marca-800 tabular-nums">{numeroOrden(o.numero)}</span>
        <span className="text-xs text-slate-500 tabular-nums">{fecha(o.fecha_entrega_prometida)}</span>
      </div>
      <p className="mt-1 truncate text-sm font-medium text-slate-900">
        {o.paciente.apellidos}, {o.paciente.nombres}
      </p>
      <p className="truncate text-xs text-slate-500">
        {o.laboratorio?.nombre}
        {o.sede && ` · ${o.sede.nombre}`}
      </p>
      <div className="mt-2 empty:hidden">
        <MarcasOrden orden={o} hoy={hoy} />
      </div>
    </Link>
  );
}
