"use client";

import { Save, UserPlus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { Alerta, BotonEnviar, Campo, Selector } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { NOMBRE_ROL } from "@/lib/permisos";
import { ROLES } from "@/lib/validacion/administracion";
import { actualizarOptica, agregarMiembro } from "./acciones";

const OPCIONES_ROL = ROLES.map((r) => ({ valor: r, texto: NOMBRE_ROL[r] }));

export function FormularioOptica({ inicial }: { inicial: Record<string, string> }) {
  const [estado, enviar] = useActionState(actualizarOptica, {} as EstadoFormulario);
  const v = estado.valores ?? inicial;
  const e = estado.campos ?? {};
  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      {estado.listo && estado.aviso && <Alerta tipo="exito">{estado.aviso}</Alerta>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo nombre="nombre" etiqueta="Nombre comercial" required maxLength={120} defaultValue={v.nombre} errores={e.nombre} />
        <Campo nombre="ruc" etiqueta="RUC" inputMode="numeric" maxLength={11} defaultValue={v.ruc} errores={e.ruc} />
        <Campo nombre="telefono" etiqueta="Teléfono" tipo="tel" maxLength={30} defaultValue={v.telefono} errores={e.telefono} />
        <Campo nombre="direccion" etiqueta="Dirección" maxLength={200} defaultValue={v.direccion} errores={e.direccion} />
      </div>
      <div>
        <BotonEnviar pendiente="Guardando…" icono={Save}>
          Guardar datos
        </BotonEnviar>
      </div>
    </form>
  );
}

export function FormularioNuevoMiembro() {
  const [estado, enviar] = useActionState(agregarMiembro, {} as EstadoFormulario);
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.listo) formulario.current?.reset();
  }, [estado]);
  const v = estado.valores ?? {};
  return (
    <form ref={formulario} action={enviar} className="flex flex-col gap-4" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      {estado.listo && estado.aviso && <Alerta tipo="exito">{estado.aviso}</Alerta>}
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <Campo nombre="email" etiqueta="Correo de su cuenta" tipo="email" required defaultValue={v.email} errores={estado.campos?.email} />
        <Selector nombre="rol" etiqueta="Rol" opciones={OPCIONES_ROL} defaultValue={v.rol ?? "operador"} errores={estado.campos?.rol} />
      </div>
      <p className="text-xs text-slate-500">La persona debe crear antes su cuenta en OptiPedidos con ese correo.</p>
      <div>
        <BotonEnviar pendiente="Agregando…" icono={UserPlus}>
          Agregar miembro
        </BotonEnviar>
      </div>
    </form>
  );
}

/** Cambio de rol inmediato al elegir otra opción. */
export function SelectorRol({
  accion,
  rol,
  etiqueta,
}: {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  rol: string;
  etiqueta: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, {} as EstadoFormulario);
  return (
    <form action={enviar} className="flex flex-col gap-1">
      <select
        name="rol"
        aria-label={etiqueta}
        defaultValue={rol}
        disabled={pendiente}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm shadow-sm"
      >
        {OPCIONES_ROL.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      {estado.error && <span className="text-xs text-red-600">{estado.error}</span>}
    </form>
  );
}
