import { Building2, CalendarDays, Receipt, Target, TrendingDown, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { BarraProgreso, Cargando, Encabezado, EnlaceBoton, Indicador, Insignia, SoloProfesional, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { obtenerSuscripcion } from "@/lib/datos/suscripcion";
import { cajaDelDia, cumplimiento, reporteConsolidado, variacion, ventasDelDia, ventasMensuales } from "@/lib/datos/ventas";
import { mes, soles } from "@/lib/formato";
import { MEDIOS_PAGO, type MedioPago } from "@/lib/ordenes/pagos";
import { tienePermiso } from "@/lib/permisos";
import { exigirPermiso, obtenerSedeActual } from "@/lib/sesion";
import { FormularioMeta } from "./formulario-meta";
import { GraficoVentas } from "./grafico-ventas";

export const metadata: Metadata = { title: "Ventas y metas" };

export default function PaginaVentas() {
  return (
    <>
      <Encabezado
        titulo="Ventas y metas"
        descripcion="Ventas netas (precio − descuento, IGV incluido) de órdenes confirmadas y no anuladas, por mes de confirmación."
      />
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Contenido />
      </Suspense>
    </>
  );
}

const porcentaje = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })} %`;

async function Contenido() {
  const optica = await exigirPermiso("verVentas");
  const [meses, hoy, caja, { actual: sede }, suscripcion] = await Promise.all([
    ventasMensuales(12),
    ventasDelDia(),
    cajaDelDia(),
    obtenerSedeActual(),
    obtenerSuscripcion(),
  ]);
  const conMetas = suscripcion.incluye.metas;
  const [actual, anterior] = meses;
  const c = cumplimiento(actual.ventas, actual.meta);
  const v = variacion(actual.ventas, anterior?.ventas);

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-2 text-sm text-slate-600">
        Mostrando: <strong className="font-medium text-slate-900">{sede ? `sede ${sede.nombre}` : "todas tus sedes"}</strong>
      </p>

      {tienePermiso(optica.rol, "verConsolidado") && (
        <Suspense fallback={<Cargando alto="h-48" />}>
          <Consolidado />
        </Suspense>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Ventas de hoy" valor={soles(hoy.ventas)} detalle={`${hoy.ordenes} órdenes confirmadas`} icono={Receipt} />
        <Indicador
          titulo={`Ventas de ${mes(actual.periodo)}`}
          valor={soles(actual.ventas)}
          detalle={
            v == null ? `${actual.ordenes} órdenes` : `${v >= 0 ? "+" : ""}${porcentaje(v)} vs. ${mes(anterior.periodo)}`
          }
          icono={v != null && v < 0 ? TrendingDown : TrendingUp}
          tono={v != null && v < 0 ? "ambar" : "verde"}
        />
        <Indicador
          titulo="Meta del mes"
          valor={actual.meta ? soles(actual.meta) : "Sin meta"}
          detalle={conMetas ? undefined : "Disponible en plan Profesional"}
          icono={Target}
          tono="violeta"
        />
        <Indicador
          titulo="Falta para la meta"
          valor={c ? soles(c.falta) : "—"}
          detalle={
            c ? (c.falta === 0 ? "Meta alcanzada" : `${porcentaje(c.porcentaje)} cumplido`) : conMetas ? "Define una meta para este mes" : "Metas: plan Profesional"
          }
          icono={CalendarDays}
          tono={c && c.falta === 0 ? "verde" : "neutro"}
        />
      </div>

      <Tarjeta
        titulo="Caja del día"
        descripcion="Lo cobrado hoy (hora de Lima) según los pagos vigentes. Es dinero cobrado, no venta: no cuenta para la meta."
        acciones={
          <EnlaceBoton href="/panel/ordenes?saldo=1" tamano="sm">
            Ver órdenes con saldo
          </EnlaceBoton>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <div>
              <dt className="text-sm font-medium text-slate-500">Cobrado hoy</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{soles(caja.cobrado)}</dd>
              <dd className="text-xs text-slate-500">{caja.pagos === 1 ? "1 pago" : `${caja.pagos} pagos`}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Saldos por cobrar</dt>
              <dd className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${caja.saldoPendiente > 0 ? "text-amber-800" : "text-slate-900"}`}>
                {soles(caja.saldoPendiente)}
              </dd>
              <dd className="text-xs text-slate-500">
                {caja.ordenesConSaldo === 1 ? "1 orden no anulada" : `${caja.ordenesConSaldo} órdenes no anuladas`}
              </dd>
            </div>
          </dl>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.entries(MEDIOS_PAGO) as [MedioPago, string][]).map(([m, nombre]) => (
              <div key={m} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <dt className="text-xs font-medium text-slate-500">{nombre}</dt>
                <dd className="mt-1 font-semibold text-slate-900 tabular-nums">{soles(caja.porMedio[m])}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Tarjeta>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Tarjeta titulo="Ventas de los últimos 12 meses">
          {c && (
            <div className="mb-6">
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span className="font-medium text-slate-700">Cumplimiento de {mes(actual.periodo)}</span>
                <span className="font-semibold tabular-nums text-slate-900">{porcentaje(c.porcentaje)}</span>
              </div>
              <BarraProgreso valor={c.porcentaje} tono={c.falta === 0 ? "verde" : "azul"} etiqueta={`Cumplimiento de la meta de ${mes(actual.periodo)}`} />
              <p className="mt-2 text-xs text-slate-500">
                {soles(actual.ventas)} de {soles(actual.meta)}
              </p>
            </div>
          )}
          <GraficoVentas datos={meses} />
        </Tarjeta>

        <Tarjeta titulo="Meta mensual" descripcion={sede ? `Importe objetivo de ventas netas de la sede ${sede.nombre}.` : "Importe objetivo de ventas netas."}>
          {!conMetas ? (
            <SoloProfesional>Fija metas mensuales por sede y sigue su cumplimiento.</SoloProfesional>
          ) : !tienePermiso(optica.rol, "configurarMetas") ? (
            <p className="text-sm text-slate-500">Tu rol no permite configurar metas.</p>
          ) : sede ? (
            <FormularioMeta
              key={sede.id}
              sede={sede.id}
              mesActual={actual.periodo.slice(0, 7)}
              metaActual={actual.meta ? actual.meta.toFixed(2) : ""}
            />
          ) : (
            <p className="text-sm text-slate-500">Cada sede tiene su propia meta: elige una sede en el selector de arriba para fijarla.</p>
          )}
        </Tarjeta>
      </div>

      <Tabla>
        <caption className="sr-only">Ventas y metas por mes</caption>
        <thead>
          <tr>
            <Th>Mes</Th>
            <Th className="text-right">Órdenes</Th>
            <Th className="text-right">Ventas netas</Th>
            <Th className="text-right">Meta</Th>
            <Th className="text-right">Cumplimiento</Th>
            <Th className="hidden text-right sm:table-cell">Vs. mes anterior</Th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m, i) => {
            const cm = cumplimiento(m.ventas, m.meta);
            const vm = variacion(m.ventas, meses[i + 1]?.ventas);
            return (
              <tr key={m.periodo}>
                <Td className="font-medium text-slate-900 first-letter:uppercase">{mes(m.periodo)}</Td>
                <Td className="text-right tabular-nums">{m.ordenes}</Td>
                <Td className="text-right tabular-nums">{soles(m.ventas)}</Td>
                <Td className="text-right tabular-nums">{m.meta ? soles(m.meta) : "—"}</Td>
                <Td className="text-right">
                  {cm ? <Insignia tono={cm.falta === 0 ? "verde" : i === 0 ? "azul" : "ambar"}>{porcentaje(cm.porcentaje)}</Insignia> : "—"}
                </Td>
                <Td className="hidden text-right tabular-nums sm:table-cell">
                  {vm == null ? "—" : <span className={vm < 0 ? "text-red-600" : "text-emerald-700"}>{`${vm >= 0 ? "+" : ""}${porcentaje(vm)}`}</span>}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Tabla>
    </div>
  );
}

/** Consolidado del mes por sede y total (solo propietario). */
async function Consolidado() {
  const { filas, total } = await reporteConsolidado();
  const avance = (ventas: number, meta: number | null) => {
    const c = cumplimiento(ventas, meta);
    return c ? <Insignia tono={c.falta === 0 ? "verde" : "azul"}>{porcentaje(c.porcentaje)}</Insignia> : <span className="text-slate-400">Sin meta</span>;
  };

  return (
    <Tarjeta
      titulo="Consolidado de sedes"
      descripcion="Mes actual, sin importar la sede elegida arriba. Ventas netas confirmadas; cobrado = pagos vigentes del mes."
      acciones={<Building2 aria-hidden className="size-5 text-marca-600" />}
      sinRelleno
    >
      {/* Celular: una tarjeta por sede */}
      <ul className="divide-y divide-slate-100 sm:hidden">
        {[...filas.map((f) => ({ ...f, clave: f.sedeId, total: false })), { ...total, clave: "total", sede: "Total óptica", activa: true, total: true }].map((f) => (
          <li key={f.clave} className={`space-y-2 px-4 py-3 text-sm ${f.total ? "bg-slate-50 font-semibold" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-900">
                {f.sede}
                {!f.activa && <span className="ml-1 text-xs font-normal text-slate-500">(desactivada)</span>}
              </span>
              {avance(f.ventas, f.meta)}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
              <dt>Ventas</dt>
              <dd className="text-right tabular-nums text-slate-900">{soles(f.ventas)}</dd>
              <dt>Meta</dt>
              <dd className="text-right tabular-nums">{f.meta ? soles(f.meta) : "—"}</dd>
              <dt>Pedidos en curso</dt>
              <dd className="text-right tabular-nums">{f.pedidosEnCurso}</dd>
              <dt>Cobrado</dt>
              <dd className="text-right tabular-nums">{soles(f.cobrado)}</dd>
              <dt>Saldos por cobrar</dt>
              <dd className="text-right tabular-nums">{soles(f.saldoPendiente)}</dd>
            </dl>
          </li>
        ))}
      </ul>

      {/* Tableta y escritorio */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Ventas, pedidos y metas del mes por sede</caption>
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2 text-left">Sede</th>
              <th scope="col" className="px-3 py-2 text-right">Órdenes</th>
              <th scope="col" className="px-3 py-2 text-right">Ventas</th>
              <th scope="col" className="px-3 py-2 text-right">Meta</th>
              <th scope="col" className="px-3 py-2 text-right">Avance</th>
              <th scope="col" className="px-3 py-2 text-right">En curso</th>
              <th scope="col" className="hidden px-3 py-2 text-right md:table-cell">Cobrado</th>
              <th scope="col" className="hidden px-4 py-2 text-right md:table-cell">Saldos</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {filas.map((f) => (
              <tr key={f.sedeId} className="border-t border-slate-100">
                <th scope="row" className="px-4 py-2.5 text-left font-medium text-slate-900">
                  {f.sede}
                  {!f.activa && <span className="ml-1 text-xs font-normal text-slate-500">(desactivada)</span>}
                </th>
                <td className="px-3 py-2.5 text-right">{f.ordenes}</td>
                <td className="px-3 py-2.5 text-right">{soles(f.ventas)}</td>
                <td className="px-3 py-2.5 text-right">{f.meta ? soles(f.meta) : "—"}</td>
                <td className="px-3 py-2.5 text-right">{avance(f.ventas, f.meta)}</td>
                <td className="px-3 py-2.5 text-right">{f.pedidosEnCurso}</td>
                <td className="hidden px-3 py-2.5 text-right md:table-cell">{soles(f.cobrado)}</td>
                <td className="hidden px-4 py-2.5 text-right md:table-cell">{soles(f.saldoPendiente)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900 tabular-nums">
            <tr>
              <th scope="row" className="px-4 py-2.5 text-left">Total óptica</th>
              <td className="px-3 py-2.5 text-right">{total.ordenes}</td>
              <td className="px-3 py-2.5 text-right">{soles(total.ventas)}</td>
              <td className="px-3 py-2.5 text-right">{total.meta ? soles(total.meta) : "—"}</td>
              <td className="px-3 py-2.5 text-right">{avance(total.ventas, total.meta)}</td>
              <td className="px-3 py-2.5 text-right">{total.pedidosEnCurso}</td>
              <td className="hidden px-3 py-2.5 text-right md:table-cell">{soles(total.cobrado)}</td>
              <td className="hidden px-4 py-2.5 text-right md:table-cell">{soles(total.saldoPendiente)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Tarjeta>
  );
}
