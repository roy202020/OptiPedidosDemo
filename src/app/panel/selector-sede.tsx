"use client";

import { MapPin } from "lucide-react";
import { useTransition } from "react";
import { claseControl } from "@/components/ui";
import { elegirSede } from "./acciones-sede";

type Opcion = { id: string; nombre: string; activa: boolean };

/**
 * Selector de sede de la barra superior. Solo lista las sedes del usuario; con más de una
 * ofrece además "Todas mis sedes" (para consultar; para registrar hay que elegir una).
 */
export function SelectorSede({ sedes, actual, todas }: { sedes: Opcion[]; actual: string; todas: string }) {
  const [pendiente, iniciar] = useTransition();

  if (sedes.length <= 1) {
    return (
      <p className="inline-flex items-center gap-1.5 rounded-full bg-marca-50 px-2.5 py-1 text-xs font-medium text-marca-800 ring-1 ring-marca-100 ring-inset">
        <MapPin aria-hidden className="size-3.5 text-marca-600" />
        {sedes[0] ? (
          <>
            <span className="sr-only">Sede: </span>
            {sedes[0].nombre}
          </>
        ) : (
          "Sin sede asignada"
        )}
      </p>
    );
  }

  return (
    <form
      action={elegirSede}
      className="flex w-full items-center gap-2 sm:w-auto"
      onChange={(e) => {
        const formulario = e.currentTarget;
        iniciar(() => formulario.requestSubmit());
      }}
    >
      <label htmlFor="selector-sede" className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-slate-700">
        <MapPin aria-hidden className="size-4 text-marca-600" />
        Sede
      </label>
      <select
        id="selector-sede"
        name="sede"
        defaultValue={actual}
        key={actual}
        disabled={pendiente}
        aria-busy={pendiente}
        className={`${claseControl} h-9 min-w-0 flex-1 sm:w-56 sm:flex-none`}
      >
        <option value={todas}>Todas mis sedes</option>
        {sedes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
            {s.activa ? "" : " (desactivada)"}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="text-sm underline">
          Cambiar
        </button>
      </noscript>
    </form>
  );
}
