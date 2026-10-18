import { AlarmClock, ClipboardList, FlaskConical, PackageCheck, Plus, Receipt, Target, TrendingUp, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alerta } from "@/components/formulario";
import { BarraProgreso, Cargando, Encabezado, EnlaceBoton, Indicador, SoloProfesional, Tarjeta } from "@/components/ui";
import { contarAlertas } from "@/lib/datos/inventario";
import type { OrdenResumen } from "@/lib/datos/ordenes";
import { resumenPanel } from "@/lib/datos/panel";
import { obtenerSuscripcion } from "@/lib/datos/suscripcion";
import { cumplimiento, ventasDelDia, ventasMensuales } from "@/lib/datos/ventas";
import { fecha, mes, soles } from "@/lib/formato";
import { numeroOrden } from "@/lib/ordenes/estados";
import { NOMBRE_ROL, tienePermiso } from "@/lib/permisos";
import { exigirOptica } from "@/lib/sesion";
import { hoyISO } from "@/lib/validacion/comun";
import { InsigniaEstado, MarcasOrden } from "./ordenes/componentes";
import { GraficoVentas } from "./ventas/grafico-ventas";

export const metadata: Metadata = { title: "Panel" };

export default function PaginaPanel() {
  return (
    <Suspense fallback={<Cargando alto="h-96" />}>
      <Panel />
    </Suspense>
  );
}

async function Panel() {
  const [optica, r, alertas] = await Promise.all([exigirOptica(), resumenPanel(), contarAlertas()]);
  const hoy = hoyISO();

  return (
    <>
      <Encabezado titulo={optica.nombre} descripcion={`Tu rol: ${NOMBRE_ROL[optica.rol]}`}>
        <EnlaceBoton href="/panel/pacientes/nuevo" icono={Users}>
          Nuevo paciente
        </EnlaceBoton>
        <EnlaceBoton href="/panel/ordenes/nueva" variante="primario" icono={Plus}>
          Nueva orden
        </EnlaceBoton>
      </Encabezado>

      {alertas.bajo + alertas.agotado > 0 && (
        <div className="mb-6">
          <Alerta tipo="aviso">
            Reposición de lunas: {alertas.agotado} medidas agotadas y {alertas.bajo} en o bajo su mínimo.{" "}
            <Link href="/panel/inventario?vista=reponer" className="font-medium underline">
              Ver qué reponer
            </Link>
          </Alerta>
        </div>
      )}

      {tienePermiso(optica.rol, "verVentas") && (
        <Suspense fallback={<Cargando alto="h-40" />}>
          <BloqueVentas />
        </Suspense>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Órdenes activas" valor={r.ordenesActivas} detalle="Sin entregar ni anular" icono={ClipboardList} href="/panel/ordenes" />
        <Indicador
          titulo="Atrasadas"
          valor={r.atrasadas}
          detalle="Fecha prometida vencida"
          icono={AlarmClock}
          tono={r.atrasadas ? "rojo" : "neutro"}
          href="/panel/ordenes?atrasadas=1"
        />
        <Indicador
          titulo="Listas para entregar"
          valor={r.listas}
          detalle="Esperando al paciente"
          icono={PackageCheck}
          tono="verde"
          href="/panel/ordenes?estado=listo_entrega"
        />
        <Indicador titulo="Pacientes activos" valor={r.pacientesActivos} icono={Users} tono="violeta" href="/panel/pacientes" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ListaOrdenes
          titulo="Seguimiento en laboratorio"
          descripcion="Trabajos en el laboratorio, por fecha prometida."
          ordenes={r.seguimiento}
          hoy={hoy}
          vacio="No hay trabajos en el laboratorio."
          verTodo="/panel/ordenes?estado=en_laboratorio"
        />
        <ListaOrdenes
          titulo="Listas para entregar"
          descripcion="Avísale al paciente y registra la entrega."
          ordenes={r.paraEntregar}
          hoy={hoy}
          vacio="No hay trabajos esperando entrega."
          verTodo="/panel/ordenes?estado=listo_entrega"
        />
        <ListaOrdenes titulo="Órdenes recientes" ordenes={r.recientes} hoy={hoy} vacio="Aún no hay órdenes." verTodo="/panel/ordenes" />
        <Tarjeta titulo="Accesos rápidos">
          <div className="grid gap-2 sm:grid-cols-2">
            <EnlaceBoton href="/panel/ordenes/nueva" icono={Plus}>
              Nueva orden
            </EnlaceBoton>
            <EnlaceBoton href="/panel/ordenes?vista=tablero" icono={ClipboardList}>
              Tablero de órdenes
            </EnlaceBoton>
            <EnlaceBoton href="/panel/pacientes" icono={Users}>
              Pacientes y recetas
            </EnlaceBoton>
            <EnlaceBoton href="/panel/laboratorios" icono={FlaskConical}>
              Laboratorios
            </EnlaceBoton>
          </div>
        </Tarjeta>
      </div>
    </>
  );
}

/** Ventas y meta: solo propietario y administrador (la base vuelve a comprobarlo). */
async function BloqueVentas() {
  const [meses, hoy, suscripcion] = await Promise.all([ventasMensuales(6), ventasDelDia(), obtenerSuscripcion()]);
  const actual = meses[0];
  const conMetas = suscripcion.incluye.metas;
  const c = cumplimiento(actual.ventas, actual.meta);
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid gap-4 sm:grid-cols-2">
        <Indicador titulo="Ventas de hoy" valor={soles(hoy.ventas)} detalle={`${hoy.ordenes} órdenes confirmadas`} icono={Receipt} href="/panel/ventas" />
        <Indicador titulo="Ventas del mes" valor={soles(actual.ventas)} detalle={`${actual.ordenes} órdenes`} icono={TrendingUp} tono="verde" href="/panel/ventas" />
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-tarjeta sm:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">Meta de {mes(actual.periodo)}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                {c ? `${Math.round(c.porcentaje)} %` : "Sin meta"}
              </p>
            </div>
            {conMetas ? (
              <EnlaceBoton href="/panel/ventas" tamano="sm" icono={Target}>
                {c ? "Ver detalle" : "Definir meta"}
              </EnlaceBoton>
            ) : (
              <SoloProfesional compacto />
            )}
          </div>
          {c && (
            <div className="mt-3">
              <BarraProgreso valor={c.porcentaje} tono={c.falta === 0 ? "verde" : "azul"} etiqueta="Cumplimiento de la meta del mes" />
              <p className="mt-2 text-xs text-slate-500">
                {soles(actual.ventas)} de {soles(actual.meta)} · {c.falta === 0 ? "meta alcanzada" : `faltan ${soles(c.falta)}`}
              </p>
            </div>
          )}
        </div>
      </div>
      <Tarjeta titulo="Ventas de los últimos 6 meses">
        <GraficoVentas datos={meses} />
      </Tarjeta>
    </div>
  );
}

function ListaOrdenes({
  titulo,
  descripcion,
  ordenes,
  hoy,
  vacio,
  verTodo,
}: {
  titulo: string;
  descripcion?: string;
  ordenes: OrdenResumen[];
  hoy: string;
  vacio: string;
  verTodo: string;
}) {
  return (
    <Tarjeta
      titulo={titulo}
      descripcion={descripcion}
      acciones={
        <Link href={verTodo} className="text-sm font-medium text-marca-700 hover:underline">
          Ver todas
        </Link>
      }
      sinRelleno
    >
      {ordenes.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">{vacio}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {ordenes.map((o) => (
            <li key={o.id}>
              <Link href={`/panel/ordenes/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-slate-50">
                <span className="w-14 text-sm font-semibold text-marca-800 tabular-nums">{numeroOrden(o.numero)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {o.paciente.apellidos}, {o.paciente.nombres}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {o.laboratorio?.nombre} · entrega {fecha(o.fecha_entrega_prometida)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <InsigniaEstado estado={o.estado} />
                  <MarcasOrden orden={o} hoy={hoy} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
