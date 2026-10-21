import { ArrowDownCircle, Banknote, Coins, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alerta } from "@/components/formulario";
import { Cargando, claseBoton, Encabezado, Indicador, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { cajaAbierta, listarCajas, movimientosCaja, nombresMiembros, resumenCaja } from "@/lib/datos/cuentas-laboratorio";
import { fechaLima, soles } from "@/lib/formato";
import { tienePermiso } from "@/lib/permisos";
import { exigirOptica, sedeParaRegistrar } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cerrarCaja } from "./acciones";
import { FormularioApertura, FormularioCierre } from "./formularios";

export const metadata: Metadata = { title: "Caja" };

export default function PaginaCaja() {
  return (
    <>
      <Encabezado
        titulo="Caja de la sede"
        descripcion="Efectivo de la sede: se abre al empezar el día y se cierra contando. Los cobros en efectivo entran aquí y los pagos a laboratorios en efectivo salen de aquí."
      />
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Contenido />
      </Suspense>
    </>
  );
}

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Lima" }).format(new Date(iso));

async function Contenido() {
  const optica = await exigirOptica();
  const { sede, error } = await sedeParaRegistrar();
  if (!sede) return <Alerta tipo="aviso">{error}</Alerta>;

  // El vendedor abre la caja de su sede, pero los importes y el cierre son de propietario y administrador.
  if (!tienePermiso(optica.rol, "gestionarCobros")) {
    const supabase = await crearClienteServidor();
    const { data: abiertaId } = await supabase.rpc("caja_abierta", { p_sede: sede.id });
    return abiertaId ? (
      <Alerta tipo="exito">
        La caja de la sede {sede.nombre} está abierta: los cobros en efectivo entran a ella. El cierre lo hace un administrador.
      </Alerta>
    ) : (
      <Tarjeta titulo={`La caja de la sede ${sede.nombre} está cerrada`} descripcion="Ábrela para cobrar en efectivo. El cierre lo hace un administrador.">
        <FormularioApertura />
      </Tarjeta>
    );
  }

  const [abierta, historial, nombres] = await Promise.all([cajaAbierta(sede.id), listarCajas(sede.id), nombresMiembros()]);
  const [resumen, movimientos] = abierta ? await Promise.all([resumenCaja(abierta.id), movimientosCaja(abierta.id)]) : [null, []];
  const cerradas = historial.filter((c) => c.cerrada_en);

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-2 text-sm text-slate-600">
        Sede: <strong className="font-medium text-slate-900">{sede.nombre}</strong>
      </p>

      {!abierta || !resumen ? (
        <Tarjeta titulo="La caja está cerrada" descripcion="Ábrela para cobrar en efectivo y para pagar a laboratorios con efectivo de caja.">
          <FormularioApertura />
        </Tarjeta>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador titulo="Efectivo inicial" valor={soles(resumen.monto_inicial)} detalle={`Abierta ${hora(abierta.abierta_en)}`} icono={Coins} />
            <Indicador titulo="Cobros en efectivo" valor={soles(resumen.cobros_efectivo)} detalle="Cobros de órdenes en esta caja" icono={Banknote} tono="verde" />
            <Indicador titulo="Egresos" valor={soles(resumen.egresos)} detalle="Pagos a laboratorios" icono={ArrowDownCircle} tono="ambar" />
            <Indicador titulo="Esperado en caja" valor={soles(resumen.esperado)} icono={Wallet} tono="violeta" />
          </div>

          <Tarjeta
            titulo="Egresos de esta caja"
            acciones={
              <Link href="/panel/egresos" className={claseBoton("secundario", "sm")}>
                Registrar egreso
              </Link>
            }
            sinRelleno
          >
            {movimientos.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Todavía no hay egresos.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {movimientos.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <div className={m.anulado_en ? "text-slate-400" : "text-slate-700"}>
                      <p className={m.anulado_en ? "line-through" : undefined}>{m.concepto}</p>
                      <p className="text-xs text-slate-500">
                        {hora(m.creado_en)} · {(m.creado_por && nombres.get(m.creado_por)) || "—"}
                        {m.anulado_en && ` · ${m.motivo_anulacion}`}
                      </p>
                    </div>
                    <span className="flex items-center gap-2 tabular-nums">
                      {m.anulado_en && <Insignia>Anulado</Insignia>}− {soles(m.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta titulo="Cerrar caja" descripcion="Cuenta el efectivo y regístralo. La diferencia queda guardada.">
            <FormularioCierre accion={cerrarCaja.bind(null, abierta.id)} esperado={resumen.esperado} />
          </Tarjeta>
        </>
      )}

      {cerradas.length > 0 && (
        <section aria-labelledby="cajas-anteriores">
          <h2 id="cajas-anteriores" className="mb-3 text-base font-semibold text-slate-900">
            Cajas anteriores
          </h2>
          <Tabla>
            <thead>
              <tr>
                <Th>Abierta</Th>
                <Th className="hidden sm:table-cell">Cerrada</Th>
                <Th className="text-right">Inicial</Th>
                <Th className="text-right">Contado</Th>
                <Th className="hidden md:table-cell">Cerró</Th>
              </tr>
            </thead>
            <tbody>
              {cerradas.map((c) => (
                <tr key={c.id}>
                  <Td className="tabular-nums">{fechaLima(c.abierta_en)}</Td>
                  <Td className="hidden tabular-nums sm:table-cell">{c.cerrada_en ? hora(c.cerrada_en) : "—"}</Td>
                  <Td className="text-right tabular-nums">{soles(c.monto_inicial)}</Td>
                  <Td className="text-right tabular-nums">{soles(c.monto_contado)}</Td>
                  <Td className="hidden break-all md:table-cell">{(c.cerrada_por && nombres.get(c.cerrada_por)) || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </section>
      )}

      <p className="text-xs text-slate-500">
        Los pagos a laboratorios se registran en{" "}
        <Link href="/panel/laboratorios/pagos/nuevo" className="font-medium text-marca-700 hover:underline">
          Registrar pago
        </Link>
        .
      </p>
    </div>
  );
}
