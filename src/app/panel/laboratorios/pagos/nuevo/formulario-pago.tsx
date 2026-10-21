"use client";

import { CheckCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { CampoFoto } from "@/components/campo-foto";
import { AreaTexto, Alerta, BotonEnviar, Campo, Selector } from "@/components/formulario";
import { Boton, claseControl, Insignia } from "@/components/ui";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { fecha as formatoFecha, soles } from "@/lib/formato";
import { cuandoVence, ESTADO_VENCIMIENTO, MEDIOS_PAGO_LAB, NOMBRE_MEDIO_LAB, type EstadoVencimiento } from "@/lib/laboratorios/cuentas";
import { leerImporte } from "@/lib/validacion/orden";
import { registrarPagoLab } from "../../acciones-cuentas";

export type TicketPendiente = {
  id: string;
  numero_ticket: string;
  fecha: string;
  fecha_vencimiento: string;
  monto_total: number;
  deuda: number;
  estado_vencimiento: EstadoVencimiento;
  dias_para_vencer: number;
};

export function FormularioPago({
  laboratorios,
  laboratorio,
  tickets,
  hoy,
  sede,
  hayCaja,
}: {
  laboratorios: { id: string; nombre: string }[];
  laboratorio: string;
  tickets: TicketPendiente[];
  hoy: string;
  sede: string;
  hayCaja: boolean;
}) {
  const router = useRouter();
  const [estado, enviar] = useActionState(registrarPagoLab, {} as EstadoFormulario);
  const v = estado.valores ?? {};
  const e = estado.campos ?? {};
  const [montos, setMontos] = useState<Record<string, string>>(() => {
    try {
      const previas = JSON.parse(v.aplicaciones ?? "[]") as { ticket_id: string; monto: string }[];
      return Object.fromEntries(previas.map((a) => [a.ticket_id, a.monto]));
    } catch {
      return {};
    }
  });

  const total = useMemo(
    () => Math.round(Object.values(montos).reduce((s, m) => s + (Number.isFinite(leerImporte(m)) ? leerImporte(m) : 0), 0) * 100) / 100,
    [montos],
  );
  const aplicaciones = JSON.stringify(Object.entries(montos).filter(([, m]) => m.trim() !== "").map(([ticket_id, monto]) => ({ ticket_id, monto })));
  const opcionesMedio = MEDIOS_PAGO_LAB.map((m) => ({
    valor: m,
    texto: m === "efectivo_caja" && !hayCaja ? `${NOMBRE_MEDIO_LAB[m]} (no hay caja abierta)` : NOMBRE_MEDIO_LAB[m],
  }));

  return (
    <form action={enviar} className="flex flex-col gap-6" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      <input type="hidden" name="aplicaciones" value={aplicaciones} />

      <Selector
        nombre="laboratorio_id"
        etiqueta="Laboratorio"
        required
        opciones={[{ valor: "", texto: "Elige el laboratorio" }, ...laboratorios.map((l) => ({ valor: l.id, texto: l.nombre }))]}
        value={laboratorio}
        onChange={(ev) => router.replace(`/panel/laboratorios/pagos/nuevo?laboratorio=${ev.currentTarget.value}`)}
        errores={e.laboratorio_id}
        className="max-w-md"
      />

      {laboratorio && (
        <section aria-labelledby="tickets-pendientes" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="tickets-pendientes" className="text-sm font-semibold text-slate-900">
              Tickets pendientes en la sede {sede}
            </h2>
            {tickets.length > 0 && (
              <Boton tamano="sm" icono={CheckCheck} onClick={() => setMontos(Object.fromEntries(tickets.map((t) => [t.id, t.deuda.toFixed(2)])))}>
                Pagar todo
              </Boton>
            )}
          </div>
          {tickets.length === 0 ? (
            <p className="text-sm text-slate-500">Este laboratorio no tiene tickets pendientes en esta sede.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {tickets.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                      <Link href={`/panel/laboratorios/tickets/${t.id}`} className="hover:underline" target="_blank">
                        Ticket {t.numero_ticket}
                      </Link>
                      {t.estado_vencimiento !== "al_dia" && (
                        <Insignia tono={ESTADO_VENCIMIENTO[t.estado_vencimiento].tono}>{cuandoVence(t.dias_para_vencer)}</Insignia>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      Vence {formatoFecha(t.fecha_vencimiento)} · debe {soles(t.deuda)} de {soles(t.monto_total)}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    Pagar S/
                    <input
                      inputMode="decimal"
                      aria-label={`Monto a pagar del ticket ${t.numero_ticket}`}
                      value={montos[t.id] ?? ""}
                      placeholder="0.00"
                      onChange={(ev) => setMontos({ ...montos, [t.id]: ev.currentTarget.value })}
                      className={`${claseControl} h-9 w-28 text-right`}
                    />
                  </label>
                  <Boton tamano="sm" onClick={() => setMontos({ ...montos, [t.id]: t.deuda.toFixed(2) })}>
                    Todo
                  </Boton>
                </li>
              ))}
            </ul>
          )}
          {e.aplicaciones && <p className="text-xs text-red-600">{e.aplicaciones[0]}</p>}
          <p className="text-right text-sm text-slate-700">
            Total del pago: <strong className="text-lg tabular-nums text-slate-900">{soles(total)}</strong>
          </p>
        </section>
      )}

      <fieldset className="grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
        <legend className="sr-only">Datos del pago</legend>
        <Campo nombre="fecha" etiqueta="Fecha del pago" tipo="date" required max={hoy} defaultValue={v.fecha ?? hoy} errores={e.fecha} />
        <Selector
          nombre="medio"
          etiqueta="Cómo se pagó"
          opciones={opcionesMedio}
          defaultValue={v.medio ?? (hayCaja ? "efectivo_caja" : "yape")}
          errores={e.medio}
          ayuda={hayCaja ? "Efectivo de caja crea un egreso en la caja abierta de la sede." : undefined}
        />
        <Campo nombre="numero_operacion" etiqueta="N.º de operación" maxLength={60} autoComplete="off" defaultValue={v.numero_operacion} errores={e.numero_operacion} />
        <div className="sm:col-span-2">
          <CampoFoto etiqueta="Foto del comprobante" ayuda="Captura de Yape o Plin, voucher o recibo del laboratorio." previa={v.foto_path || undefined} />
        </div>
        <AreaTexto nombre="observaciones" etiqueta="Observaciones" maxLength={500} rows={2} className="sm:col-span-2" defaultValue={v.observaciones} errores={e.observaciones} />
      </fieldset>

      {!hayCaja && (
        <p className="text-xs text-slate-500">
          Para pagar con efectivo de caja, primero{" "}
          <Link href="/panel/caja" className="font-medium text-marca-700 hover:underline">
            abre la caja de la sede
          </Link>
          .
        </p>
      )}
      <div className="flex justify-end border-t border-slate-100 pt-6">
        <BotonEnviar pendiente="Registrando…" icono={Wallet}>
          Registrar pago de {soles(total)}
        </BotonEnviar>
      </div>
    </form>
  );
}
