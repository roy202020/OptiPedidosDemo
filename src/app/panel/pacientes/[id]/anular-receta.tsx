"use client";

import { useActionState, useState } from "react";
import { Alerta, BotonEnviar, Campo } from "@/components/formulario";
import { Boton } from "@/components/ui";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { anularReceta } from "../acciones";

export function AnularReceta({ recetaId, pacienteId }: { recetaId: string; pacienteId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar] = useActionState(anularReceta.bind(null, recetaId, pacienteId), {} as EstadoFormulario);

  if (!abierto) {
    return (
      <Boton type="button" onClick={() => setAbierto(true)}>
        Anular
      </Boton>
    );
  }

  return (
    <form action={enviar} className="flex w-full max-w-md flex-col gap-3 rounded-md border border-red-200 p-3 dark:border-red-900" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      <Campo
        nombre="motivo"
        etiqueta="Motivo de la anulación"
        required
        maxLength={300}
        autoFocus
        defaultValue={estado.valores?.motivo}
        errores={estado.campos?.motivo}
      />
      <p className="text-xs text-zinc-500">La receta seguirá visible en el historial, marcada como anulada.</p>
      <div className="flex gap-2">
        <BotonEnviar pendiente="Anulando…">Confirmar anulación</BotonEnviar>
        <Boton type="button" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
