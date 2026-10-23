import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { cerrarSesion } from "@/app/(acceso)/acciones";
import { claseBoton } from "@/components/ui";
import { Marca } from "@/components/marca";
import { exigirSuperadmin } from "@/lib/sesion";

export const metadata: Metadata = { title: { template: "%s · Plataforma", default: "Plataforma" } };

export default function LayoutSuperadmin({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 bg-marca-900 text-white shadow-sm">
        <div className="mx-auto flex min-h-14 w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <Link href="/superadmin" className="flex items-center gap-3">
            <Marca invertida />
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-marca-100">Plataforma</span>
          </Link>
          <Suspense fallback={null}>
            <Usuario />
          </Suspense>
        </div>
      </header>
      <main id="contenido" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}

async function Usuario() {
  const usuario = await exigirSuperadmin();
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden truncate text-marca-100 sm:inline">{usuario.email}</span>
      <form action={cerrarSesion}>
        <button className={claseBoton("invertido")}>
          <LogOut aria-hidden className="size-4" />
          Salir
        </button>
      </form>
    </div>
  );
}
