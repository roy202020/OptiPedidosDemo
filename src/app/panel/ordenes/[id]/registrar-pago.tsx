"use client";

import { Banknote } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Alerta, BotonEnviar, Campo, Selector } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { MEDIOS_COBRO } from "@/lib/ordenes/pagos";

export function RegistrarPago({
  accion,
  saldo,
  hoy,
  hayCaja,
}: {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  /** Saldo pendiente con 2 decimales, para sugerirlo como importe. */
  saldo: string;
  hoy: string;
  /** La sede tiene la caja abierta (sin caja no se cobra en efectivo). */
  hayCaja: boolean;
}) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const [medio, setMedio] = useState(estado.valores?.medio ?? (hayCaja ? "efectivo" : "yape"));
  const opciones = Object.entries(MEDIOS_COBRO).map(([valor, texto]) => ({
    valor,
    texto: valor === "efectivo" && !hayCaja ? `${texto} (caja cerrada)` : texto,
  }));
  const formulario = useRef<HTMLFormElement>(null);
  const v = estado.valores;

  useEffect(() => {
    if (estado.listo) formulario.current?.reset();
  }, [estado]);

  return (
    <form ref={formulario} action={enviar} className="flex flex-col gap-3" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      {estado.listo && estado.aviso && <Alerta tipo="exito">{estado.aviso}</Alerta>}
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
          opciones={opciones}
          required
          value={medio}
          onChange={(e) => setMedio(e.currentTarget.value)}
          errores={estado.campos?.medio}
        />
      </div>
      {medio === "efectivo" && !hayCaja && (
        <p className="text-xs text-amber-800">
          La caja de la sede está cerrada.{" "}
          <Link href="/panel/caja" className="font-medium underline">
            Ábrela
          </Link>{" "}
          para cobrar en efectivo, o elige otro medio.
        </p>
      )}
      {medio !== "efectivo" && (
        <Campo
          nombre="numero_operacion"
          etiqueta="N.º de operación"
          maxLength={60}
          autoComplete="off"
          defaultValue={v?.numero_operacion}
          errores={estado.campos?.numero_operacion}
          key={`op-${v?.numero_operacion ?? ""}`}
        />
      )}
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
        Registrar cobro
      </BotonEnviar>
    </form>
  );
}
