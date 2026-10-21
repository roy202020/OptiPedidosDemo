"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { Alerta, BotonEnviar, Campo, Seccion } from "@/components/formulario";
import { EnlaceBoton } from "@/components/ui";
import type { EstadoFormulario } from "@/lib/estado-formulario";

type Props = {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  inicial?: Record<string, string>;
  textoBoton: string;
  cancelar: string;
  /** Propietario o administrador: pueden fijar los días de crédito. */
  editaCredito?: boolean;
};

export function FormularioLaboratorio({ accion, inicial = {}, textoBoton, cancelar, editaCredito = false }: Props) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const v = estado.valores ?? inicial;
  const e = estado.campos ?? {};

  return (
    <form action={enviar} className="flex flex-col gap-6" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      <Seccion titulo="Laboratorio" descripcion="Nombre con el que lo identificas en las órdenes.">
        <Campo nombre="nombre" etiqueta="Nombre" required maxLength={120} className="sm:col-span-2" defaultValue={v.nombre} errores={e.nombre} />
      </Seccion>
      <Seccion titulo="Contacto" descripcion="Para coordinar pedidos y consultar el avance de los trabajos.">
        <Campo nombre="contacto" etiqueta="Persona de contacto" maxLength={120} defaultValue={v.contacto} errores={e.contacto} />
        <Campo nombre="telefono" etiqueta="Teléfono" tipo="tel" maxLength={30} defaultValue={v.telefono} errores={e.telefono} />
        <Campo nombre="email" etiqueta="Correo" tipo="email" className="sm:col-span-2" defaultValue={v.email} errores={e.email} />
      </Seccion>
      <Seccion titulo="Crédito" descripcion="Plazo para pagar sus tickets. El vencimiento de cada ticket se calcula con este plazo.">
        {editaCredito ? (
          <Campo
            nombre="dias_credito"
            etiqueta="Días de crédito"
            tipo="number"
            min={0}
            max={365}
            inputMode="numeric"
            ayuda="0 = contado (vence el mismo día). Ej.: 2, 7 (semanal), 15, 30."
            defaultValue={v.dias_credito ?? "0"}
            errores={e.dias_credito}
          />
        ) : (
          <p className="text-sm text-slate-600 sm:col-span-2">
            {v.dias_credito && v.dias_credito !== "0" ? `${v.dias_credito} días de crédito.` : "Contado."} Solo el propietario o un administrador lo cambian.
          </p>
        )}
      </Seccion>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
        <EnlaceBoton href={cancelar}>Cancelar</EnlaceBoton>
        <BotonEnviar pendiente="Guardando…" icono={Save}>
          {textoBoton}
        </BotonEnviar>
      </div>
    </form>
  );
}
