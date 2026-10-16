"use client";

import { useActionState } from "react";
import { Alerta, BotonEnviar, Campo } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { registrarse } from "../acciones";

export function FormularioRegistro() {
  const [estado, accion] = useActionState(registrarse, {} as EstadoFormulario);

  if (estado.aviso) return <Alerta tipo="aviso">{estado.aviso}</Alerta>;

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
        autoComplete="new-password"
        minLength={8}
        required
        ayuda="Mínimo 8 caracteres."
        errores={estado.campos?.password}
      />
      <Campo
        nombre="confirmacion"
        etiqueta="Repite la contraseña"
        tipo="password"
        autoComplete="new-password"
        required
        errores={estado.campos?.confirmacion}
      />
      <BotonEnviar pendiente="Creando cuenta…">Crear cuenta</BotonEnviar>
    </form>
  );
}
