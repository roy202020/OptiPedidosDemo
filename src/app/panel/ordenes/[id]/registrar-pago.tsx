"use client";

import { Banknote } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { Alerta, BotonEnviar, Campo, Selector } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { MEDIOS_PAGO } from "@/lib/ordenes/pagos";

const OPCIONES_MEDIO = Object.entries(MEDIOS_PAGO).map(([valor, texto]) => ({ valor, texto }));

export function RegistrarPago({
  accion,
  saldo,
  hoy,
}: {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  /** Saldo pendiente con 2 decimales, para sugerirlo como importe. */
  saldo: string;
  hoy: string;
}) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const formulario = useRef<HTMLFormElement>(null);
  const v = estado.valores;

  useEffect(() => {
    if (estado.listo) formulario.current?.reset();
  }, [estado]);

  return (
    <form ref={formulario} action={enviar} className="flex flex-col gap-3" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      <div className="grid grid-cols-2 gap-3">
        <Campo
          nombre="importe"
          etiqueta="Importe (S/)"
          inputMode="decimal"
          autoComplete="off"
          placeholder={saldo}
          required
          defaultValue={v?.importe}
          errores={estado.campos?.importe}
          key={`importe-${v?.importe ?? ""}`}
        />
        <Selector
          nombre="medio"
          etiqueta="Medio"
          opciones={OPCIONES_MEDIO}
          required
          defaultValue={v?.medio ?? "efectivo"}
          errores={estado.campos?.medio}
          key={`medio-${v?.medio ?? ""}`}
        />
      </div>
      <Campo
        nombre="fecha"
        etiqueta="Fecha del pago"
        tipo="date"
        max={hoy}
        required
        defaultValue={v?.fecha ?? hoy}
        errores={estado.campos?.fecha}
        key={`fecha-${v?.fecha ?? ""}`}
      />
      <BotonEnviar pendiente="Registrando…" variante="secundario" icono={Banknote}>
        Registrar pago
      </BotonEnviar>
    </form>
  );
}
