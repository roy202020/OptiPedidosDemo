"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { Alerta, BotonEnviar, Campo, Seccion, Selector } from "@/components/formulario";
import { EnlaceBoton } from "@/components/ui";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { SUPERFICIES, TIPOS_LUNA, VISIONES } from "@/lib/inventario/medidas";

const opciones = (o: Record<string, string>, vacio?: string) => [
  ...(vacio ? [{ valor: "", texto: vacio }] : []),
  ...Object.entries(o).map(([valor, texto]) => ({ valor, texto })),
];

type Props = {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  inicial?: Record<string, string>;
  textoBoton: string;
  cancelar: string;
  /** Con medidas registradas no se cambian visión ni lado (cambiarían el significado del stock). */
  bloquearEstructura?: boolean;
};

export function FormularioProducto({ accion, inicial = {}, textoBoton, cancelar, bloquearEstructura }: Props) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const v = estado.valores ?? inicial;
  const e = estado.campos ?? {};

  return (
    <form action={enviar} className="flex flex-col gap-6" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}

      <Seccion titulo="Producto" descripcion="El tipo de luna, sin medida. Las medidas se crean al registrar compras.">
        <Campo nombre="nombre" etiqueta="Nombre" required maxLength={120} placeholder="Resina blanca, Fotoblue AR azul…" className="sm:col-span-2" defaultValue={v.nombre} errores={e.nombre} />
        <Selector nombre="tipo" etiqueta="Tipo de luna" opciones={opciones(TIPOS_LUNA)} defaultValue={v.tipo ?? "resina"} errores={e.tipo} />
        <Campo nombre="material" etiqueta="Material" maxLength={60} placeholder="CR-39, policarbonato…" defaultValue={v.material} errores={e.material} />
        <Campo nombre="indice" etiqueta="Índice de refracción" inputMode="decimal" placeholder="1.56" defaultValue={v.indice} errores={e.indice} />
        <Selector nombre="superficie" etiqueta="Superficie" opciones={opciones(SUPERFICIES, "Sin especificar")} defaultValue={v.superficie ?? ""} errores={e.superficie} />
      </Seccion>

      <Seccion titulo="Tratamiento" descripcion="Antirreflejo, Blue Cut, Fotoblue, fotocromático… y el color del reflejo.">
        <Campo nombre="tratamiento" etiqueta="Tratamiento" maxLength={60} placeholder="Antirreflejo, Blue Cut…" defaultValue={v.tratamiento} errores={e.tratamiento} />
        <Campo nombre="color_tratamiento" etiqueta="Color del antirreflejo" maxLength={40} placeholder="Azul, verde…" defaultValue={v.color_tratamiento} errores={e.color_tratamiento} />
      </Seccion>

      <Seccion
        titulo="Cómo se controla el stock"
        descripcion={bloquearEstructura ? "Ya hay medidas registradas: visión y lado no se pueden cambiar." : "Los multifocales se controlan también por adición."}
      >
        {bloquearEstructura && (
          <>
            <input type="hidden" name="vision" value={v.vision} />
            {v.por_lado === "on" && <input type="hidden" name="por_lado" value="on" />}
          </>
        )}
        <Selector
          nombre="vision"
          etiqueta="Visión"
          opciones={opciones(VISIONES)}
          defaultValue={v.vision ?? "monofocal"}
          disabled={bloquearEstructura}
          errores={e.vision}
        />
        <Campo
          nombre="stock_minimo_defecto"
          etiqueta="Mínimo por medida (lunas)"
          inputMode="numeric"
          ayuda="Se aplica a las medidas nuevas; cada medida puede tener el suyo."
          defaultValue={v.stock_minimo_defecto ?? "0"}
          errores={e.stock_minimo_defecto}
        />
        <label className="flex items-start gap-3 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name={bloquearEstructura ? undefined : "por_lado"}
            defaultChecked={v.por_lado === "on"}
            disabled={bloquearEstructura}
            className="mt-0.5 size-4 accent-marca-700"
          />
          <span>
            <span className="font-medium text-slate-800">El stock distingue ojo derecho (OD) e izquierdo (OI)</span>
            <span className="block text-xs text-slate-500">Necesario en algunos progresivos o lunas por lado.</span>
          </span>
        </label>
      </Seccion>

      <Seccion titulo="Compra" descripcion="Datos de referencia para registrar compras más rápido.">
        <Campo nombre="proveedor" etiqueta="Proveedor habitual" maxLength={120} defaultValue={v.proveedor} errores={e.proveedor} />
        <Campo nombre="costo_referencial" etiqueta="Costo por luna (S/)" inputMode="decimal" defaultValue={v.costo_referencial} errores={e.costo_referencial} />
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
