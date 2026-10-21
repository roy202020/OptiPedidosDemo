"use client";

import { ArrowDownCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { CampoFoto } from "@/components/campo-foto";
import { Alerta, BotonEnviar, Campo, Selector } from "@/components/formulario";
import { CATEGORIAS_EGRESO, MEDIOS_EGRESO } from "@/lib/egresos";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { registrarEgreso } from "./acciones";

const OPCIONES_CATEGORIA = Object.entries(CATEGORIAS_EGRESO).map(([valor, texto]) => ({ valor, texto }));

export function FormularioEgreso({ hoy, hayCaja, sede }: { hoy: string; hayCaja: boolean; sede: string }) {
  const [estado, enviar] = useActionState(registrarEgreso, {} as EstadoFormulario);
  const formulario = useRef<HTMLFormElement>(null);
  const [medio, setMedio] = useState(estado.valores?.medio ?? (hayCaja ? "efectivo_caja" : "transferencia"));
  const v = estado.listo ? {} : (estado.valores ?? {});
  const e = estado.campos ?? {};

  useEffect(() => {
    if (estado.listo) formulario.current?.reset(); // también limpia la foto elegida
  }, [estado]);

  const opcionesMedio = Object.entries(MEDIOS_EGRESO).map(([valor, texto]) => ({
    valor,
    texto: valor === "efectivo_caja" && !hayCaja ? `${texto} (caja cerrada)` : texto,
  }));

  return (
    <form ref={formulario} action={enviar} className="flex flex-col gap-4" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      {estado.listo && estado.aviso && <Alerta tipo="exito">{estado.aviso}</Alerta>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Selector nombre="categoria" etiqueta="Categoría" opciones={OPCIONES_CATEGORIA} defaultValue={v.categoria ?? "servicios"} errores={e.categoria} />
        <Campo
          nombre="concepto"
          etiqueta="Concepto"
          required
          maxLength={300}
          placeholder="Luz de octubre"
          defaultValue={v.concepto}
          errores={e.concepto}
          className="lg:col-span-2"
        />
        <Campo nombre="monto" etiqueta="Monto (S/)" inputMode="decimal" required autoComplete="off" defaultValue={v.monto} errores={e.monto} />
        <Campo nombre="fecha" etiqueta="Fecha" tipo="date" required max={hoy} defaultValue={v.fecha ?? hoy} errores={e.fecha} />
        <Selector nombre="medio" etiqueta="Cómo se pagó" opciones={opcionesMedio} value={medio} onChange={(ev) => setMedio(ev.currentTarget.value)} errores={e.medio} />
        <Campo
          nombre="numero_comprobante"
          etiqueta="N.º de recibo u operación"
          maxLength={60}
          autoComplete="off"
          defaultValue={v.numero_comprobante}
          errores={e.numero_comprobante}
        />
        <div className="sm:col-span-2">
          <CampoFoto etiqueta="Foto del recibo" ayuda="Recibo de luz, voucher, captura de Yape… Solo la ven propietario y administradores." />
        </div>
      </div>
      {medio === "efectivo_caja" && !hayCaja && (
        <p className="text-xs text-amber-800">
          La caja de la sede está cerrada.{" "}
          <Link href="/panel/caja" className="font-medium underline">
            Ábrela
          </Link>{" "}
          para pagar con efectivo de caja, o elige otro medio.
        </p>
      )}
      <p className="text-xs text-slate-500">
        Se registra en la sede {sede}. {medio === "efectivo_caja" ? "Sale de la caja abierta y se descuenta al cerrarla." : "No toca la caja."}
      </p>
      <div>
        <BotonEnviar pendiente="Registrando…" icono={ArrowDownCircle}>
          Registrar egreso
        </BotonEnviar>
      </div>
    </form>
  );
}
