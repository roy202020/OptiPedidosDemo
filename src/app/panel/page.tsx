import type { Metadata } from "next";
import { Suspense } from "react";
import { exigirOptica } from "@/lib/sesion";

export const metadata: Metadata = { title: "Panel" };

const ROLES = { propietario: "Propietario", administrador: "Administrador", operador: "Operador" } as const;

const MODULOS = [
  { titulo: "Órdenes de trabajo", texto: "Crea pedidos al laboratorio y sigue su estado hasta la entrega." },
  { titulo: "Pacientes", texto: "Registra pacientes y sus recetas." },
  { titulo: "Laboratorios", texto: "Administra los laboratorios con los que trabajas." },
];

export default function PaginaPanel() {
  return (
    <>
      <Suspense fallback={<div className="mb-8 h-14 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />}>
        <Bienvenida />
      </Suspense>
      <div className="grid gap-4 sm:grid-cols-3">
        {MODULOS.map((m) => (
          <section key={m.titulo} className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="font-medium">{m.titulo}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{m.texto}</p>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-zinc-400">Próximamente</p>
          </section>
        ))}
      </div>
    </>
  );
}

async function Bienvenida() {
  const optica = await exigirOptica();
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight">{optica.nombre}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Tu rol: {ROLES[optica.rol]}</p>
    </div>
  );
}
