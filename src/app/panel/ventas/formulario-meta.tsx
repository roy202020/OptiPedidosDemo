"use client";

import { Target } from "lucide-react";
import { useActionState } from "react";
import { Alerta, BotonEnviar, Campo } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { guardarMeta } from "./acciones";

/** Meta de una sede (`sede` es la sede mostrada; la base valida el acceso). */
export function FormularioMeta({ mesActual, metaActual, sede }: { mesActual: string; metaActual: string; sede: string }) {
  const [estado, enviar] = useActionState(guardarMeta, {} as EstadoFormulario);
  const v = estado.valores ?? { periodo: mesActual, importe_objetivo: metaActual };

  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="sede_id" value={sede} />
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      {estado.listo && estado.aviso && <Alerta tipo="exito">{estado.aviso}</Alerta>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo nombre="periodo" etiqueta="Mes" tipo="month" min={mesActual} required defaultValue={v.periodo} errores={estado.campos?.periodo} />
        <Campo
          nombre="importe_objetivo"
          etiqueta="Meta de ventas netas (S/)"
          inputMode="decimal"
          required
          placeholder="0.00"
          defaultValue={v.importe_objetivo}
          errores={estado.campos?.importe_objetivo}
        />
      </div>
      <p className="text-xs text-slate-500">Si el mes ya tiene meta, se actualiza. Las metas de meses cerrados se conservan sin cambios.</p>
      <div>
        <BotonEnviar pendiente="Guardando…" icono={Target}>
          Guardar meta
        </BotonEnviar>
      </div>
    </form>
  );
}
