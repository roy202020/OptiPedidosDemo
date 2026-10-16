import { Suspense } from "react";
import { NOMBRE_ROL } from "@/lib/permisos";
import { exigirOptica, obtenerUsuario } from "@/lib/sesion";
import { MenuLateral, MenuLateralEsqueleto } from "./menu-lateral";

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
