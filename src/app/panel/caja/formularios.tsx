"use client";

import { LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { useActionState, useState } from "react";
import { AreaTexto, Alerta, BotonEnviar, Campo } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { soles } from "@/lib/formato";
import { leerImporte } from "@/lib/validacion/orden";
import { abrirCaja } from "./acciones";

export function FormularioApertura() {
  const [estado, enviar] = useActionState(abrirCaja, {} as EstadoFormulario);
  return (
    <form action={enviar} className="flex flex-col gap-4 sm:max-w-sm" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      <Campo
        nombre="monto_inicial"
        etiqueta="Efectivo inicial (S/)"
        inputMode="decimal"
        placeholder="0.00"
        required
        defaultValue={estado.valores?.monto_inicial}
        errores={estado.campos?.monto_inicial}
        ayuda="Lo que hay en la caja al empezar (sencillo)."
      />
      <div>
        <BotonEnviar pendiente="Abriendo…" icono={LockKeyholeOpen}>
          Abrir caja
        </BotonEnviar>
      </div>
    </form>
  );
}

export function FormularioCierre({
  accion,
  esperado,
}: {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  esperado: number;
}) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const [contado, setContado] = useState(estado.valores?.monto_contado ?? "");
  const n = leerImporte(contado);
  const diferencia = contado.trim() !== "" && Number.isFinite(n) ? Math.round((n - esperado) * 100) / 100 : null;
  return (
    <form action={enviar} className="flex flex-col gap-4 sm:max-w-md" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      <Campo
        nombre="monto_contado"
        etiqueta="Efectivo contado (S/)"
        inputMode="decimal"
        required
        value={contado}
        onChange={(e) => setContado(e.currentTarget.value)}
        errores={estado.campos?.monto_contado}
      />
      {diferencia !== null && (
        <p className={`text-sm ${diferencia === 0 ? "text-emerald-700" : "text-amber-800"}`}>
          {diferencia === 0 ? "Cuadra con lo esperado." : `${diferencia > 0 ? "Sobran" : "Faltan"} ${soles(Math.abs(diferencia))} respecto de lo esperado.`}
        </p>
      )}
      <AreaTexto nombre="observaciones" etiqueta="Observaciones" maxLength={300} rows={2} defaultValue={estado.valores?.observaciones} />
      <div>
        <BotonEnviar pendiente="Cerrando…" icono={LockKeyhole} variante="secundario">
          Cerrar caja
        </BotonEnviar>
      </div>
    </form>
  );
}
