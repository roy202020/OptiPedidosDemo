import Link from "next/link";
import type { Existencia } from "@/lib/datos/inventario";
import { clave, rango } from "@/lib/inventario/medidas";

const COLOR = {
  agotado: "bg-red-50 text-red-700 ring-red-200 hover:bg-red-100",
  bajo: "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100",
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100",
};

const signo = (n: number) => (n === 0 ? "0.00" : `${n > 0 ? "+" : ""}${n.toFixed(2)}`);

/**
 * Matriz de existencias de un producto: filas = esfera, columnas = cilindro (o adición en
 * multifocales). Cada celda es una medida exacta con su disponible; las vacías no existen aún.
 */
export function MatrizStock({ existencias, multifocal }: { existencias: Existencia[]; multifocal: boolean }) {
  // Grupos: lado (si aplica) para que OD y OI nunca se mezclen.
  const grupos = new Map<string, Existencia[]>();
  for (const e of existencias) {
    const g = e.lado ?? "";
    grupos.set(g, [...(grupos.get(g) ?? []), e]);
  }

  return (
    <div className="flex flex-col gap-6">
      {[...grupos.entries()].map(([lado, lista]) => {
        const columnaDe = (e: Existencia) => (multifocal ? (e.adicion ?? 0) : e.cilindro);
        const esferas = rango(Math.min(...lista.map((e) => e.esfera)), Math.max(...lista.map((e) => e.esfera))).reverse();
        const columnas = [...new Set(lista.map(columnaDe))].sort((a, b) => (multifocal ? a - b : b - a));
        if (!multifocal) {
          // Cilindros consecutivos de 0 al más negativo, para que la matriz no tenga huecos de columnas.
          columnas.splice(0, columnas.length, ...rango(Math.min(...columnas), Math.max(0, ...columnas)).reverse());
        }
        const celdas = new Map(lista.map((e) => [clave(e.esfera, columnaDe(e)), e]));

        return (
          <section key={lado} aria-label={lado ? `Lado ${lado}` : "Existencias"}>
            {lado && <h3 className="mb-2 text-sm font-semibold text-slate-700">Lado {lado}</h3>}
            <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200">
              <table className="border-separate border-spacing-1 text-center text-xs tabular-nums">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr>
                    <th scope="col" className="sticky left-0 z-20 bg-white px-2 py-1 text-slate-500">
                      {multifocal ? "Esf \\ Ad" : "Esf \\ Cil"}
                    </th>
                    {columnas.map((c) => (
                      <th key={c} scope="col" className="min-w-12 px-1 py-1 font-semibold text-slate-600">
                        {signo(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {esferas.map((s) => (
                    <tr key={s}>
                      <th scope="row" className="sticky left-0 bg-white px-2 font-semibold text-slate-600">
                        {signo(s)}
                      </th>
                      {columnas.map((c) => {
                        const e = celdas.get(clave(s, c));
                        if (!e) return <td key={c} className="h-8 rounded text-slate-300">·</td>;
                        return (
                          <td key={c} className="p-0">
                            <Link
                              href={`/panel/inventario/variantes/${e.id}`}
                              title={`Esfera ${signo(s)} · ${multifocal ? "adición" : "cilindro"} ${signo(c)} · stock ${e.stock}, reservadas ${e.reservado}, mínimo ${e.stock_minimo}`}
                              className={`flex h-8 min-w-12 items-center justify-center rounded font-semibold ring-1 ring-inset ${COLOR[e.estado_stock]}`}
                            >
                              {e.disponible}
                            </Link>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <p className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span>Cada celda: lunas disponibles (stock − reservadas).</span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-emerald-200" /> Con stock
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-amber-200" /> En o bajo el mínimo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-red-200" /> Agotada
        </span>
        <span>· medida sin registrar</span>
      </p>
    </div>
  );
}
