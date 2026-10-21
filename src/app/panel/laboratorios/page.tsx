import { AlarmClock, FlaskConical, Mail, PackageCheck, Phone, Plus, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, Encabezado, EnlaceBoton, EstadoVacio, Insignia } from "@/components/ui";
import { listarLaboratorios } from "@/lib/datos/laboratorios";
import { fecha } from "@/lib/formato";

export const metadata: Metadata = { title: "Laboratorios" };

export default function PaginaLaboratorios() {
  return (
    <>
      <Encabezado titulo="Laboratorios" descripcion="Laboratorios con los que trabajas, su carga de trabajo y sus cuentas.">
        <EnlaceBoton href="/panel/laboratorios/tickets/nuevo" icono={Receipt}>
          Registrar ticket
        </EnlaceBoton>
        <EnlaceBoton href="/panel/laboratorios/nuevo" variante="primario" icono={Plus}>
          Nuevo laboratorio
        </EnlaceBoton>
      </Encabezado>
      <Suspense fallback={<Cargando />}>
        <Listado />
      </Suspense>
    </>
  );
}

async function Listado() {
  const labs = await listarLaboratorios();
  if (labs.length === 0) {
    return (
      <EstadoVacio
        icono={FlaskConical}
        titulo="Aún no registras laboratorios"
        descripcion="Registra al menos un laboratorio para poder crear órdenes de trabajo."
      >
        <EnlaceBoton href="/panel/laboratorios/nuevo" variante="primario" icono={Plus}>
          Nuevo laboratorio
        </EnlaceBoton>
      </EstadoVacio>
    );
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {labs.map((l) => (
        <li key={l.id}>
          <Link
            href={`/panel/laboratorios/${l.id}`}
            className={`flex h-full flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-tarjeta transition hover:-translate-y-px hover:border-marca-300 hover:shadow-elevada ${
              l.activo ? "" : "opacity-70"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="flex min-w-0 items-center gap-2.5 font-semibold text-slate-900">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-700 ring-1 ring-marca-100 ring-inset">
                  <FlaskConical aria-hidden className="size-4.5" />
                </span>
                <span className="truncate">{l.nombre}</span>
              </p>
              {!l.activo && <Insignia>Inactivo</Insignia>}
            </div>
            <div className="mt-1 space-y-0.5 text-sm text-slate-500">
              {l.contacto && <p>{l.contacto}</p>}
              {l.telefono && (
                <p className="flex items-center gap-1.5">
                  <Phone aria-hidden className="size-3.5" />
                  {l.telefono}
                </p>
              )}
              {l.email && (
                <p className="flex items-center gap-1.5 break-all">
                  <Mail aria-hidden className="size-3.5 shrink-0" />
                  {l.email}
                </p>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
              <div>
                <dt className="text-xs text-slate-500">Pendientes</dt>
                <dd className="text-lg font-semibold tabular-nums text-slate-900">{l.carga.pendientes}</dd>
              </div>
              <div>
                <dt className="flex items-center justify-center gap-1 text-xs text-slate-500">
                  <AlarmClock aria-hidden className="size-3" />
                  Atrasadas
                </dt>
                <dd className={`text-lg font-semibold tabular-nums ${l.carga.atrasadas ? "text-red-600" : "text-slate-900"}`}>
                  {l.carga.atrasadas}
                </dd>
              </div>
              <div>
                <dt className="flex items-center justify-center gap-1 text-xs text-slate-500">
                  <PackageCheck aria-hidden className="size-3" />
                  Listas
                </dt>
                <dd className="text-lg font-semibold tabular-nums text-slate-900">{l.carga.listas}</dd>
              </div>
            </dl>
            {l.carga.proximaEntrega && (
              <p className="mt-3 text-xs text-slate-500">Próxima entrega prometida: {fecha(l.carga.proximaEntrega)}</p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
