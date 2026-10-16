"use client";

import { ClipboardCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { Alerta, BotonEnviar, Campo } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { textoMedida } from "@/lib/inventario/medidas";

type Fila = { id: string; esfera: number; cilindro: number; adicion: number | null; lado: string | null; stock: number; ubicacion: string | null };

/**
 * Inventario físico: se escribe lo contado solo en las medidas revisadas.
 * Las vacías no se modifican. Muestra la diferencia antes de guardar.
 */
export function FormularioConteo({
  accion,
  filas,
}: {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  filas: Fila[];
}) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const [contados, setContados] = useState<Record<string, string>>({});
  const diferencias = filas.filter((f) => contados[f.id] !== undefined && contados[f.id] !== "" && Number(contados[f.id]) !== f.stock);

  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">Medida</th>
              <th scope="col" className="hidden px-3 py-2 text-left sm:table-cell">Ubicación</th>
              <th scope="col" className="px-3 py-2 text-right">En sistema</th>
              <th scope="col" className="px-3 py-2 text-right">Contado</th>
              <th scope="col" className="px-3 py-2 text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const valor = contados[f.id] ?? "";
              const dif = valor === "" ? null : Number(valor) - f.stock;
              return (
                <tr key={f.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 font-medium tabular-nums">{textoMedida(f)}</td>
                  <td className="hidden px-3 py-1.5 text-slate-500 sm:table-cell">{f.ubicacion ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{f.stock}</td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      name={`c_${f.id}`}
                      inputMode="numeric"
                      aria-label={`Contado de ${textoMedida(f)}`}
                      value={valor}
                      onChange={(e) => setContados((c) => ({ ...c, [f.id]: e.target.value.replace(/\D/g, "") }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "ArrowDown") {
                          e.preventDefault();
                          document.getElementsByName(`c_${filas[i + 1]?.id}`)[0]?.focus();
                        }
                      }}
                      className="h-8 w-20 rounded border border-slate-300 text-center tabular-nums outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
                    />
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-semibold tabular-nums ${dif == null || dif === 0 ? "text-slate-400" : dif > 0 ? "text-emerald-700" : "text-red-700"}`}
                  >
                    {dif == null ? "—" : dif > 0 ? `+${dif}` : dif}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Campo nombre="notas" etiqueta="Notas del inventario" maxLength={300} placeholder="Cierre de mes, revisión del cajón A…" />
      <p className="text-sm text-slate-600">
        Se registrarán <strong>{diferencias.length}</strong> ajustes. Las medidas que no escribas no cambian.
      </p>
      <div className="flex justify-end">
        <BotonEnviar pendiente="Registrando…" icono={ClipboardCheck}>
          Registrar inventario físico
        </BotonEnviar>
      </div>
    </form>
  );
}
