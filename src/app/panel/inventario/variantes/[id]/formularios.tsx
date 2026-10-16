"use client";

import { ArrowLeftRight, Save } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Alerta, BotonEnviar, Campo, Selector } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";

type Accion = (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;

export function FormularioVariante({ accion, inicial }: { accion: Accion; inicial: Record<string, string> }) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const v = estado.valores ?? inicial;
  return (
    <form action={enviar} className="flex flex-col gap-3" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      {estado.listo && estado.aviso && <Alerta tipo="exito">{estado.aviso}</Alerta>}
      <Campo nombre="stock_minimo" etiqueta="Mínimo (lunas)" inputMode="numeric" ayuda="Alerta de reposición al llegar a este disponible." defaultValue={v.stock_minimo} errores={estado.campos?.stock_minimo} />
      <Campo nombre="ubicacion" etiqueta="Ubicación" maxLength={60} placeholder="Cajón A3" defaultValue={v.ubicacion} errores={estado.campos?.ubicacion} />
      <div>
        <BotonEnviar pendiente="Guardando…" variante="secundario" icono={Save}>
          Guardar
        </BotonEnviar>
      </div>
    </form>
  );
}

const TEXTOS = {
  venta: { etiqueta: "Venta (salida)", ayuda: "Lunas vendidas sin orden de trabajo." },
  perdida: { etiqueta: "Pérdida (salida)", ayuda: "Lunas rotas, rayadas o extraviadas." },
  devolucion: { etiqueta: "Devolución (entrada)", ayuda: "Lunas que vuelven al stock." },
  ajuste: { etiqueta: "Ajuste (+ o −)", ayuda: "Corrección con motivo. Usa negativo para restar." },
} as const;

export function FormularioMovimiento({ accion, jefe }: { accion: Accion; jefe: boolean }) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const [tipo, setTipo] = useState<keyof typeof TEXTOS>("venta");
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.listo) formulario.current?.reset();
  }, [estado]);

  const tipos = (Object.keys(TEXTOS) as (keyof typeof TEXTOS)[]).filter((t) => t !== "ajuste" || jefe);
  return (
    <form ref={formulario} action={enviar} className="flex flex-col gap-3" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      {estado.listo && estado.aviso && <Alerta tipo="exito">{estado.aviso}</Alerta>}
      <Selector
        nombre="tipo"
        etiqueta="Tipo"
        opciones={tipos.map((t) => ({ valor: t, texto: TEXTOS[t].etiqueta }))}
        value={tipo}
        onChange={(e) => setTipo(e.target.value as keyof typeof TEXTOS)}
        ayuda={TEXTOS[tipo].ayuda}
        errores={estado.campos?.tipo}
      />
      <Campo nombre="cantidad" etiqueta="Cantidad (lunas)" inputMode="numeric" required errores={estado.campos?.cantidad} />
      <Campo
        nombre="motivo"
        etiqueta={tipo === "ajuste" || tipo === "perdida" ? "Motivo" : "Motivo (opcional)"}
        required={tipo === "ajuste" || tipo === "perdida"}
        maxLength={300}
        errores={estado.campos?.motivo}
      />
      {jefe && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="autoriza_negativo" className="mt-0.5 size-4 accent-marca-700" />
          <span>
            Autorizar stock negativo
            <span className="block text-xs text-slate-500">Solo si la salida es real y el stock aún no se registró.</span>
          </span>
        </label>
      )}
      <div>
        <BotonEnviar pendiente="Registrando…" icono={ArrowLeftRight}>
          Registrar movimiento
        </BotonEnviar>
      </div>
    </form>
  );
}
