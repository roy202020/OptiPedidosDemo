"use client";

import { useActionState } from "react";
import { Alerta, BotonEnviar, Campo } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { ingresar } from "../acciones";

export function FormularioIngreso() {
  const [estado, accion] = useActionState(ingresar, {} as EstadoFormulario);

  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      <Campo
        nombre="email"
        etiqueta="Correo"
        tipo="email"
        autoComplete="email"
        required
        defaultValue={estado.valores?.email}
        errores={estado.campos?.email}
      />
      <Campo
        nombre="password"
        etiqueta="Contraseña"
        tipo="password"
        autoComplete="current-password"
        required
        errores={estado.campos?.password}
      />
      <BotonEnviar pendiente="Ingresando…">Ingresar</BotonEnviar>
    </form>
  );
}
