import { Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Alerta, FijarSoloLectura, ProveedorSoloLectura } from "@/components/formulario";
import { EnlaceBoton } from "@/components/ui";
import { obtenerSuscripcion } from "@/lib/datos/suscripcion";
import { NOMBRE_ROL, tienePermiso } from "@/lib/permisos";
import { exigirOptica, obtenerSedeActual, obtenerUsuario, TODAS_LAS_SEDES } from "@/lib/sesion";
import { avisoSuscripcion } from "@/lib/suscripcion";
import { hoyLimaISO } from "@/lib/validacion/comun";
import { MenuLateral, MenuLateralEsqueleto } from "./menu-lateral";
import { SelectorSede } from "./selector-sede";

export default function LayoutPanel({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorSoloLectura>
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
        <div className="border-b border-slate-200 bg-white/90 backdrop-blur lg:sticky lg:top-0 lg:z-20">
          <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
            <Suspense fallback={<span className="h-9" />}>
              <BarraSuperior />
            </Suspense>
          </div>
        </div>
        <main id="contenido" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={null}>
            <AvisoSuscripcion />
          </Suspense>
          {children}
        </main>
      </div>
    </ProveedorSoloLectura>
  );
}

async function Menu() {
  const [usuario, optica, suscripcion] = await Promise.all([obtenerUsuario(), exigirOptica(), obtenerSuscripcion()]);
  return (
    <MenuLateral
      rol={optica.rol}
      nombreRol={NOMBRE_ROL[optica.rol]}
      optica={optica.nombre}
      email={usuario.email}
      plan={suscripcion.nombrePlan}
    />
  );
}

/** Nombre de la óptica, selector de sede (solo las sedes del usuario, por RLS) y acciones rápidas. */
async function BarraSuperior() {
  const [optica, { sedes, actual }] = await Promise.all([exigirOptica(), obtenerSedeActual()]);
  return (
    <>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 truncate text-base font-semibold text-slate-900" title={optica.nombre}>
          {optica.nombre}
        </p>
        <span aria-hidden className="hidden h-5 w-px bg-slate-200 sm:block" />
        <SelectorSede
          sedes={sedes.map(({ id, nombre, activa }) => ({ id, nombre, activa }))}
          actual={actual?.id ?? TODAS_LAS_SEDES}
          todas={TODAS_LAS_SEDES}
        />
      </div>
      <div className="flex items-center gap-2">
        <EnlaceBoton href="/panel/pacientes/nuevo" icono={UserPlus} className="max-sm:px-2.5">
          <span className="max-sm:sr-only">Nuevo paciente</span>
        </EnlaceBoton>
        <EnlaceBoton href="/panel/ordenes/nueva" variante="primario" icono={Plus}>
          Nueva orden
        </EnlaceBoton>
      </div>
    </>
  );
}

/** Aviso de vencimiento (5 días antes, gracia y solo lectura) y bloqueo visual de los botones de guardar. */
async function AvisoSuscripcion() {
  const [optica, suscripcion] = await Promise.all([exigirOptica(), obtenerSuscripcion()]);
  const aviso = avisoSuscripcion(suscripcion.vence_el, hoyLimaISO());
  return (
    <>
      <FijarSoloLectura activo={suscripcion.soloLectura} />
      {aviso && (
        <div className="mb-6">
          <Alerta tipo={aviso.tipo}>
            <p className="font-medium">{aviso.titulo}</p>
            <p>
              {aviso.texto}{" "}
              {tienePermiso(optica.rol, "administrarOptica") && (
                <Link href="/panel/administracion#suscripcion" className="font-medium underline">
                  Ver mi plan
                </Link>
              )}
            </p>
          </Alerta>
        </div>
      )}
    </>
  );
}
