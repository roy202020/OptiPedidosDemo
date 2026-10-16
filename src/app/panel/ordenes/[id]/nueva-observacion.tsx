"use client";

import { MessageSquarePlus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { Alerta, AreaTexto, BotonEnviar } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";

export function NuevaObservacion({ accion }: { accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario> }) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.listo) formulario.current?.reset();
  }, [estado]);

  return (
    <form ref={formulario} action={enviar} className="flex flex-col gap-3" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      <AreaTexto nombre="texto" etiqueta="Nueva observación" rows={2} maxLength={1000} required errores={estado.campos?.texto} />
      <div className="flex justify-end">
        <BotonEnviar pendiente="Guardando…" variante="secundario" icono={MessageSquarePlus}>
          Agregar observación
        </BotonEnviar>
      </div>
    </form>
  );
}
