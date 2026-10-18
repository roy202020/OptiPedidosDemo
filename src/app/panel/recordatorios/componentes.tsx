"use client";

import { Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Alerta, BotonEnviar, Campo } from "@/components/formulario";
import { claseBoton } from "@/components/ui";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { guardarConfiguracion, registrarEnvioManual } from "./acciones";

/**
 * Abre WhatsApp con el recordatorio escrito y, a la vez, registra el envío manual
 * (el enlace se abre en el mismo clic para que el navegador no lo bloquee).
 */
export function BotonWhatsAppRecordatorio({ pacienteId, url }: { pacienteId: string; url: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await registrarEnvioManual(pacienteId);
            setError(r.error);
            router.refresh();
          })
        }
        className={claseBoton("secundario", "sm")}
      >
        <Send aria-hidden className="size-4" />
        WhatsApp
      </a>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function FormularioConfiguracion({
  meses,
  automaticos,
  puedeActivar,
  esProfesional,
}: {
  meses: number;
  automaticos: boolean;
  puedeActivar: boolean;
  esProfesional: boolean;
}) {
  const [estado, enviar] = useActionState(guardarConfiguracion, {} as EstadoFormulario);
  const v = estado.valores ?? { recordatorio_meses: String(meses), recordatorios_automaticos: automaticos ? "on" : "" };
  const bloqueado = !puedeActivar || !esProfesional;

  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      {estado.listo && estado.aviso && <Alerta tipo="exito">{estado.aviso}</Alerta>}
      <Campo
        nombre="recordatorio_meses"
        etiqueta="Recordar a los (meses)"
        inputMode="numeric"
        ayuda="Desde la fecha de la última evaluación. Por defecto, 12."
        defaultValue={v.recordatorio_meses}
        errores={estado.campos?.recordatorio_meses}
      />
      <label className={`flex items-start gap-3 text-sm ${bloqueado ? "opacity-60" : ""}`}>
        <input
          type="checkbox"
          name="recordatorios_automaticos"
          defaultChecked={v.recordatorios_automaticos === "on"}
          disabled={bloqueado}
          className="mt-0.5 size-4 accent-marca-700"
        />
        {/* Si está deshabilitado, se conserva el valor actual. */}
        {bloqueado && automaticos && <input type="hidden" name="recordatorios_automaticos" value="on" />}
        <span>
          <span className="font-medium text-slate-800">Envío automático diario</span>
          <span className="block text-xs text-slate-500">
            {!esProfesional
              ? "Disponible en plan Profesional."
              : !puedeActivar
                ? "Solo el propietario lo activa o desactiva."
                : "A las 10:00 (hora de Lima), desde el número de cada sede, respetando el tope del mes."}
          </span>
        </span>
      </label>
      <div>
        <BotonEnviar pendiente="Guardando…" variante="secundario" icono={Save}>
          Guardar
        </BotonEnviar>
      </div>
    </form>
  );
}
