import { Ban, Image as IconoFoto, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alerta, Campo, Confirmacion } from "@/components/formulario";
import { Cargando, Datos, Encabezado, EnlaceBoton, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { rutaVerFoto } from "@/lib/datos/archivos-laboratorio";
import { nombresMiembros, obtenerTicketLab } from "@/lib/datos/cuentas-laboratorio";
import { fecha, fechaLima, soles } from "@/lib/formato";
import { diferenciaOrdenes, NOMBRE_MEDIO_LAB } from "@/lib/laboratorios/cuentas";
import { numeroOrden } from "@/lib/ordenes/estados";
import { tienePermiso } from "@/lib/permisos";
import { exigirOptica, obtenerSedes } from "@/lib/sesion";
import { actualizarTicket, anularTicket } from "../../acciones-cuentas";
import { EstadoTicket } from "../../componentes-cuentas";
import { FormularioEdicionTicket } from "./formulario-edicion";

export const metadata: Metadata = { title: "Ticket de laboratorio" };

type Props = PageProps<"/panel/laboratorios/tickets/[id]">;

export default function PaginaTicket({ params }: Props) {
  return (
    <Suspense fallback={<Cargando alto="h-96" />}>
      <Detalle params={params} />
    </Suspense>
  );
}

async function Detalle({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const [{ ticket: t, lineas, aplicaciones }, optica, sedes] = await Promise.all([obtenerTicketLab(id), exigirOptica(), obtenerSedes()]);
  const gestiona = tienePermiso(optica.rol, "gestionarCuentasLaboratorio");
  const nombres = gestiona ? await nombresMiembros() : new Map<string, string>();
  const anulado = Boolean(t.anulado_en);
  const diferencia = diferenciaOrdenes(Number(t.monto_total), lineas.map((l) => l.monto));
  const sede = sedes.find((s) => s.id === t.sede_id)?.nombre ?? "—";
  const cuenta = `/panel/laboratorios/${t.laboratorio_id}?vista=cuenta`;

  return (
    <>
      <Encabezado
        titulo={`Ticket ${t.numero_ticket}`}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={cuenta} className="font-medium text-marca-700 hover:underline">
              {t.laboratorio}
            </Link>
            <EstadoTicket t={t} />
          </span>
        }
        volver={{ href: cuenta, texto: t.laboratorio }}
      >
        {t.foto_path && (
          <EnlaceBoton href={rutaVerFoto(t.foto_path)} icono={IconoFoto}>
            Ver foto
          </EnlaceBoton>
        )}
        {gestiona && !anulado && t.deuda > 0 && (
          <EnlaceBoton href={`/panel/laboratorios/pagos/nuevo?laboratorio=${t.laboratorio_id}`} variante="primario" icono={Wallet}>
            Registrar pago
          </EnlaceBoton>
        )}
      </Encabezado>

      <div className="flex flex-col gap-6">
        {anulado && (
          <Alerta tipo="error">
            Ticket anulado el {fechaLima(t.anulado_en!)}: {t.motivo_anulacion}. No cuenta en la deuda ni en el costo de las órdenes.
          </Alerta>
        )}
        {!anulado && diferencia !== 0 && (
          <Alerta tipo="aviso">
            La suma de las órdenes ({soles(t.monto_ordenes)}) no coincide con el total del ticket ({soles(t.monto_total)}).
          </Alerta>
        )}

        <Tarjeta>
          <Datos
            columnas={4}
            items={[
              { titulo: "Fecha", valor: fecha(t.fecha) },
              { titulo: "Vence", valor: fecha(t.fecha_vencimiento) },
              { titulo: "Total", valor: soles(t.monto_total) },
              { titulo: "Sede", valor: sede },
              ...(gestiona
                ? [
                    { titulo: "Pagado", valor: soles(t.pagado) },
                    { titulo: "Por pagar", valor: soles(t.deuda) },
                    { titulo: "Registró", valor: (t.registrado_por && nombres.get(t.registrado_por)) || "—" },
                  ]
                : []),
              { titulo: "Observaciones", valor: t.observaciones ?? "—" },
            ]}
          />
        </Tarjeta>

        <section aria-label="Órdenes del ticket">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Órdenes que cubre</h2>
          <Tabla>
            <thead>
              <tr>
                <Th>Orden</Th>
                <Th className="hidden sm:table-cell">Paciente</Th>
                <Th className="text-right">Costo lab.</Th>
                {gestiona && <Th className="hidden text-right md:table-cell">Venta neta</Th>}
                {gestiona && <Th className="hidden text-right md:table-cell">Ganancia</Th>}
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <Link href={`/panel/ordenes/${l.orden_id}`} className="font-medium text-marca-700 hover:underline">
                      {numeroOrden(l.numero)}
                    </Link>
                    <p className="text-xs text-slate-500 sm:hidden">{l.paciente}</p>
                  </Td>
                  <Td className="hidden sm:table-cell">{l.paciente}</Td>
                  <Td className="text-right tabular-nums">{soles(l.monto)}</Td>
                  {gestiona && <Td className="hidden text-right tabular-nums md:table-cell">{soles(l.precio_neto)}</Td>}
                  {gestiona && <Td className="hidden text-right tabular-nums md:table-cell">{soles(l.precio_neto - l.monto)}</Td>}
                </tr>
              ))}
            </tbody>
          </Tabla>
        </section>

        {gestiona && (
          <Tarjeta titulo="Pagos aplicados" sinRelleno>
            {aplicaciones.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Sin pagos.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {aplicaciones.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <span className={a.pago.anulado_en ? "text-slate-400 line-through" : "text-slate-700"}>
                      {fecha(a.pago.fecha)} · {NOMBRE_MEDIO_LAB[a.pago.medio]}
                      {a.pago.numero_operacion ? ` · op. ${a.pago.numero_operacion}` : ""}
                    </span>
                    <span className="flex items-center gap-2 tabular-nums">
                      {a.pago.anulado_en && <Insignia>Anulado</Insignia>}
                      {soles(a.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        )}

        {gestiona && !anulado && (
          <Tarjeta titulo="Editar ticket" descripcion="Cada cambio queda en la auditoría: quién, cuándo y qué cambió.">
            <FormularioEdicionTicket
              accion={actualizarTicket.bind(null, t.id)}
              inicial={{
                fecha: t.fecha,
                fecha_vencimiento: t.fecha_vencimiento,
                monto_total: Number(t.monto_total).toFixed(2),
                observaciones: t.observaciones ?? "",
              }}
            />
            <div className="mt-6 border-t border-slate-100 pt-4">
              <Confirmacion
                accion={anularTicket.bind(null, t.id)}
                titulo={`Anular ticket ${t.numero_ticket}`}
                descripcion="Deja de contar en la deuda y en el costo de sus órdenes. No se borra. Si tiene pagos vigentes, anúlalos primero."
                textoBoton="Anular ticket"
                iconoBoton={<Ban />}
                textoConfirmar="Anular ticket"
                pendiente="Anulando…"
              >
                <Campo nombre="motivo" etiqueta="Motivo" required maxLength={300} />
              </Confirmacion>
            </div>
          </Tarjeta>
        )}
      </div>
    </>
  );
}
