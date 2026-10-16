import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { claseBoton } from "@/components/ui";
import { reservasDeOrden } from "@/lib/datos/inventario";
import { obtenerOrden } from "@/lib/datos/ordenes";
import { fecha, graduacion, soles, valor } from "@/lib/formato";
import { textoMedida } from "@/lib/inventario/medidas";
import { ORIGENES_MONTURA, SUBESTADO, TIPOS_TRABAJO, numeroOrden } from "@/lib/ordenes/estados";
import { descripcionLente } from "@/lib/ordenes/mensaje-laboratorio";
import { MEDIOS_PAGO, resumenPagos } from "@/lib/ordenes/pagos";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { BotonImprimir } from "./barra-impresion";

export const metadata: Metadata = { title: "Imprimir orden" };

type Props = PageProps<"/imprimir/orden/[id]">;

export default function PaginaImprimirOrden({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<p className="text-center text-sm text-slate-500">Preparando ticket…</p>}>
      <Ticket params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Lima" }).format(new Date(iso));

/** Línea divisoria de ticket. */
const Linea = () => <div className="my-1.5 border-t border-dashed border-black" />;

async function Ticket({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const conImportes = sp.importes === "1";
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const [{ orden: o }, reservas, datosOptica] = await Promise.all([
    obtenerOrden(id),
    reservasDeOrden(id),
    supabase.from("opticas").select("nombre, ruc, telefono, direccion").eq("id", optica.id).single(),
  ]);
  const op = datosOptica.data as { nombre: string; ruc: string | null; telefono: string | null; direccion: string | null };
  const base = `/imprimir/orden/${id}`;
  const cobro = resumenPagos(o, o.pagos);
  const pagosVigentes = o.pagos.filter((p) => !p.anulado_en);

  return (
    <>
      <div className="no-imprimir mx-auto mb-4 flex w-[80mm] max-w-full flex-wrap items-center justify-between gap-2 px-2">
        <Link href={`/panel/ordenes/${id}`} className={claseBoton("secundario", "sm")}>
          Volver
        </Link>
        <Link href={conImportes ? base : `${base}?importes=1`} className={claseBoton("fantasma", "sm")}>
          {conImportes ? "Sin importes (laboratorio)" : "Con importes (cliente)"}
        </Link>
        <BotonImprimir auto={sp.auto === "1"} />
      </div>

      <article className="ticket mx-auto w-[72mm] bg-white px-[2mm] py-[3mm] font-mono text-[11px] leading-snug text-black shadow-tarjeta">
        <header className="text-center">
          <p className="text-[13px] font-bold uppercase">{op.nombre}</p>
          {op.ruc && <p>RUC {op.ruc}</p>}
          {op.direccion && <p>{op.direccion}</p>}
          {op.telefono && <p>Tel. {op.telefono}</p>}
        </header>
        <Linea />
        <div className="text-center">
          <p className="font-bold">ORDEN DE TRABAJO</p>
          <p className="text-[18px] font-bold">{numeroOrden(o.numero)}</p>
          {o.prioridad === "urgente" && <p className="mt-0.5 border border-black py-0.5 font-bold">*** URGENTE ***</p>}
        </div>
        <Linea />

        <dl className="grid grid-cols-[auto_1fr] gap-x-2">
          <dt>Fecha:</dt>
          <dd>{fechaHora(o.creado_en)}</dd>
          <dt>Entrega:</dt>
          <dd className="font-bold">{fecha(o.fecha_entrega_prometida)}</dd>
          <dt>Paciente:</dt>
          <dd className="font-bold">
            {o.paciente.apellidos}, {o.paciente.nombres}
          </dd>
          <dt>Lab.:</dt>
          <dd>{o.laboratorio.nombre}</dd>
          <dt>Trabajo:</dt>
          <dd>{TIPOS_TRABAJO[o.tipo_trabajo]}</dd>
          <dt>Estado:</dt>
          <dd>{SUBESTADO[o.estado]}</dd>
        </dl>
        <Linea />

        <p className="font-bold">GRADUACIÓN</p>
        <table className="w-full table-fixed text-center tabular-nums">
          <thead>
            <tr className="border-b border-black">
              <th className="w-[9mm] text-left">Ojo</th>
              <th>Esf</th>
              <th>Cil</th>
              <th className="w-[9mm]">Eje</th>
              <th>Add</th>
            </tr>
          </thead>
          <tbody>
            {o.ojos.map((j) => (
              <tr key={j.ojo}>
                <th className="text-left">{j.ojo}</th>
                <td>{graduacion(j.esfera)}</td>
                <td>{j.cilindro ? graduacion(j.cilindro) : "—"}</td>
                <td>{j.cilindro ? valor(j.eje) : "—"}</td>
                <td>{j.adicion ? graduacion(j.adicion) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {o.ojos.some((j) => j.dnp || j.altura || j.prisma) && (
          <table className="mt-1 w-full table-fixed text-center tabular-nums">
            <thead>
              <tr className="border-b border-black">
                <th className="w-[9mm] text-left">Ojo</th>
                <th>DNP</th>
                <th>Alt</th>
                <th>Prisma</th>
              </tr>
            </thead>
            <tbody>
              {o.ojos.map((j) => (
                <tr key={j.ojo}>
                  <th className="text-left">{j.ojo}</th>
                  <td>{valor(j.dnp)}</td>
                  <td>{valor(j.altura)}</td>
                  <td>{j.prisma ? `${j.prisma} ${j.base_prisma ?? ""}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {o.ojos.some((j) => descripcionLente(j)) && (
          <>
            <Linea />
            <p className="font-bold">LENTES</p>
            {o.ojos.map((j) => (descripcionLente(j) ? <p key={j.ojo}>{j.ojo}: {descripcionLente(j)}</p> : null))}
          </>
        )}

        {reservas.length > 0 && (
          <>
            <Linea />
            <p className="font-bold">LUNAS DE STOCK</p>
            {reservas.map((r) => (
              <p key={r.id}>
                {r.ojo}: {r.variante.producto} {textoMedida(r.variante)}
              </p>
            ))}
          </>
        )}

        {(o.montura_origen || o.montura_descripcion) && (
          <>
            <Linea />
            <p className="font-bold">MONTURA</p>
            {o.montura_origen && <p>{ORIGENES_MONTURA[o.montura_origen]}</p>}
            {o.montura_descripcion && <p>{o.montura_descripcion}</p>}
          </>
        )}

        {o.observaciones.length > 0 && (
          <>
            <Linea />
            <p className="font-bold">OBSERVACIONES</p>
            {[...o.observaciones].reverse().map((ob) => (
              <p key={ob.id} className="whitespace-pre-line">
                - {ob.texto}
              </p>
            ))}
          </>
        )}

        {conImportes && (
          <>
            <Linea />
            <dl className="grid grid-cols-[1fr_auto] tabular-nums">
              <dt>Precio</dt>
              <dd>{soles(o.precio)}</dd>
              <dt>Descuento</dt>
              <dd>{Number(o.descuento) ? `-${soles(o.descuento)}` : soles(0)}</dd>
              <dt className="font-bold">Total</dt>
              <dd className="font-bold">{soles(cobro.neto)}</dd>
            </dl>
            {cobro.neto > 0 && (
              <>
                <Linea />
                <p className="font-bold">PAGOS</p>
                {pagosVigentes.length > 0 ? (
                  <table className="w-full tabular-nums">
                    <tbody>
                      {pagosVigentes.map((p) => (
                        <tr key={p.id}>
                          <td className="pr-1">{fecha(p.fecha)}</td>
                          <td>{MEDIOS_PAGO[p.medio]}</td>
                          <td className="text-right">{soles(p.importe)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>Sin pagos registrados.</p>
                )}
                <dl className="mt-1 grid grid-cols-[1fr_auto] tabular-nums">
                  <dt>Total pagado</dt>
                  <dd>{soles(cobro.pagado)}</dd>
                  <dt className="font-bold">{cobro.saldo > 0 ? "SALDO PENDIENTE" : "Saldo"}</dt>
                  <dd className="font-bold">{cobro.saldo > 0 ? soles(cobro.saldo) : "CANCELADO"}</dd>
                </dl>
              </>
            )}
            <p className="mt-0.5 text-[10px]">Importes en soles, IGV incluido.</p>
          </>
        )}

        <Linea />
        <p className="text-center text-[10px]">Impreso {fechaHora(new Date().toISOString())}</p>
        {/* Margen final para el corte de la impresora */}
        <div className="h-[8mm]" />
      </article>
    </>
  );
}
