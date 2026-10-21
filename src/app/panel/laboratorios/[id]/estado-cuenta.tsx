import { AlertTriangle, Ban, CalendarClock, Image as IconoFoto, Receipt, Wallet } from "lucide-react";
import Link from "next/link";
import { Campo, Confirmacion } from "@/components/formulario";
import { claseBoton, claseControl, EstadoVacio, Indicador, Insignia, Tabla, Td, Th } from "@/components/ui";
import { rutaVerFoto } from "@/lib/datos/archivos-laboratorio";
import { listarPagosLab, listarTicketsLab, nombresMiembros, type FiltrosCuenta } from "@/lib/datos/cuentas-laboratorio";
import { fecha, soles } from "@/lib/formato";
import { NOMBRE_MEDIO_LAB } from "@/lib/laboratorios/cuentas";
import type { Sede } from "@/lib/sesion";
import { anularPagoLab } from "../acciones-cuentas";
import { EstadoTicket } from "../componentes-cuentas";

/**
 * Estado de cuenta del laboratorio: deuda, tickets pendientes por vencimiento e historial de pagos.
 * `gestiona` = propietario o administrador (ve pagos y deuda); el vendedor solo ve los tickets.
 */
export async function EstadoCuenta({
  laboratorio,
  sedes,
  filtros,
  gestiona,
}: {
  laboratorio: string;
  sedes: Sede[];
  filtros: FiltrosCuenta;
  gestiona: boolean;
}) {
  const f = { ...filtros, laboratorio };
  const [pendientes, tickets, pagos, nombres] = await Promise.all([
    listarTicketsLab({ laboratorio, sede: f.sede, soloPendientes: true }),
    listarTicketsLab(f),
    gestiona ? listarPagosLab(f) : Promise.resolve([]),
    gestiona ? nombresMiembros() : Promise.resolve(new Map<string, string>()),
  ]);
  const deuda = pendientes.reduce((s, t) => s + Number(t.deuda), 0);
  const vencido = pendientes.filter((t) => t.estado_vencimiento === "vencido").reduce((s, t) => s + Number(t.deuda), 0);
  const porVencer = pendientes.filter((t) => t.estado_vencimiento === "por_vencer").reduce((s, t) => s + Number(t.deuda), 0);
  const nombreSede = (id: string) => sedes.find((s) => s.id === id)?.nombre ?? "—";
  const variasSedes = sedes.length > 1;

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-wrap items-end gap-3" aria-label="Filtrar estado de cuenta">
        <input type="hidden" name="vista" value="cuenta" />
        {variasSedes && (
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Sede
            <select name="sede" defaultValue={f.sede ?? ""} className={`${claseControl} h-10`}>
              <option value="">Todas mis sedes</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Desde
          <input type="date" name="desde" defaultValue={f.desde} className={`${claseControl} h-10`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Hasta
          <input type="date" name="hasta" defaultValue={f.hasta} className={`${claseControl} h-10`} />
        </label>
        <button className={claseBoton("secundario")}>Filtrar</button>
        {(f.sede || f.desde || f.hasta) && (
          <Link href="?vista=cuenta" className="h-10 content-center text-sm font-medium text-marca-700 hover:underline">
            Quitar filtros
          </Link>
        )}
      </form>

      {gestiona && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Indicador titulo="Deuda total" valor={soles(deuda)} detalle={`${pendientes.length} tickets pendientes`} icono={Wallet} />
          <Indicador titulo="Vencido" valor={soles(vencido)} icono={AlertTriangle} tono={vencido > 0 ? "rojo" : "neutro"} />
          <Indicador titulo="Vence en 2 días o menos" valor={soles(porVencer)} icono={CalendarClock} tono={porVencer > 0 ? "ambar" : "neutro"} />
        </div>
      )}

      <section aria-labelledby="pendientes">
        <h2 id="pendientes" className="mb-3 text-base font-semibold text-slate-900">
          Tickets pendientes {gestiona ? "por fecha de vencimiento" : ""}
        </h2>
        {pendientes.length === 0 ? (
          <EstadoVacio icono={Receipt} titulo="Sin tickets pendientes" descripcion="Todo lo registrado de este laboratorio está pagado." />
        ) : (
          <TablaTickets tickets={pendientes} nombreSede={variasSedes ? nombreSede : undefined} gestiona={gestiona} />
        )}
      </section>

      {gestiona && (
        <section aria-labelledby="pagos">
          <h2 id="pagos" className="mb-3 text-base font-semibold text-slate-900">
            Historial de pagos
          </h2>
          {pagos.length === 0 ? (
            <EstadoVacio icono={Wallet} titulo="Sin pagos en este periodo" />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th className="text-right">Monto</Th>
                  <Th>Medio</Th>
                  <Th className="hidden md:table-cell">Tickets</Th>
                  <Th className="hidden lg:table-cell">Pagó</Th>
                  <Th>
                    <span className="sr-only">Acciones</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id} className={p.anulado_en ? "text-slate-400" : undefined}>
                    <Td className="tabular-nums">
                      {fecha(p.fecha)}
                      {variasSedes && <p className="text-xs text-slate-500">{nombreSede(p.sede_id)}</p>}
                    </Td>
                    <Td className={`text-right tabular-nums ${p.anulado_en ? "line-through" : ""}`}>{soles(p.monto)}</Td>
                    <Td>
                      {NOMBRE_MEDIO_LAB[p.medio]}
                      {p.numero_operacion && <p className="text-xs text-slate-500">Op. {p.numero_operacion}</p>}
                      {p.anulado_en && (
                        <p className="mt-0.5">
                          <Insignia>Anulado</Insignia> <span className="text-xs">{p.motivo_anulacion}</span>
                        </p>
                      )}
                    </Td>
                    <Td className="hidden md:table-cell">
                      {p.aplicaciones.map((a) => (
                        <Link key={a.ticket.id} href={`/panel/laboratorios/tickets/${a.ticket.id}`} className="mr-2 inline-block text-marca-700 hover:underline">
                          {a.ticket.numero_ticket} ({soles(a.monto)})
                        </Link>
                      ))}
                    </Td>
                    <Td className="hidden break-all lg:table-cell">{(p.pagado_por && nombres.get(p.pagado_por)) || "—"}</Td>
                    <Td className="text-right">
                      <span className="inline-flex flex-wrap justify-end gap-2">
                        {p.foto_path && (
                          <Link href={rutaVerFoto(p.foto_path)} className={claseBoton("secundario", "sm")} target="_blank">
                            <IconoFoto aria-hidden className="size-4" />
                            Comprobante
                          </Link>
                        )}
                        {!p.anulado_en && (
                          <Confirmacion
                            accion={anularPagoLab.bind(null, p.id)}
                            titulo={`Anular pago de ${soles(p.monto)}`}
                            descripcion={
                              p.medio === "efectivo_caja"
                                ? "Los tickets vuelven a tener esa deuda y el egreso de caja se anula. No se borra nada."
                                : "Los tickets vuelven a tener esa deuda. No se borra nada."
                            }
                            textoBoton="Anular"
                            iconoBoton={<Ban />}
                            tamanoBoton="sm"
                            textoConfirmar="Anular pago"
                            pendiente="Anulando…"
                          >
                            <Campo nombre="motivo" etiqueta="Motivo" required maxLength={300} />
                          </Confirmacion>
                        )}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </section>
      )}

      <section aria-labelledby="todos">
        <h2 id="todos" className="mb-3 text-base font-semibold text-slate-900">
          Todos los tickets {f.desde || f.hasta ? "del periodo" : ""}
        </h2>
        {tickets.length === 0 ? (
          <EstadoVacio icono={Receipt} titulo="Sin tickets" />
        ) : (
          <TablaTickets tickets={[...tickets].sort((a, b) => b.fecha.localeCompare(a.fecha))} nombreSede={variasSedes ? nombreSede : undefined} gestiona={gestiona} />
        )}
      </section>
    </div>
  );
}

function TablaTickets({
  tickets,
  nombreSede,
  gestiona,
}: {
  tickets: Awaited<ReturnType<typeof listarTicketsLab>>;
  nombreSede?: (id: string) => string;
  gestiona: boolean;
}) {
  return (
    <Tabla>
      <thead>
        <tr>
          <Th>Ticket</Th>
          <Th className="hidden sm:table-cell">Fecha</Th>
          <Th>Vence</Th>
          <Th className="text-right">Total</Th>
          {gestiona && <Th className="hidden text-right sm:table-cell">Por pagar</Th>}
          <Th>Estado</Th>
        </tr>
      </thead>
      <tbody>
        {tickets.map((t) => (
          <tr key={t.id} className={t.anulado_en ? "text-slate-400" : undefined}>
            <Td>
              <Link href={`/panel/laboratorios/tickets/${t.id}`} className="font-medium text-marca-700 hover:underline">
                {t.numero_ticket}
              </Link>
              <p className="text-xs text-slate-500">
                {t.ordenes} {t.ordenes === 1 ? "orden" : "órdenes"}
                {nombreSede ? ` · ${nombreSede(t.sede_id)}` : ""}
              </p>
            </Td>
            <Td className="hidden tabular-nums sm:table-cell">{fecha(t.fecha)}</Td>
            <Td className="tabular-nums">{fecha(t.fecha_vencimiento)}</Td>
            <Td className="text-right tabular-nums">{soles(t.monto_total)}</Td>
            {gestiona && <Td className="hidden text-right tabular-nums sm:table-cell">{soles(t.deuda)}</Td>}
            <Td>
              <EstadoTicket t={t} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}
