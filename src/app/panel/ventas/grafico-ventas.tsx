import type { VentaMensual } from "@/lib/datos/ventas";
import { soles } from "@/lib/formato";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Barras de ventas netas por mes con una marca para la meta. Los datos también están en la
 * tabla de la página: el gráfico es decorativo para lectores de pantalla.
 */
export function GraficoVentas({ datos }: { datos: VentaMensual[] }) {
  const meses = [...datos].reverse(); // del más antiguo al actual
  const maximo = Math.max(1, ...meses.map((m) => Math.max(m.ventas, m.meta ?? 0)));

  return (
    <figure aria-hidden>
      <div className="flex h-48 items-end gap-2 border-b border-slate-200 pb-px">
        {meses.map((m) => {
          const alcanzo = m.meta != null && m.ventas >= m.meta;
          return (
            <div key={m.periodo} className="group relative flex h-full flex-1 flex-col justify-end" title={`${soles(m.ventas)}${m.meta ? ` · meta ${soles(m.meta)}` : ""}`}>
              {m.meta != null && (
                <div className="absolute inset-x-0 z-10 border-t-2 border-dashed border-amber-500" style={{ bottom: `${(m.meta / maximo) * 100}%` }} />
              )}
              <div
                className={`w-full rounded-t-md ${alcanzo ? "bg-emerald-500" : "bg-marca-600"} group-hover:opacity-80`}
                style={{ height: `${(m.ventas / maximo) * 100}%`, minHeight: m.ventas > 0 ? 2 : 0 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {meses.map((m) => (
          <span key={m.periodo} className="flex-1 text-center text-xs text-slate-500">
            {MESES_CORTOS[Number(m.periodo.slice(5, 7)) - 1]}
          </span>
        ))}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-marca-600" /> Ventas netas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-emerald-500" /> Meta alcanzada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-amber-500" /> Meta
        </span>
      </figcaption>
    </figure>
  );
}
