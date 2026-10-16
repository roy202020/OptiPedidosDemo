"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { Alerta, AreaTexto, BotonEnviar, Campo, Seccion, Selector } from "@/components/formulario";
import { EnlaceBoton } from "@/components/ui";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { DISENOS, ORIGENES_MONTURA, PRIORIDADES, TIPOS_TRABAJO, TRATAMIENTOS } from "@/lib/ordenes/estados";

type Opcion = { valor: string; texto: string };

type Props = {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  recetas: Opcion[];
  laboratorios: Opcion[];
  /** Ojos que tiene la receta (en edición, los de la orden). */
  ojos: ("od" | "oi")[];
  inicial?: Record<string, string>;
  hoy: string;
  cancelar: string;
  edicion?: boolean;
};

const opciones = (o: Record<string, string>, vacio?: string): Opcion[] => [
  ...(vacio ? [{ valor: "", texto: vacio }] : []),
  ...Object.entries(o).map(([valor, texto]) => ({ valor, texto })),
];

export function FormularioOrden({ accion, recetas, laboratorios, ojos, inicial = {}, hoy, cancelar, edicion }: Props) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const v = estado.valores ?? inicial;
  const e = estado.campos ?? {};

  return (
    <form action={enviar} className="flex flex-col gap-6" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      {Object.keys(e).length > 0 && <Alerta tipo="error">Revisa los campos marcados.</Alerta>}

      <Seccion titulo="Receta y laboratorio" descripcion="La graduación se copia de la receta al crear la orden y no cambia después.">
        {edicion ? (
          <>
            <input type="hidden" name="receta_id" value={v.receta_id} />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Receta</span>
              <p className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                {recetas[0]?.texto}
              </p>
            </div>
          </>
        ) : (
          <Selector
            nombre="receta_id"
            etiqueta="Receta"
            required
            opciones={recetas}
            defaultValue={v.receta_id ?? recetas[0]?.valor}
            errores={e.receta_id}
          />
        )}
        <Selector
          nombre="laboratorio_id"
          etiqueta="Laboratorio"
          required
          opciones={[{ valor: "", texto: "Elige un laboratorio" }, ...laboratorios]}
          defaultValue={v.laboratorio_id ?? (laboratorios.length === 1 ? laboratorios[0].valor : "")}
          errores={e.laboratorio_id}
        />
      </Seccion>

      <Seccion titulo="Trabajo" descripcion="Qué se pide al laboratorio y para cuándo.">
        <Selector nombre="tipo_trabajo" etiqueta="Tipo de trabajo" opciones={opciones(TIPOS_TRABAJO)} defaultValue={v.tipo_trabajo ?? "lentes_completos"} errores={e.tipo_trabajo} />
        <Selector nombre="prioridad" etiqueta="Prioridad" opciones={opciones(PRIORIDADES)} defaultValue={v.prioridad ?? "normal"} errores={e.prioridad} />
        <Campo
          nombre="fecha_entrega_prometida"
          etiqueta="Entrega prometida al paciente"
          tipo="date"
          required
          min={hoy}
          defaultValue={v.fecha_entrega_prometida}
          errores={e.fecha_entrega_prometida}
        />
        <Selector
          nombre="montura_origen"
          etiqueta="Montura"
          opciones={opciones(ORIGENES_MONTURA, "Sin especificar")}
          defaultValue={v.montura_origen ?? ""}
          errores={e.montura_origen}
        />
        <Campo
          nombre="montura_descripcion"
          etiqueta="Descripción de la montura"
          placeholder="Marca, modelo, color, medida"
          maxLength={200}
          className="sm:col-span-2"
          defaultValue={v.montura_descripcion}
          errores={e.montura_descripcion}
        />
      </Seccion>

      <Seccion titulo="Importe" descripcion="En soles, IGV incluido. Solo se puede cambiar mientras la venta está iniciada.">
        <Campo nombre="precio" etiqueta="Precio total (S/)" inputMode="decimal" required placeholder="0.00" defaultValue={v.precio} errores={e.precio} />
        <Campo nombre="descuento" etiqueta="Descuento (S/)" inputMode="decimal" placeholder="0.00" defaultValue={v.descuento} errores={e.descuento} />
      </Seccion>

      {ojos.map((o) => (
        <Seccion key={o} titulo={o === "od" ? "Lente OD (derecho)" : "Lente OI (izquierdo)"} descripcion="Datos del lente para el laboratorio.">
          <Campo nombre={`${o}_material`} etiqueta="Material" placeholder="CR-39, policarbonato…" maxLength={60} defaultValue={v[`${o}_material`]} errores={e[`${o}_material`]} />
          <Campo nombre={`${o}_indice`} etiqueta="Índice" inputMode="decimal" placeholder="1.56" defaultValue={v[`${o}_indice`]} errores={e[`${o}_indice`]} />
          <Selector nombre={`${o}_diseno`} etiqueta="Diseño" opciones={opciones(DISENOS, "Sin especificar")} defaultValue={v[`${o}_diseno`] ?? ""} errores={e[`${o}_diseno`]} />
          <Campo nombre={`${o}_diametro_mm`} etiqueta="Diámetro (mm)" inputMode="numeric" defaultValue={v[`${o}_diametro_mm`]} errores={e[`${o}_diametro_mm`]} />
          <Campo nombre={`${o}_tinte`} etiqueta="Tinte" maxLength={60} className="sm:col-span-2" defaultValue={v[`${o}_tinte`]} errores={e[`${o}_tinte`]} />
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium text-slate-700">Tratamientos</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(TRATAMIENTOS).map(([valor, texto]) => (
                <label key={valor} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name={`${o}_tratamientos`}
                    value={valor}
                    defaultChecked={(v[`${o}_tratamientos`] ?? "").split(",").includes(valor)}
                    className="size-4 rounded border-slate-300 accent-marca-700"
                  />
                  {texto}
                </label>
              ))}
            </div>
          </fieldset>
        </Seccion>
      ))}

      {!edicion && (
        <Seccion titulo="Observación" descripcion="Opcional. Queda registrada en la orden con tu usuario.">
          <AreaTexto nombre="observacion" etiqueta="Observación inicial" maxLength={1000} className="sm:col-span-2" defaultValue={v.observacion} errores={e.observacion} />
        </Seccion>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
        <EnlaceBoton href={cancelar}>Cancelar</EnlaceBoton>
        <BotonEnviar pendiente="Guardando…" icono={Save}>
          {edicion ? "Guardar cambios" : "Crear orden"}
        </BotonEnviar>
      </div>
    </form>
  );
}
