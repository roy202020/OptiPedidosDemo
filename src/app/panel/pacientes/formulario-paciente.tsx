"use client";

import { useActionState } from "react";
import { Alerta, AreaTexto, BotonEnviar, Campo, Selector } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { TIPOS_DOCUMENTO } from "@/lib/validacion/paciente";

type Props = {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  inicial?: Record<string, string>;
  textoBoton: string;
  hoy: string;
};

export function FormularioPaciente({ accion, inicial = {}, textoBoton, hoy }: Props) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const v = estado.valores ?? inicial;
  const e = estado.campos ?? {};

  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo nombre="nombres" etiqueta="Nombres" required maxLength={100} defaultValue={v.nombres} errores={e.nombres} />
        <Campo nombre="apellidos" etiqueta="Apellidos" required maxLength={100} defaultValue={v.apellidos} errores={e.apellidos} />
        <Selector
          nombre="tipo_documento"
          etiqueta="Tipo de documento"
          opciones={TIPOS_DOCUMENTO.map((t) => ({ valor: t, texto: t === "CE" ? "Carné de extranjería" : t === "PASAPORTE" ? "Pasaporte" : t }))}
          defaultValue={v.tipo_documento ?? "DNI"}
          errores={e.tipo_documento}
        />
        <Campo
          nombre="numero_documento"
          etiqueta="Número de documento"
          ayuda="Opcional."
          maxLength={20}
          defaultValue={v.numero_documento}
          errores={e.numero_documento}
        />
        <Campo
          nombre="fecha_nacimiento"
          etiqueta="Fecha de nacimiento"
          tipo="date"
          max={hoy}
          defaultValue={v.fecha_nacimiento}
          errores={e.fecha_nacimiento}
        />
        <Campo nombre="telefono" etiqueta="Teléfono" tipo="tel" maxLength={30} defaultValue={v.telefono} errores={e.telefono} />
        <Campo nombre="email" etiqueta="Correo" tipo="email" defaultValue={v.email} errores={e.email} />
      </div>
      <AreaTexto nombre="notas" etiqueta="Notas" maxLength={1000} defaultValue={v.notas} errores={e.notas} />
      <div>
        <BotonEnviar pendiente="Guardando…">{textoBoton}</BotonEnviar>
      </div>
    </form>
  );
}
