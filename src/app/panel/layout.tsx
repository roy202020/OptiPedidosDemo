import { Suspense } from "react";
import { NOMBRE_ROL } from "@/lib/permisos";
import { exigirOptica, obtenerSedeActual, obtenerUsuario, TODAS_LAS_SEDES } from "@/lib/sesion";
import { MenuLateral, MenuLateralEsqueleto } from "./menu-lateral";
import { SelectorSede } from "./selector-sede";

export default function LayoutPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-lg bg-white px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>
      <Suspense fallback={<MenuLateralEsqueleto />}>
        <Menu />
      </Suspense>
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-12 w-full max-w-7xl items-center px-4 py-2 sm:px-6 lg:px-8">
          <Suspense fallback={<span className="h-9" />}>
            <BarraSede />
          </Suspense>
        </div>
      </div>
      <main id="contenido" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}

async function Menu() {
  const [usuario, optica] = await Promise.all([obtenerUsuario(), exigirOptica()]);
  return <MenuLateral rol={optica.rol} nombreRol={NOMBRE_ROL[optica.rol]} optica={optica.nombre} email={usuario.email} />;
}

/** Selector de sede: solo las sedes del usuario (RLS). */
async function BarraSede() {
  const { sedes, actual } = await obtenerSedeActual();
  return (
    <SelectorSede
      sedes={sedes.map(({ id, nombre, activa }) => ({ id, nombre, activa }))}
      actual={actual?.id ?? TODAS_LAS_SEDES}
      todas={TODAS_LAS_SEDES}
    />
  );
}
