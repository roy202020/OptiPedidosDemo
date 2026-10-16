"use client";

import { Plus, Save } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { Alerta, BotonEnviar, Campo } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";

type Accion = (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;

/** Alta o edición de una sede (nombre, contacto y número de WhatsApp). */
export function FormularioSede({ accion, inicial, nueva }: { accion: Accion; inicial?: Record<string, string>; nueva?: boolean }) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (nueva && estado.listo) formulario.current?.reset();
  }, [estado, nueva]);
  const v = estado.valores ?? inicial ?? {};
  const e = estado.campos ?? {};
  const id = (campo: string) => `${campo}-${inicial?.id ?? "nueva"}`;

  return (
    <form ref={formulario} action={enviar} className="flex flex-col gap-4" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      {estado.listo && estado.aviso && <Alerta tipo="exito">{estado.aviso}</Alerta>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id={id("nombre")} nombre="nombre" etiqueta="Nombre" required maxLength={80} placeholder="Centro" defaultValue={v.nombre} errores={e.nombre} />
        <Campo id={id("telefono")} nombre="telefono" etiqueta="Teléfono" tipo="tel" maxLength={30} defaultValue={v.telefono} errores={e.telefono} />
        <Campo id={id("direccion")} nombre="direccion" etiqueta="Dirección" maxLength={200} defaultValue={v.direccion} errores={e.direccion} className="sm:col-span-2" />
        <Campo
          id={id("whatsapp")}
          nombre="whatsapp_phone_number_id"
          etiqueta="Id del número de WhatsApp (Meta)"
          inputMode="numeric"
          maxLength={30}
          defaultValue={v.whatsapp_phone_number_id}
          errores={e.whatsapp_phone_number_id}
          ayuda="Opcional. Desde este número se avisa a los pacientes que recogen en esta sede; si lo dejas vacío se usa el número general."
          className="sm:col-span-2"
        />
      </div>
      <div>
        <BotonEnviar pendiente="Guardando…" icono={nueva ? Plus : Save} variante={nueva ? "primario" : "secundario"}>
          {nueva ? "Crear sede" : "Guardar sede"}
        </BotonEnviar>
      </div>
    </form>
  );
}

/** Casillas de sedes de un usuario. */
export function AsignacionSedes({
  accion,
  sedes,
  asignadas,
  usuario,
}: {
  accion: Accion;
  sedes: { id: string; nombre: string; activa: boolean }[];
  asignadas: string[];
  usuario: string;
}) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <fieldset>
        <legend className="sr-only">Sedes de {usuario}</legend>
        <div className="flex flex-wrap gap-2">
          {sedes.map((s) => (
            <label
              key={s.id}
              className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm has-checked:border-marca-300 has-checked:bg-marca-50"
            >
              <input type="checkbox" name="sede" value={s.id} defaultChecked={asignadas.includes(s.id)} className="size-4 accent-marca-600" />
              {s.nombre}
              {!s.activa && <span className="text-xs text-slate-500">(desactivada)</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <BotonEnviar pendiente="Guardando…" variante="secundario" icono={Save}>
          Guardar sedes
        </BotonEnviar>
        {estado.error && <span className="text-sm text-red-600">{estado.error}</span>}
        {estado.listo && estado.aviso && <span className="text-sm text-emerald-700">{estado.aviso}</span>}
      </div>
    </form>
  );
}
