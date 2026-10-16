"use client";

import { useActionState } from "react";
import { Alerta, AreaTexto, BotonEnviar, Campo } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { BASES_PRISMA, OJOS } from "@/lib/validacion/receta";

type Props = {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  inicial: Record<string, string>;
  hoy: string;
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

export function FormularioReceta({ accion, inicial, hoy }: Props) {
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
    "h-9 w-full min-w-16 rounded-md border border-zinc-300 bg-white px-2 text-center text-sm tabular-nums outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 aria-invalid:border-red-500 aria-invalid:bg-red-50 dark:border-zinc-700 dark:bg-zinc-900 dark:aria-invalid:bg-red-950";

  return (
    <form action={enviar} className="flex flex-col gap-5" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      <input type="hidden" name="reemplaza_a" value={v.reemplaza_a ?? ""} />

      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Graduación</legend>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-xs text-zinc-500">
                <th className="w-28 pb-2 text-left font-medium">Ojo</th>
                {COLUMNAS.map((c) => (
                  <th key={c.campo} className="px-1 pb-2 font-medium">
                    {c.titulo}
                    <span className="block font-normal text-zinc-400">{c.ayuda}</span>
                  </th>
                ))}
                <th className="px-1 pb-2 font-medium">Base</th>
              </tr>
            </thead>
            <tbody>
              {OJOS.map((o) => (
                <tr key={o}>
                  <th className="py-1 text-left font-medium">{NOMBRE_OJO[o]}</th>
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
        <p className="mt-2 text-xs text-zinc-500">
          Escribe las graduaciones con signo (por ejemplo +1.25 o -0.50). “pl” o “plano” equivale a 0. Deja vacío lo que no aplique.
        </p>
        {erroresTabla.length > 0 && (
          <ul role="alert" className="mt-2 list-inside list-disc text-sm text-red-600 dark:text-red-400">
            {erroresTabla.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </fieldset>

      <AreaTexto nombre="observaciones" etiqueta="Observaciones" maxLength={1000} defaultValue={v.observaciones} errores={e.observaciones} />
      <div>
        <BotonEnviar pendiente="Guardando…">Guardar receta</BotonEnviar>
      </div>
    </form>
  );
}
