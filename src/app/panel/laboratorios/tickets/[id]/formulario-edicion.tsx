"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { CampoFoto } from "@/components/campo-foto";
import { AreaTexto, Alerta, BotonEnviar, Campo } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";

/** Vencimiento, total, observaciones y foto del ticket (propietario y administrador). */
export function FormularioEdicionTicket({
  accion,
  inicial,
}: {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  inicial: { fecha: string; fecha_vencimiento: string; monto_total: string; observaciones: string };
}) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const v: Record<string, string> = estado.valores ?? inicial;
  const e = estado.campos ?? {};
  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      {estado.listo && estado.aviso && <Alerta tipo="exito">{estado.aviso}</Alerta>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          nombre="fecha_vencimiento"
          etiqueta="Vence el"
          tipo="date"
          min={inicial.fecha}
          required
          defaultValue={v.fecha_vencimiento}
          errores={e.fecha_vencimiento}
        />
        <Campo nombre="monto_total" etiqueta="Monto total (S/)" inputMode="decimal" required defaultValue={v.monto_total} errores={e.monto_total} />
      </div>
      <AreaTexto nombre="observaciones" etiqueta="Observaciones" maxLength={500} rows={2} defaultValue={v.observaciones} errores={e.observaciones} />
      <CampoFoto etiqueta="Reemplazar la foto (la anterior se conserva)" />
      <div>
        <BotonEnviar pendiente="Guardando…" icono={Save} variante="secundario">
          Guardar cambios
        </BotonEnviar>
      </div>
    </form>
  );
}
