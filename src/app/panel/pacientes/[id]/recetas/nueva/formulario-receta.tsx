"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { Alerta, AreaTexto, BotonEnviar, Campo, Seccion } from "@/components/formulario";
import { EnlaceBoton } from "@/components/ui";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { BASES_PRISMA, OJOS } from "@/lib/validacion/receta";

type Props = {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  inicial: Record<string, string>;
  hoy: string;
  cancelar: string;
};

const COLUMNAS = [
  { campo: "esfera", titulo: "Esfera", ayuda: "±0.25" },
  { campo: "cilindro", titulo: "Cilindro", ayuda: "±0.25" },
  { campo: "eje", titulo: "Eje", ayuda: "0–180°" },
  { campo: "adicion", titulo: "Adición", ayuda: "+0.25 a +4" },
  { campo: "dnp", titulo: "DNP", ayuda: "mm" },
  { campo: "altura", titulo: "Altura", ayuda: "mm" },
  { campo: "prisma", titulo: "Prisma", ayuda: "Δ" },
] as const;

const NOMBRE_OJO = { od: "OD (derecho)", oi: "OI (izquierdo)" };

export function FormularioReceta({ accion, inicial, hoy, cancelar }: Props) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const v = estado.valores ?? inicial;
  const e = estado.campos ?? {};

  // Errores de la tabla de graduación, listados debajo con el ojo y la columna.
  const erroresTabla = OJOS.flatMap((o) =>
    [...COLUMNAS.map((c) => ({ campo: c.campo, titulo: c.titulo })), { campo: "base_prisma", titulo: "Base del prisma" }]
      .filter((c) => e[`${o}_${c.campo}`]?.length)
      .map((c) => `${o.toUpperCase()} · ${c.titulo}: ${e[`${o}_${c.campo}`]![0]}`),
  );

  const claseCelda =
    "h-9 w-full min-w-16 rounded-lg border border-slate-300 bg-white px-2 text-center text-sm tabular-nums shadow-sm outline-none focus:border-marca-500 focus:ring-3 focus:ring-marca-500/15 aria-invalid:border-red-500 aria-invalid:bg-red-50";

  return (
    <form action={enviar} className="flex flex-col gap-5" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      <input type="hidden" name="reemplaza_a" value={v.reemplaza_a ?? ""} />

      <Seccion titulo="Examen" descripcion="Fecha y profesional que realizó la medición.">
        <Campo
          nombre="fecha_examen"
          etiqueta="Fecha del examen"
          tipo="date"
          required
          max={hoy}
          defaultValue={v.fecha_examen ?? hoy}
          errores={e.fecha_examen}
        />
        <Campo nombre="profesional" etiqueta="Profesional" maxLength={120} defaultValue={v.profesional} errores={e.profesional} />
      </Seccion>

      <fieldset className="border-t border-slate-100 pt-6">
        <legend className="mb-1 text-sm font-semibold text-slate-900">Graduación</legend>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th scope="col" className="w-28 pb-2 text-left font-medium">Ojo</th>
                {COLUMNAS.map((c) => (
                  <th scope="col" key={c.campo} className="px-1 pb-2 font-medium">
                    {c.titulo}
                    <span className="block font-normal text-slate-400">{c.ayuda}</span>
                  </th>
                ))}
                <th scope="col" className="px-1 pb-2 font-medium">Base</th>
              </tr>
            </thead>
            <tbody>
              {OJOS.map((o) => (
                <tr key={o}>
                  <th scope="row" className="py-1 text-left font-medium text-slate-700">{NOMBRE_OJO[o]}</th>
                  {COLUMNAS.map((c) => {
                    const nombre = `${o}_${c.campo}`;
                    return (
                      <td key={nombre} className="px-1 py-1">
                        <input
                          name={nombre}
                          aria-label={`${o.toUpperCase()} ${c.titulo}`}
                          inputMode={c.campo === "eje" ? "numeric" : "decimal"}
                          autoComplete="off"
                          defaultValue={v[nombre]}
                          aria-invalid={Boolean(e[nombre]?.length) || undefined}
                          className={claseCelda}
                        />
                      </td>
                    );
                  })}
                  <td className="px-1 py-1">
                    <select
                      name={`${o}_base_prisma`}
                      aria-label={`${o.toUpperCase()} base del prisma`}
                      defaultValue={v[`${o}_base_prisma`] ?? ""}
                      aria-invalid={Boolean(e[`${o}_base_prisma`]?.length) || undefined}
                      className={claseCelda}
                    >
                      <option value="">—</option>
                      {BASES_PRISMA.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Escribe las graduaciones con signo (por ejemplo +1.25 o -0.50). “pl” o “plano” equivale a 0. Deja vacío lo que no aplique.
        </p>
        {erroresTabla.length > 0 && (
          <ul role="alert" className="mt-3 list-inside list-disc rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erroresTabla.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="border-t border-slate-100 pt-6">
        <AreaTexto nombre="observaciones" etiqueta="Observaciones" maxLength={1000} defaultValue={v.observaciones} errores={e.observaciones} />
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
        <EnlaceBoton href={cancelar}>Cancelar</EnlaceBoton>
        <BotonEnviar pendiente="Guardando…" icono={Save}>
          Guardar receta
        </BotonEnviar>
      </div>
    </form>
  );
}
