"use client";

import { useActionState } from "react";
import { Alerta, BotonEnviar, Campo } from "@/components/formulario";
import type { EstadoFormulario } from "@/app/(acceso)/acciones";
import { crearOptica } from "./acciones";

export function FormularioOptica() {
  const [estado, accion] = useActionState(crearOptica, {} as EstadoFormulario);

  return (
    <form action={accion} className="flex flex-col gap-4" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      <Campo
        nombre="nombre"
        etiqueta="Nombre de la óptica"
        autoComplete="organization"
        required
        maxLength={120}
        placeholder="Óptica Visión Clara"
        defaultValue={estado.valores?.nombre}
        errores={estado.campos?.nombre}
      />
      <BotonEnviar pendiente="Registrando…">Registrar óptica</BotonEnviar>
    </form>
  );
}
