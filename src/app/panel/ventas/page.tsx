import { CalendarDays, Receipt, Target, TrendingDown, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { BarraProgreso, Cargando, Encabezado, EnlaceBoton, Indicador, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { cajaDelDia, cumplimiento, variacion, ventasDelDia, ventasMensuales } from "@/lib/datos/ventas";
import { mes, soles } from "@/lib/formato";
import { MEDIOS_PAGO, type MedioPago } from "@/lib/ordenes/pagos";
import { tienePermiso } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
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
  const [meses, hoy, caja] = await Promise.all([ventasMensuales(12), ventasDelDia(), cajaDelDia()]);
  const [actual, anterior] = meses;
  const c = cumplimiento(actual.ventas, actual.meta);
  const v = variacion(actual.ventas, anterior?.ventas);

  return (
    <div className="flex flex-col gap-6">
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
        <Indicador titulo="Meta del mes" valor={actual.meta ? soles(actual.meta) : "Sin meta"} icono={Target} tono="violeta" />
        <Indicador
          titulo="Falta para la meta"
          valor={c ? soles(c.falta) : "—"}
          detalle={c ? (c.falta === 0 ? "Meta alcanzada" : `${porcentaje(c.porcentaje)} cumplido`) : "Define una meta para este mes"}
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

        <Tarjeta titulo="Meta mensual" descripcion="Importe objetivo de ventas netas.">
          {tienePermiso(optica.rol, "configurarMetas") ? (
            <FormularioMeta mesActual={actual.periodo.slice(0, 7)} metaActual={actual.meta ? actual.meta.toFixed(2) : ""} />
          ) : (
            <p className="text-sm text-slate-500">Tu rol no permite configurar metas.</p>
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
