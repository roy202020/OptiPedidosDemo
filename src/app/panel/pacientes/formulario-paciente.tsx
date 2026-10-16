"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { Alerta, AreaTexto, BotonEnviar, Campo, Seccion, Selector } from "@/components/formulario";
import { EnlaceBoton } from "@/components/ui";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { TIPOS_DOCUMENTO } from "@/lib/validacion/paciente";

type Props = {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  inicial?: Record<string, string>;
  textoBoton: string;
  cancelar: string;
  hoy: string;
};

const NOMBRES_DOCUMENTO = { DNI: "DNI", CE: "Carné de extranjería", PASAPORTE: "Pasaporte" } as const;

export function FormularioPaciente({ accion, inicial = {}, textoBoton, cancelar, hoy }: Props) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const v = estado.valores ?? inicial;
  const e = estado.campos ?? {};

  return (
    <form action={enviar} className="flex flex-col gap-6" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}

      <Seccion titulo="Identificación" descripcion="Nombre completo y documento. El documento es opcional, pero evita duplicados.">
        <Campo nombre="nombres" etiqueta="Nombres" required maxLength={100} autoComplete="off" defaultValue={v.nombres} errores={e.nombres} />
        <Campo nombre="apellidos" etiqueta="Apellidos" required maxLength={100} autoComplete="off" defaultValue={v.apellidos} errores={e.apellidos} />
        <Selector
          nombre="tipo_documento"
          etiqueta="Tipo de documento"
          opciones={TIPOS_DOCUMENTO.map((t) => ({ valor: t, texto: NOMBRES_DOCUMENTO[t] }))}
          defaultValue={v.tipo_documento ?? "DNI"}
          errores={e.tipo_documento}
        />
        <Campo nombre="numero_documento" etiqueta="Número de documento" maxLength={20} defaultValue={v.numero_documento} errores={e.numero_documento} />
        <Campo
          nombre="fecha_nacimiento"
          etiqueta="Fecha de nacimiento"
          tipo="date"
          max={hoy}
          defaultValue={v.fecha_nacimiento}
          errores={e.fecha_nacimiento}
        />
      </Seccion>

      <Seccion titulo="Contacto" descripcion="El teléfono se usará para avisar cuando sus lentes estén listos.">
        <Campo nombre="telefono" etiqueta="Teléfono" tipo="tel" maxLength={30} placeholder="987 654 321" defaultValue={v.telefono} errores={e.telefono} />
        <Campo nombre="email" etiqueta="Correo" tipo="email" defaultValue={v.email} errores={e.email} />
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="acepta_whatsapp"
            defaultChecked={v.acepta_whatsapp === "on" || v.acepta_whatsapp === "true"}
            className="mt-0.5 size-4 accent-marca-700"
          />
          <span>
            <span className="font-medium text-slate-800">Acepta recibir avisos por WhatsApp</span>
            <span className="block text-xs text-slate-500">
              Pregúntale al paciente. Sin su autorización no se le enviará el aviso de lentes listos.
            </span>
          </span>
        </label>
        <AreaTexto nombre="notas" etiqueta="Notas" maxLength={1000} className="sm:col-span-2" defaultValue={v.notas} errores={e.notas} />
      </Seccion>

      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
        <EnlaceBoton href={cancelar}>Cancelar</EnlaceBoton>
        <BotonEnviar pendiente="Guardando…" icono={Save}>
          {textoBoton}
        </BotonEnviar>
      </div>
    </form>
  );
}
