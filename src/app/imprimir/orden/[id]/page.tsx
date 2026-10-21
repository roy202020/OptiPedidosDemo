import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { claseBoton } from "@/components/ui";
import { qrSvg, urlPublica } from "@/lib/datos/consulta-publica";
import { reservasDeOrden } from "@/lib/datos/inventario";
import { obtenerOrden } from "@/lib/datos/ordenes";
import { enlaceConsulta } from "@/lib/ordenes/consulta-publica";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { BotonImprimir } from "./barra-impresion";
import { ComprobantePaciente } from "./comprobante-paciente";
import { TicketLaboratorio } from "./ticket-laboratorio";

export const metadata: Metadata = { title: "Imprimir orden" };

type Props = PageProps<"/imprimir/orden/[id]">;

export default function PaginaImprimirOrden({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<p className="text-center text-sm text-slate-500">Preparando ticket…</p>}>
      <Ticket params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Una orden tiene dos comprobantes de 80 mm y la página pinta solo el elegido, así que
 * se imprime únicamente ese: `?copia=laboratorio` (por defecto) o `?copia=paciente`.
 */
async function Ticket({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const paraPaciente = sp.copia === "paciente";
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  // RLS: obtenerOrden solo devuelve la orden si es de la óptica y de una sede del usuario.
  const [{ orden: o }, reservas, datosOptica] = await Promise.all([
    obtenerOrden(id),
    paraPaciente ? Promise.resolve([]) : reservasDeOrden(id),
    supabase.from("opticas").select("nombre, ruc, telefono, direccion").eq("id", optica.id).single(),
  ]);
  const op = datosOptica.data as { nombre: string; ruc: string | null; telefono: string | null; direccion: string | null };
  const url = paraPaciente && o.estado !== "anulada" ? enlaceConsulta(await urlPublica(), o.codigo_consulta) : null;
  const consulta = url ? { url, qr: await qrSvg(url) } : null;
  const base = `/imprimir/orden/${id}`;

  return (
    <>
      <div className="no-imprimir mx-auto mb-4 flex w-[80mm] max-w-full flex-wrap items-center justify-between gap-2 px-2">
        <Link href={`/panel/ordenes/${id}`} className={claseBoton("secundario", "sm")}>
          Volver
        </Link>
        <Link href={paraPaciente ? base : `${base}?copia=paciente`} className={claseBoton("fantasma", "sm")}>
          {paraPaciente ? "Ver ticket del laboratorio" : "Ver comprobante del paciente"}
        </Link>
        <BotonImprimir auto={sp.auto === "1"} />
        <p className="w-full text-xs text-slate-500">
          {paraPaciente ? "Comprobante del paciente: sin graduación ni datos internos." : "Ticket del laboratorio: sin importes."}
        </p>
      </div>

      <article className="ticket mx-auto w-[72mm] bg-white px-[2mm] py-[3mm] font-mono text-[11px] leading-snug text-black shadow-tarjeta">
        {paraPaciente ? (
          <ComprobantePaciente orden={o} optica={op} consulta={consulta} />
        ) : (
          <TicketLaboratorio orden={o} reservas={reservas} optica={op} />
        )}
      </article>
    </>
  );
}
