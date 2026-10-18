import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Marca } from "@/components/marca";
import { Cargando } from "@/components/ui";
import { esSuperadmin, obtenerOpticaActual } from "@/lib/sesion";
import { FormularioOptica } from "./formulario-optica";

export const metadata: Metadata = { title: "Registrar óptica" };

export default function PaginaNuevaOptica() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Marca className="mb-8" />
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-tarjeta sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Registra tu óptica</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          Quedarás como propietario. RUC, teléfono y dirección se completan después en Administración.
        </p>
        <Suspense fallback={<Cargando alto="h-24" />}>
          <SoloSinOptica />
        </Suspense>
        <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">
          ¿Trabajas en una óptica que ya usa OptiPedidos? No registres otra: pide al propietario que te agregue con el
          correo de tu cuenta desde Administración y vuelve a ingresar.
        </p>
      </div>
    </main>
  );
}

async function SoloSinOptica() {
  if (await obtenerOpticaActual()) redirect("/panel");
  // El superadmin de la plataforma no registra ópticas propias: va a su panel.
  if (await esSuperadmin()) redirect("/superadmin");
  return <FormularioOptica />;
}
