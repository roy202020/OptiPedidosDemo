import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { obtenerOpticaActual } from "@/lib/sesion";
import { FormularioOptica } from "./formulario-optica";

export const metadata: Metadata = { title: "Registrar óptica" };

export default function PaginaNuevaOptica() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-1 text-lg font-semibold">Registra tu óptica</h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Quedarás como propietario. RUC, teléfono y dirección se completan después.
        </p>
        <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
          <SoloSinOptica />
        </Suspense>
      </div>
    </main>
  );
}

async function SoloSinOptica() {
  if (await obtenerOpticaActual()) redirect("/panel");
  return <FormularioOptica />;
}
