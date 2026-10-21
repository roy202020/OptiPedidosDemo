import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { Alerta } from "@/components/formulario";
import { Cargando, Encabezado, Tarjeta } from "@/components/ui";
import { cajaAbierta, listarTicketsLab } from "@/lib/datos/cuentas-laboratorio";
import { listarLaboratorios } from "@/lib/datos/laboratorios";
import { exigirPermiso, sedeParaRegistrar } from "@/lib/sesion";
import { hoyLimaISO } from "@/lib/validacion/comun";
import { FormularioPago } from "./formulario-pago";

export const metadata: Metadata = { title: "Registrar pago a laboratorio" };

type Props = PageProps<"/panel/laboratorios/pagos/nuevo">;

export default function PaginaNuevoPago({ searchParams }: Props) {
  return (
    <>
      <Encabezado
        titulo="Registrar pago a laboratorio"
        descripcion="Elige el laboratorio y reparte el pago entre sus tickets pendientes. Queda registrado quién pagó, cuánto, cómo y con qué comprobante."
        volver={{ href: "/panel/laboratorios", texto: "Laboratorios" }}
      />
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Contenido({ searchParams }: Pick<Props, "searchParams">) {
  await exigirPermiso("gestionarCuentasLaboratorio");
  const [sp, { sede, error }, labs] = await Promise.all([searchParams, sedeParaRegistrar(), listarLaboratorios()]);
  if (!sede) return <Alerta tipo="aviso">{error}</Alerta>;

  const laboratorio = typeof sp.laboratorio === "string" && z.uuid().safeParse(sp.laboratorio).success ? sp.laboratorio : "";
  const [tickets, caja] = await Promise.all([
    laboratorio ? listarTicketsLab({ laboratorio, sede: sede.id, soloPendientes: true }) : Promise.resolve([]),
    cajaAbierta(sede.id),
  ]);

  return (
    <Tarjeta className="max-w-4xl">
      <FormularioPago
        key={laboratorio}
        laboratorios={labs.map((l) => ({ id: l.id, nombre: l.nombre }))}
        laboratorio={laboratorio}
        tickets={tickets.map((t) => ({
          id: t.id,
          numero_ticket: t.numero_ticket,
          fecha: t.fecha,
          fecha_vencimiento: t.fecha_vencimiento,
          monto_total: Number(t.monto_total),
          deuda: Number(t.deuda),
          estado_vencimiento: t.estado_vencimiento,
          dias_para_vencer: t.dias_para_vencer,
        }))}
        hoy={hoyLimaISO()}
        sede={sede.nombre}
        hayCaja={Boolean(caja)}
      />
    </Tarjeta>
  );
}
