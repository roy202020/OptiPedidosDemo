import Link from "next/link";
import { Suspense } from "react";
import { cerrarSesion } from "@/app/(acceso)/acciones";
import { exigirOptica, obtenerUsuario } from "@/lib/sesion";

// Cada módulo nuevo (órdenes, pacientes, laboratorios) agrega aquí su enlace.
const SECCIONES = [{ href: "/panel", texto: "Inicio" }];

export default function LayoutPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/panel" className="font-semibold tracking-tight text-sky-800 dark:text-sky-400">
            OptiPedidos
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            {SECCIONES.map((s) => (
              <Link key={s.href} href={s.href} className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white">
                {s.texto}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Suspense fallback={<span className="text-zinc-400">…</span>}>
              <Identidad />
            </Suspense>
            <form action={cerrarSesion}>
              <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

async function Identidad() {
  const [usuario, optica] = await Promise.all([obtenerUsuario(), exigirOptica()]);
  return (
    <span className="text-right leading-tight">
      <span className="block font-medium text-zinc-900 dark:text-zinc-100">{optica.nombre}</span>
      <span className="block text-xs text-zinc-500">{usuario.email}</span>
    </span>
  );
}
