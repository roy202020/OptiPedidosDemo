import { BarChart3 } from "lucide-react";
import { EstadoVacio } from "@/components/ui";
import type { VentaMensual } from "@/lib/datos/ventas";
import { soles } from "@/lib/formato";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const COMPACTO = new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 });

/** Importe corto para etiquetas del gráfico: "S/ 12.5 mil". */
const corto = (n: number) => (n === 0 ? "S/ 0" : `S/ ${COMPACTO.format(n)}`);

/** Máximo "redondo" del eje para que las líneas guía caigan en valores legibles. */
function techo(n: number) {
  const base = 10 ** Math.floor(Math.log10(n));
  const paso = [1, 2, 2.5, 5, 10].find((p) => p * base >= n) ?? 10;
  return paso * base;
}

/**
 * Barras de ventas netas por mes con una marca para la meta. Los datos también están en la
 * tabla de la página de ventas: el gráfico es decorativo para lectores de pantalla.
 * Sin ventas ni metas en el periodo muestra un estado vacío en lugar de ejes en blanco.
 */
export function GraficoVentas({ datos, alto = "h-44" }: { datos: VentaMensual[]; alto?: string }) {
  const todos = [...datos].reverse(); // del más antiguo al actual
  // Con pocos datos no se muestran meses vacíos al inicio (siempre quedan al menos 3).
  const primero = todos.findIndex((m) => m.ventas > 0 || m.meta != null);
  const meses = todos.slice(Math.max(0, Math.min(primero === -1 ? 0 : primero, todos.length - 3)));
  const mayor = Math.max(0, ...meses.map((m) => Math.max(m.ventas, m.meta ?? 0)));

  if (mayor === 0) {
    return (
      <EstadoVacio
        compacto
        icono={BarChart3}
        titulo="Aún no hay ventas en este periodo"
        descripcion="Las ventas aparecen aquí cuando confirmas órdenes con importe."
      />
    );
  }

  const maximo = techo(mayor);
  const guias = [1, 0.5];
  // Deja aire arriba para la etiqueta de la barra más alta.
  const pct = (n: number) => `${(n / maximo) * 88}%`;

  return (
    <figure aria-hidden>
      <div className={`relative ${alto} ml-14`}>
        {/* Líneas guía con su valor */}
        {guias.map((g) => (
          <div key={g} className="absolute inset-x-0 border-t border-slate-100" style={{ bottom: pct(maximo * g) }}>
            <span className="absolute -top-2 -left-14 w-12 text-right text-[10px] text-slate-400 tabular-nums">{corto(maximo * g)}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-2 border-b border-slate-200 sm:gap-3">
          {meses.map((m, i) => {
            const alcanzo = m.meta != null && m.ventas >= m.meta;
            const actual = i === meses.length - 1;
            return (
              <div
                key={m.periodo}
                className="group relative flex h-full flex-1 flex-col items-center justify-end"
                title={`${soles(m.ventas)}${m.meta ? ` · meta ${soles(m.meta)}` : ""}`}
              >
                {m.meta != null && (
                  <div className="absolute inset-x-0 z-10 border-t-2 border-dashed border-amber-500" style={{ bottom: pct(m.meta) }} />
                )}
                {m.ventas > 0 && (
                  <span className="mb-1 text-[10px] font-medium whitespace-nowrap text-slate-600 tabular-nums">{corto(m.ventas)}</span>
                )}
                <div
                  className={`w-full max-w-12 rounded-t-md transition-opacity group-hover:opacity-80 ${
                    alcanzo ? "bg-emerald-500" : actual ? "bg-marca-600" : "bg-marca-300"
                  }`}
                  style={{ height: pct(m.ventas), minHeight: m.ventas > 0 ? 3 : 0 }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 ml-14 flex gap-2 sm:gap-3">
        {meses.map((m, i) => (
          <span key={m.periodo} className={`flex-1 text-center text-xs ${i === meses.length - 1 ? "font-semibold text-slate-700" : "text-slate-500"}`}>
            {MESES_CORTOS[Number(m.periodo.slice(5, 7)) - 1]}
          </span>
        ))}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
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
