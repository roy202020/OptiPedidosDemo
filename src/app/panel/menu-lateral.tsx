"use client";

import type { LucideIcon } from "lucide-react";
import { BellRing, Boxes, ClipboardList, FlaskConical, LayoutDashboard, LogOut, Menu, Settings, TrendingUp, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cerrarSesion } from "@/app/(acceso)/acciones";
import { Marca } from "@/components/marca";
import { PERMISOS, type Rol } from "@/lib/permisos";

type Item = { href: string; texto: string; icono: LucideIcon; roles?: readonly Rol[] };

/** Secciones del panel. `roles` limita quién las ve (la página vuelve a comprobarlo en el servidor). */
const ITEMS: Item[] = [
  { href: "/panel", texto: "Panel", icono: LayoutDashboard },
  { href: "/panel/ordenes", texto: "Órdenes", icono: ClipboardList },
  { href: "/panel/pacientes", texto: "Pacientes", icono: Users },
  { href: "/panel/recordatorios", texto: "Recordatorios", icono: BellRing },
  { href: "/panel/inventario", texto: "Inventario", icono: Boxes },
  { href: "/panel/laboratorios", texto: "Laboratorios", icono: FlaskConical },
  { href: "/panel/ventas", texto: "Ventas y metas", icono: TrendingUp, roles: PERMISOS.verVentas },
  { href: "/panel/administracion", texto: "Administración", icono: Settings, roles: PERMISOS.administrarOptica },
];

const activo = (ruta: string, href: string) => (href === "/panel" ? ruta === "/panel" : ruta === href || ruta.startsWith(`${href}/`));

type Props = { rol: Rol; nombreRol: string; optica: string; email: string };

export function MenuLateral({ rol, nombreRol, optica, email }: Props) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const items = ITEMS.filter((i) => !i.roles || i.roles.includes(rol));

  // Cerrar el menú móvil con Escape.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [abierto]);

  const navegacion = (
    <nav aria-label="Principal" className="flex flex-1 flex-col gap-1 px-3">
      {items.map(({ href, texto, icono: Icono }) => {
        const esActivo = activo(ruta, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setAbierto(false)}
            aria-current={esActivo ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              esActivo ? "bg-white/10 text-white" : "text-marca-100 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icono aria-hidden className="size-4.5" />
            {texto}
          </Link>
        );
      })}
    </nav>
  );

  const pie = (
    <div className="border-t border-white/10 p-3">
      <div className="mb-2 px-3">
        <p className="truncate text-sm font-medium text-white">{optica}</p>
        <p className="truncate text-xs text-marca-200">
          {email} · {nombreRol}
        </p>
      </div>
      <form action={cerrarSesion}>
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-marca-100 hover:bg-white/5 hover:text-white">
          <LogOut aria-hidden className="size-4.5" />
          Cerrar sesión
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-marca-900 lg:flex">
        <div className="px-6 py-5">
          <Link href="/panel">
            <Marca invertida />
          </Link>
        </div>
        {navegacion}
        {pie}
      </aside>

      {/* Móvil y tableta */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <Link href="/panel">
          <Marca />
        </Link>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-expanded={abierto}
          aria-controls="menu-movil"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <Menu aria-hidden className="size-5" />
          <span className="sr-only">Abrir menú</span>
        </button>
      </div>
      {abierto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-marca-950/50" onClick={() => setAbierto(false)} />
          <div id="menu-movil" className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-marca-900 shadow-flotante">
            <div className="flex items-center justify-between px-5 py-4">
              <Marca invertida />
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="rounded-lg p-2 text-marca-100 hover:bg-white/10"
                autoFocus
              >
                <X aria-hidden className="size-5" />
                <span className="sr-only">Cerrar menú</span>
              </button>
            </div>
            {navegacion}
            {pie}
          </div>
        </div>
      )}
    </>
  );
}

/** Versión sin datos para el primer pintado (mientras se lee la sesión). */
export function MenuLateralEsqueleto() {
  return (
    <>
      <aside aria-hidden className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-marca-900 lg:flex">
        <div className="px-6 py-5">
          <Marca invertida />
        </div>
      </aside>
      <div aria-hidden className="sticky top-0 z-30 flex h-14 items-center border-b border-slate-200 bg-white px-4 lg:hidden">
        <Marca />
      </div>
    </>
  );
}
