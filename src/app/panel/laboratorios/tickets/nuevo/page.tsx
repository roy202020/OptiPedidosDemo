import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { Alerta } from "@/components/formulario";
import { Cargando, Encabezado, Tarjeta } from "@/components/ui";
import type { OrdenParaTicket } from "@/lib/datos/cuentas-laboratorio";
import { listarLaboratorios } from "@/lib/datos/laboratorios";
import { exigirOptica, sedeParaRegistrar } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { hoyLimaISO } from "@/lib/validacion/comun";
import { FormularioTicket } from "./formulario-ticket";

export const metadata: Metadata = { title: "Registrar ticket de laboratorio" };

type Props = PageProps<"/panel/laboratorios/tickets/nuevo">;

export default function PaginaNuevoTicket({ searchParams }: Props) {
  return (
    <>
      <Encabezado
        titulo="Registrar ticket de laboratorio"
        descripcion="El ticket o nota que entrega el laboratorio con los trabajos. Toma la foto desde el celular."
        volver={{ href: "/panel/laboratorios", texto: "Laboratorios" }}
      />
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const uuid = (v: unknown) => (typeof v === "string" && z.uuid().safeParse(v).success ? v : undefined);

async function Contenido({ searchParams }: Pick<Props, "searchParams">) {
  const [sp, optica, { sede, error }, labs] = await Promise.all([searchParams, exigirOptica(), sedeParaRegistrar(), listarLaboratorios({ soloActivos: true })]);
  if (!sede) return <Alerta tipo="aviso">{error}</Alerta>;

  // Desde el detalle de una orden: laboratorio y orden ya elegidos.
  let orden: OrdenParaTicket | undefined;
  const ordenId = uuid(sp.orden);
  if (ordenId) {
    const supabase = await crearClienteServidor();
    const { data } = await supabase
      .from("ordenes")
      .select("id, numero, estado, creado_en, precio, descuento, laboratorio_id, sede_id, paciente:pacientes(nombres, apellidos)")
      .eq("optica_id", optica.id)
      .eq("id", ordenId)
      .maybeSingle();
    const o = data as unknown as (Omit<OrdenParaTicket, "paciente" | "precio_neto"> & { precio: number; descuento: number; laboratorio_id: string; sede_id: string; paciente: { nombres: string; apellidos: string } }) | null;
    if (o && o.sede_id === sede.id) {
      orden = { ...o, paciente: `${o.paciente.apellidos}, ${o.paciente.nombres}`, precio_neto: Number(o.precio) - Number(o.descuento) };
      sp.laboratorio = o.laboratorio_id;
    }
  }

  return (
    <Tarjeta className="max-w-4xl">
      <FormularioTicket
        laboratorios={labs.map((l) => ({ id: l.id, nombre: l.nombre, dias_credito: l.dias_credito }))}
        hoy={hoyLimaISO()}
        sede={sede.nombre}
        inicial={{ laboratorio: uuid(sp.laboratorio), orden }}
      />
    </Tarjeta>
  );
}
