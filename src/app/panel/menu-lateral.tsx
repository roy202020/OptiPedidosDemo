"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownCircle, BellRing, Boxes, ClipboardList, FlaskConical, HandCoins, LayoutDashboard, LogOut, Menu, Settings, TrendingUp, Users, Wallet, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cerrarSesion } from "@/app/(acceso)/acciones";
import { Marca } from "@/components/marca";
import { Avatar } from "@/components/ui";
import { PERMISOS, type Rol } from "@/lib/permisos";

type Item = { href: string; texto: string; icono: LucideIcon; roles?: readonly Rol[] };

/** Secciones del panel. `roles` limita quién las ve (la página vuelve a comprobarlo en el servidor). */
const GRUPOS: { titulo: string; items: Item[] }[] = [
  {
    titulo: "Atención",
    items: [
      { href: "/panel", texto: "Panel", icono: LayoutDashboard },
      { href: "/panel/ordenes", texto: "Órdenes", icono: ClipboardList },
      { href: "/panel/pacientes", texto: "Pacientes", icono: Users },
      { href: "/panel/recordatorios", texto: "Recordatorios", icono: BellRing },
    ],
  },
  {
    titulo: "Operación",
    items: [
      { href: "/panel/inventario", texto: "Inventario", icono: Boxes },
      { href: "/panel/laboratorios", texto: "Laboratorios", icono: FlaskConical },
      { href: "/panel/caja", texto: "Caja", icono: Wallet },
      { href: "/panel/saldos", texto: "Saldos pendientes", icono: HandCoins },
    ],
  },
  {
    titulo: "Gestión",
    items: [
      { href: "/panel/ventas", texto: "Ventas y metas", icono: TrendingUp, roles: PERMISOS.verVentas },
      { href: "/panel/egresos", texto: "Egresos", icono: ArrowDownCircle, roles: PERMISOS.gestionarCobros },
      { href: "/panel/administracion", texto: "Administración", icono: Settings, roles: PERMISOS.administrarOptica },
    ],
  },
];

const activo = (ruta: string, href: string) => (href === "/panel" ? ruta === "/panel" : ruta === href || ruta.startsWith(`${href}/`));

type Props = { rol: Rol; nombreRol: string; optica: string; email: string; plan: string };

export function MenuLateral({ rol, nombreRol, optica, email, plan }: Props) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const grupos = GRUPOS.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(rol)) })).filter((g) => g.items.length > 0);

  // Cerrar el menú móvil con Escape.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [abierto]);

  const navegacion = (
    <nav aria-label="Principal" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-2">
      {grupos.map((g) => (
        <div key={g.titulo}>
          <p className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-marca-300/80 uppercase">{g.titulo}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map(({ href, texto, icono: Icono }) => {
              const esActivo = activo(ruta, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setAbierto(false)}
                    aria-current={esActivo ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      esActivo ? "bg-white/12 text-white" : "text-marca-100/90 hover:bg-white/6 hover:text-white"
                    }`}
                  >
                    {esActivo && <span aria-hidden className="absolute inset-y-1.5 -left-3 w-1 rounded-r-full bg-sky-300" />}
                    <Icono aria-hidden className={`size-4.5 ${esActivo ? "text-sky-200" : "text-marca-300 group-hover:text-marca-100"}`} />
                    {texto}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const pie = (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-center gap-3 rounded-lg bg-white/5 p-2.5">
        <Avatar texto={email} className="bg-marca-700 text-white" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white" title={email}>
            {email}
          </p>
          <p className="truncate text-xs text-marca-200">
            {nombreRol} · Plan {plan}
          </p>
        </div>
        <form action={cerrarSesion}>
          <button
            title="Cerrar sesión"
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-marca-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut aria-hidden className="size-4" />
            <span className="sr-only">Cerrar sesión</span>
          </button>
        </form>
      </div>
      <p className="mt-2 truncate px-1 text-[11px] text-marca-300" title={optica}>
        {optica}
      </p>
    </div>
  );

  return (
    <>
      {/* Escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-marca-900 lg:flex">
        <div className="flex h-16 items-center px-6">
          <Link href="/panel" className="rounded-lg">
            <Marca invertida />
          </Link>
        </div>
        {navegacion}
        {pie}
      </aside>

      {/* Móvil y tableta */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between bg-marca-900 px-4 lg:hidden">
        <Link href="/panel" className="rounded-lg">
          <Marca invertida />
        </Link>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-expanded={abierto}
          aria-controls="menu-movil"
          className="rounded-lg p-2 text-marca-100 hover:bg-white/10"
        >
          <Menu aria-hidden className="size-5" />
          <span className="sr-only">Abrir menú</span>
        </button>
      </div>
      {abierto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 animate-aparecer bg-marca-950/50" onClick={() => setAbierto(false)} />
          <div id="menu-movil" className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] animate-deslizar flex-col bg-marca-900 shadow-flotante">
            <div className="flex h-14 items-center justify-between px-5">
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
        <div className="flex h-16 items-center px-6">
          <Marca invertida />
        </div>
      </aside>
      <div aria-hidden className="sticky top-0 z-30 flex h-14 items-center bg-marca-900 px-4 lg:hidden">
        <Marca invertida />
      </div>
    </>
  );
}
