import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { claseBoton } from "@/components/ui";
import { fecha, soles } from "@/lib/formato";
import { numeroOrden } from "@/lib/ordenes/estados";
import { enlaceWhatsApp, saldoTrasCobro, textoRecibo } from "@/lib/ordenes/mensaje-paciente";
import { NOMBRE_MEDIO } from "@/lib/ordenes/pagos";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { BotonImprimir } from "../../orden/[id]/barra-impresion";

export const metadata: Metadata = { title: "Recibo de pago" };

type Props = PageProps<"/imprimir/cobro/[id]">;

export default function PaginaRecibo({ params }: Props) {
  return (
    <Suspense fallback={<p className="text-center text-sm text-slate-500">Preparando recibo…</p>}>
      <Recibo params={params} />
    </Suspense>
  );
}

const Linea = () => <div className="my-1.5 border-t border-dashed border-black" />;

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Lima" }).format(new Date(iso));

type Cobro = {
  id: string;
  orden_id: string;
  importe: number;
  medio: string;
  numero_operacion: string | null;
  fecha: string;
  creado_en: string;
  anulado_en: string | null;
  orden: {
    numero: number;
    precio: number;
    descuento: number;
    sede: { nombre: string; direccion: string | null; telefono: string | null };
    paciente: { nombres: string; apellidos: string; telefono: string | null };
    pagos: { id: string; importe: number; creado_en: string; anulado_en: string | null }[];
  };
};

async function Recibo({ params }: Pick<Props, "params">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  // RLS: solo se ve el cobro si es de la óptica y de una sede del usuario.
  const [cobro, datosOptica] = await Promise.all([
    supabase
      .from("orden_pagos")
      .select(
        "id, orden_id, importe, medio, numero_operacion, fecha, creado_en, anulado_en, orden:ordenes(numero, precio, descuento, sede:sedes(nombre, direccion, telefono), paciente:pacientes(nombres, apellidos, telefono), pagos:orden_pagos(id, importe, creado_en, anulado_en))",
      )
      .eq("optica_id", optica.id)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("opticas").select("nombre, ruc, telefono, direccion").eq("id", optica.id).single(),
  ]);
  if (cobro.error) throw new Error(`No se pudo leer el cobro: ${cobro.error.message}`);
  if (!cobro.data) notFound();
  const c = cobro.data as unknown as Cobro;
  const op = datosOptica.data as { nombre: string; ruc: string | null; telefono: string | null; direccion: string | null };

  // Cobros vigentes registrados antes de este: el saldo del recibo es el que quedó en ese momento.
  const pagadoAntes = c.orden.pagos
    .filter((p) => !p.anulado_en && p.id !== c.id && p.creado_en < c.creado_en)
    .reduce((s, p) => s + Number(p.importe), 0);
  const datos = {
    optica: op.nombre,
    sede: c.orden.sede.nombre,
    orden: numeroOrden(c.orden.numero),
    paciente: `${c.orden.paciente.nombres} ${c.orden.paciente.apellidos}`,
    fecha: fecha(c.fecha),
    importe: Number(c.importe),
    medio: NOMBRE_MEDIO[c.medio] ?? c.medio,
    numeroOperacion: c.numero_operacion,
    total: Number(c.orden.precio) - Number(c.orden.descuento),
    pagadoAntes,
  };
  const { pagado, saldo } = saldoTrasCobro(datos);
  const whatsapp = c.anulado_en ? null : enlaceWhatsApp(c.orden.paciente.telefono, textoRecibo(datos));

  return (
    <>
      <div className="no-imprimir mx-auto mb-4 flex w-[80mm] max-w-full flex-wrap items-center justify-between gap-2 px-2">
        <Link href={`/panel/ordenes/${c.orden_id}`} className={claseBoton("secundario", "sm")}>
          Volver
        </Link>
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={claseBoton("secundario", "sm")}>
            <MessageCircle aria-hidden className="size-4" />
            WhatsApp
          </a>
        )}
        <BotonImprimir auto={false} />
      </div>
      {!whatsapp && !c.anulado_en && (
        <p className="no-imprimir mx-auto mb-3 w-[80mm] px-2 text-xs text-slate-500">El paciente no tiene un celular válido para enviarle el recibo.</p>
      )}

      <article className="ticket mx-auto w-[72mm] bg-white px-[2mm] py-[3mm] font-mono text-[11px] leading-snug text-black shadow-tarjeta">
        <header className="text-center">
          <p className="text-[13px] font-bold uppercase">{op.nombre}</p>
          {op.ruc && <p>RUC {op.ruc}</p>}
          <p>Sede {c.orden.sede.nombre}</p>
          {(c.orden.sede.direccion ?? op.direccion) && <p>{c.orden.sede.direccion ?? op.direccion}</p>}
          {(c.orden.sede.telefono ?? op.telefono) && <p>Tel. {c.orden.sede.telefono ?? op.telefono}</p>}
        </header>
        <Linea />
        <div className="text-center">
          <p className="font-bold">RECIBO DE PAGO</p>
          <p>Orden {datos.orden}</p>
          {c.anulado_en && <p className="mt-0.5 border border-black py-0.5 font-bold">*** COBRO ANULADO ***</p>}
        </div>
        <Linea />
        <p>Cliente: {datos.paciente}</p>
        <p>Fecha: {hora(c.creado_en)}</p>
        <p>
          Medio: {datos.medio}
          {c.numero_operacion ? ` · op. ${c.numero_operacion}` : ""}
        </p>
        <Linea />
        <div className="flex justify-between text-[13px] font-bold">
          <span>PAGADO</span>
          <span>{soles(datos.importe)}</span>
        </div>
        <Linea />
        <div className="flex justify-between">
          <span>Total del pedido</span>
          <span>{soles(datos.total)}</span>
        </div>
        <div className="flex justify-between">
          <span>Pagado a la fecha</span>
          <span>{soles(pagado)}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>SALDO</span>
          <span>{soles(saldo)}</span>
        </div>
        <Linea />
        <p className="text-center">{saldo > 0 ? "Pague el saldo al recoger su pedido." : "Pedido pagado por completo."}</p>
        <p className="text-center">¡Gracias por su preferencia!</p>
        <p className="mt-1 text-center text-[9px]">Documento interno, no es comprobante de pago SUNAT.</p>
      </article>
    </>
  );
}
