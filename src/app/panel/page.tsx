import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  ArrowDownCircle,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Coins,
  Columns3,
  FlaskConical,
  HandCoins,
  PackageCheck,
  PackageX,
  Plus,
  Receipt,
  Target,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cache, Suspense } from "react";
import {
  BarraProgreso,
  Cargando,
  Encabezado,
  EnlaceBoton,
  EstadoVacio,
  Indicador,
  SoloProfesional,
  Tarjeta,
  Td,
  Th,
  TONOS,
  type Tono,
} from "@/components/ui";
import { deudaLaboratorios, gananciaDelMes } from "@/lib/datos/cuentas-laboratorio";
import { contarAlertas } from "@/lib/datos/inventario";
import type { OrdenResumen } from "@/lib/datos/ordenes";
import { resumenPanel } from "@/lib/datos/panel";
import { listarEgresos } from "@/lib/datos/egresos";
import { resumenPorCobrar } from "@/lib/datos/saldos";
import { rangoMes, totalesEgresos } from "@/lib/egresos";
import { obtenerSuscripcion } from "@/lib/datos/suscripcion";
import { cumplimiento, ventasDelDia, ventasMensuales } from "@/lib/datos/ventas";
import { fecha, mes, soles } from "@/lib/formato";
import { alertasDeuda, deudaTotal } from "@/lib/laboratorios/cuentas";
import { estaAtrasada, numeroOrden } from "@/lib/ordenes/estados";
import { NOMBRE_ROL, tienePermiso } from "@/lib/permisos";
import { exigirOptica, sedeFiltro } from "@/lib/sesion";
import { hoyISO, hoyLimaISO } from "@/lib/validacion/comun";
import { InsigniaEstado, MarcasOrden } from "./ordenes/componentes";
import { GraficoVentas } from "./ventas/grafico-ventas";

export const metadata: Metadata = { title: "Panel" };

// La deuda la leen la fila de indicadores y la tarjeta de atención: una sola consulta por petición.
const deuda = cache(deudaLaboratorios);

const FECHA_LARGA = new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default function PaginaPanel() {
  return (
    <Suspense fallback={<Cargando alto="h-96" />}>
      <Panel />
    </Suspense>
  );
}

async function Panel() {
  const [optica, r] = await Promise.all([exigirOptica(), resumenPanel()]);
  const hoy = hoyISO();
  const verVentas = tienePermiso(optica.rol, "verVentas");
  const verCuentas = tienePermiso(optica.rol, "gestionarCuentasLaboratorio");
  const [a, m, d] = hoyLimaISO().split("-").map(Number);
  const fechaHoy = FECHA_LARGA.format(new Date(Date.UTC(a, m - 1, d)));

  const recientes = <TablaRecientes ordenes={r.recientes} hoy={hoy} />;

  return (
    <>
      <Encabezado
        titulo="Panel de control"
        descripcion={
          <span className="first-letter:uppercase">
            {fechaHoy} · {NOMBRE_ROL[optica.rol]}
          </span>
        }
      >
        <EnlaceBoton href="/panel/ordenes?vista=tablero" icono={Columns3}>
          Tablero de órdenes
        </EnlaceBoton>
      </Encabezado>

      <section aria-label="Indicadores de órdenes" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Indicador titulo="Órdenes activas" valor={r.ordenesActivas} detalle="Sin entregar ni anular" icono={ClipboardList} href="/panel/ordenes" />
        <Indicador
          titulo="En el laboratorio"
          valor={r.enLaboratorio}
          detalle="Enviadas, en proceso o terminadas"
          icono={FlaskConical}
          href="/panel/ordenes?estado=en_laboratorio"
        />
        <Indicador
          titulo="Listas para entregar"
          valor={r.listas}
          detalle="Esperando al paciente"
          icono={PackageCheck}
          tono={r.listas ? "verde" : "neutro"}
          href="/panel/ordenes?estado=listo_entrega"
        />
        <Indicador
          titulo="Atrasadas"
          valor={r.atrasadas}
          detalle="Fecha prometida vencida"
          icono={AlarmClock}
          tono={r.atrasadas ? "rojo" : "neutro"}
          href="/panel/ordenes?atrasadas=1"
        />
      </section>

      {(verVentas || verCuentas) && (
        <Suspense fallback={<Cargando alto="h-28" texto="Cargando indicadores de caja…" />}>
          <div className="mt-3 sm:mt-4">
            <IndicadoresDinero verVentas={verVentas} verCuentas={verCuentas} />
          </div>
        </Suspense>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          {verVentas ? (
            <Suspense fallback={<Cargando alto="h-72" />}>
              <BloqueVentas />
            </Suspense>
          ) : (
            recientes
          )}
        </div>
        <Suspense fallback={<Cargando alto="h-72" />}>
          <Atencion atrasadas={r.atrasadas} listas={r.listas} verCuentas={verCuentas} />
        </Suspense>
      </div>

      {verVentas && <div className="mt-6">{recientes}</div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ListaOrdenes
          titulo="Seguimiento en laboratorio"
          descripcion="Trabajos en el laboratorio, por fecha prometida."
          ordenes={r.seguimiento}
          hoy={hoy}
          vacio="No hay trabajos en el laboratorio"
          icono={FlaskConical}
          verTodo="/panel/ordenes?estado=en_laboratorio"
        />
        <ListaOrdenes
          titulo="Listas para entregar"
          descripcion="Avísale al paciente y registra la entrega."
          ordenes={r.paraEntregar}
          hoy={hoy}
          vacio="No hay trabajos esperando entrega"
          icono={PackageCheck}
          verTodo="/panel/ordenes?estado=listo_entrega"
        />
      </div>
    </>
  );
}

/** Ventas (propietario y administrador) y cuentas con laboratorios (los mismos roles, en sus sedes). */
async function IndicadoresDinero({ verVentas, verCuentas }: { verVentas: boolean; verCuentas: boolean }) {
  const sede = await sedeFiltro();
  const [hoy, meses, porCobrar, egresos, filas, ganancia] = await Promise.all([
    verVentas ? ventasDelDia() : null,
    verVentas ? ventasMensuales(1) : null,
    verVentas ? resumenPorCobrar(sede) : null,
    verVentas ? listarEgresos({ sede, ...rangoMes(hoyLimaISO().slice(0, 7)) }) : null,
    verCuentas ? deuda(sede) : null,
    verCuentas ? gananciaDelMes(sede) : null,
  ]);
  const conTicket = ganancia?.filter((g) => g.con_ticket) ?? [];
  const sinTicket = (ganancia?.length ?? 0) - conTicket.length;
  return (
    <section aria-label="Indicadores de caja" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
      {hoy && <Indicador titulo="Ventas de hoy" valor={soles(hoy.ventas)} detalle={`${hoy.ordenes} órdenes confirmadas`} icono={Receipt} href="/panel/ventas" />}
      {meses && (
        <Indicador
          titulo="Ventas del mes"
          valor={soles(meses[0].ventas)}
          detalle={`${meses[0].ordenes} órdenes`}
          icono={TrendingUp}
          tono="verde"
          href="/panel/ventas"
        />
      )}
      {porCobrar && (
        <>
          <Indicador
            titulo="Por cobrar a clientes"
            valor={soles(porCobrar.por_cobrar)}
            detalle={`${porCobrar.ordenes} pedidos con saldo`}
            icono={HandCoins}
            tono={porCobrar.por_cobrar > 0 ? "ambar" : "neutro"}
            href="/panel/saldos"
          />
          <Indicador
            titulo="Saldo en pedidos listos"
            valor={soles(porCobrar.en_listos)}
            detalle={`${porCobrar.ordenes_listas} listos para entregar: debería entrar pronto`}
            icono={PackageCheck}
            tono={porCobrar.en_listos > 0 ? "verde" : "neutro"}
            href="/panel/saldos"
          />
        </>
      )}
      {egresos && (
        <Indicador
          titulo="Gastos del mes"
          valor={soles(totalesEgresos(egresos).total)}
          detalle="Servicios, alquiler, sueldos y otros"
          icono={ArrowDownCircle}
          tono="neutro"
          href="/panel/egresos"
        />
      )}
      {ganancia && (
        <Indicador
          titulo="Ganancia del mes"
          valor={soles(conTicket.reduce((s, g) => s + g.ganancia, 0))}
          detalle={`${conTicket.length} con costo${sinTicket ? ` · ${sinTicket} sin ticket` : ""}`}
          icono={Coins}
          tono="violeta"
        />
      )}
      {filas && (
        <Indicador
          titulo="Deuda con laboratorios"
          valor={soles(deudaTotal(filas))}
          detalle={`${filas.reduce((s, f) => s + (f.tickets ?? 0), 0)} tickets por pagar`}
          icono={Wallet}
          tono={deudaTotal(filas) > 0 ? "ambar" : "neutro"}
          href="/panel/laboratorios"
        />
      )}
    </section>
  );
}

/** Meta del mes y ventas de los últimos 6 meses, en una sola tarjeta. */
async function BloqueVentas() {
  const [meses, suscripcion] = await Promise.all([ventasMensuales(6), obtenerSuscripcion()]);
  const actual = meses[0];
  const conMetas = suscripcion.incluye.metas;
  const c = cumplimiento(actual.ventas, actual.meta);
  return (
    <Tarjeta
      titulo="Ventas"
      descripcion="Ventas netas de los últimos 6 meses."
      acciones={
        <Link href="/panel/ventas" className="text-sm font-medium text-marca-700 hover:underline">
          Ver detalle
        </Link>
      }
      className="h-full"
    >
      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg bg-slate-50 px-4 py-3">
        <div className="min-w-40 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-slate-600">
              Meta de {mes(actual.periodo)}
            </p>
            {c && <p className="text-lg font-semibold text-slate-900 tabular-nums">{Math.round(c.porcentaje)} %</p>}
          </div>
          {c ? (
            <>
              <div className="mt-2">
                <BarraProgreso valor={c.porcentaje} tono={c.falta === 0 ? "verde" : "azul"} etiqueta="Cumplimiento de la meta del mes" />
              </div>
              <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
                {soles(actual.ventas)} de {soles(actual.meta)} · {c.falta === 0 ? "meta alcanzada" : `faltan ${soles(c.falta)}`}
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-slate-500">{conMetas ? "Aún no defines una meta para este mes." : "Las metas mensuales no están en tu plan."}</p>
          )}
        </div>
        {conMetas ? (
          !c && (
            <EnlaceBoton href="/panel/ventas" tamano="sm" icono={Target}>
              Definir meta
            </EnlaceBoton>
          )
        ) : (
          <SoloProfesional compacto />
        )}
      </div>
      <GraficoVentas datos={meses} />
    </Tarjeta>
  );
}

type ItemAtencion = { href: string; icono: LucideIcon; tono: Tono; titulo: string; detalle: string };

/** Lo que conviene resolver hoy: atrasos, entregas, reposición de lunas y pagos a laboratorios. */
async function Atencion({ atrasadas, listas, verCuentas }: { atrasadas: number; listas: number; verCuentas: boolean }) {
  const sede = await sedeFiltro();
  const [inventario, filas] = await Promise.all([contarAlertas(), verCuentas ? deuda(sede) : []]);
  const pagos = alertasDeuda(filas);

  const candidatos: (ItemAtencion | false)[] = [
    atrasadas > 0 && {
      href: "/panel/ordenes?atrasadas=1",
      icono: AlarmClock,
      tono: "rojo" as const,
      titulo: atrasadas === 1 ? "1 orden atrasada" : `${atrasadas} órdenes atrasadas`,
      detalle: "La fecha prometida ya pasó y aún no llegan a la óptica.",
    },
    listas > 0 && {
      href: "/panel/ordenes?estado=listo_entrega",
      icono: PackageCheck,
      tono: "verde" as const,
      titulo: listas === 1 ? "1 orden lista para entregar" : `${listas} órdenes listas para entregar`,
      detalle: "Avisa al paciente para que pase a recogerla.",
    },
    inventario.agotado > 0 && {
      href: "/panel/inventario?vista=reponer",
      icono: PackageX,
      tono: "rojo" as const,
      titulo: inventario.agotado === 1 ? "1 medida de luna agotada" : `${inventario.agotado} medidas de luna agotadas`,
      detalle: "Medidas con mínimo configurado sin unidades disponibles.",
    },
    inventario.bajo > 0 && {
      href: "/panel/inventario?vista=reponer",
      icono: TriangleAlert,
      tono: "ambar" as const,
      titulo: inventario.bajo === 1 ? "1 medida en o bajo el mínimo" : `${inventario.bajo} medidas en o bajo el mínimo`,
      detalle: "Conviene pedirlas a tu proveedor.",
    },
    ...pagos.slice(0, 4).map((p) => ({
      href: `/panel/laboratorios/${p.laboratorioId}?vista=cuenta`,
      icono: Wallet,
      tono: p.tipo === "vencido" ? ("rojo" as const) : ("ambar" as const),
      titulo: p.tipo === "vencido" ? "Pago a laboratorio vencido" : "Pago a laboratorio por vencer",
      detalle: p.texto,
    })),
  ];
  const items = candidatos.filter((i): i is ItemAtencion => i !== false);

  return (
    <Tarjeta titulo="Requiere atención" descripcion="Pendientes de tus sedes para hoy." sinRelleno className="self-start">
      {items.length === 0 ? (
        <EstadoVacio compacto icono={CircleCheck} titulo="Todo al día" descripcion="No hay órdenes atrasadas, entregas pendientes, lunas por reponer ni pagos vencidos." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((i) => (
            <li key={`${i.href}${i.titulo}${i.detalle}`}>
              <Link href={i.href} className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50">
                <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${TONOS[i.tono]}`}>
                  <i.icono aria-hidden className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{i.titulo}</span>
                  <span className="block text-xs text-slate-500">{i.detalle}</span>
                </span>
                <ChevronRight aria-hidden className="mt-1.5 size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

/** Últimas órdenes creadas: número, paciente, estado, laboratorio y entrega prometida. */
function TablaRecientes({ ordenes, hoy }: { ordenes: OrdenResumen[]; hoy: string }) {
  return (
    <Tarjeta
      titulo="Órdenes recientes"
      descripcion="Las últimas órdenes creadas."
      acciones={
        <Link href="/panel/ordenes" className="text-sm font-medium text-marca-700 hover:underline">
          Ver todas
        </Link>
      }
      sinRelleno
      className="h-full overflow-hidden"
    >
      {ordenes.length === 0 ? (
        <EstadoVacio compacto icono={ClipboardList} titulo="Aún no hay órdenes" descripcion="Crea la primera orden a partir de la receta de un paciente.">
          <EnlaceBoton href="/panel/ordenes/nueva" variante="primario" icono={Plus}>
            Nueva orden
          </EnlaceBoton>
        </EstadoVacio>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <Th>Orden</Th>
                <Th>Paciente</Th>
                <Th>Estado</Th>
                <Th className="hidden md:table-cell">Laboratorio</Th>
                <Th className="hidden text-right sm:table-cell">Entrega</Th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map((o) => {
                const atrasada = estaAtrasada(o.estado, o.fecha_entrega_prometida, hoy);
                return (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/panel/ordenes/${o.id}`} className="font-semibold text-marca-800 tabular-nums hover:underline">
                        {numeroOrden(o.numero)}
                      </Link>
                    </Td>
                    <Td className="max-w-56">
                      <p className="truncate font-medium text-slate-900">
                        {o.paciente.apellidos}, {o.paciente.nombres}
                      </p>
                      {o.sede && <p className="truncate text-xs text-slate-500">{o.sede.nombre}</p>}
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <InsigniaEstado estado={o.estado} />
                        <MarcasOrden orden={o} hoy={hoy} />
                      </div>
                    </Td>
                    <Td className="hidden text-slate-600 md:table-cell">{o.laboratorio?.nombre ?? "—"}</Td>
                    <Td className={`hidden text-right tabular-nums sm:table-cell ${atrasada ? "font-medium text-red-700" : ""}`}>
                      {fecha(o.fecha_entrega_prometida)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

function ListaOrdenes({
  titulo,
  descripcion,
  ordenes,
  hoy,
  vacio,
  icono,
  verTodo,
}: {
  titulo: string;
  descripcion?: string;
  ordenes: OrdenResumen[];
  hoy: string;
  vacio: string;
  icono: LucideIcon;
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
        <EstadoVacio compacto icono={icono} titulo={vacio} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {ordenes.map((o) => (
            <li key={o.id}>
              <Link href={`/panel/ordenes/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-slate-50">
                <span className="w-14 text-sm font-semibold text-marca-800 tabular-nums">{numeroOrden(o.numero)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {o.paciente.apellidos}, {o.paciente.nombres}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {o.laboratorio?.nombre ?? "Sin laboratorio"} · entrega {fecha(o.fecha_entrega_prometida)}
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
