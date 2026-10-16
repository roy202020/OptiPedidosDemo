"use client";

import { PackagePlus, Trash2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { Alerta, BotonEnviar, Campo } from "@/components/formulario";
import { Boton, claseControl } from "@/components/ui";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { enPares, rango } from "@/lib/inventario/medidas";
import { leerImporte } from "@/lib/validacion/orden";
import { registrarCompra } from "../../acciones";

export type ProductoCompra = {
  id: string;
  nombre: string;
  vision: string;
  por_lado: boolean;
  proveedor: string | null;
  costo_referencial: number | null;
};

const signo = (n: number) => (n === 0 ? "0.00" : `${n > 0 ? "+" : ""}${n.toFixed(2)}`);
/** Clave de una cantidad: producto|lado|adición|esfera|cilindro. */
const claveCelda = (p: string, lado: string, ad: number | null, esf: number, cil: number) =>
  `${p}|${lado}|${ad == null ? "" : ad.toFixed(2)}|${esf.toFixed(2)}|${cil.toFixed(2)}`;

export function FormularioCompra({ productos, hoy, inicial }: { productos: ProductoCompra[]; hoy: string; inicial?: string }) {
  const [estado, enviar] = useActionState(registrarCompra, {} as EstadoFormulario);
  const [productoId, setProductoId] = useState(inicial ?? productos[0]?.id ?? "");
  const [esfDesde, setEsfDesde] = useState("-6");
  const [esfHasta, setEsfHasta] = useState("4");
  const [cilHasta, setCilHasta] = useState("-2");
  const [adiciones, setAdiciones] = useState("1.00 3.00");
  const [lado, setLado] = useState<"OD" | "OI">("OD");
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [costos, setCostos] = useState<Record<string, string>>(() =>
    Object.fromEntries(productos.map((p) => [p.id, p.costo_referencial != null ? String(p.costo_referencial) : ""])),
  );
  const [relleno, setRelleno] = useState("");

  const producto = productos.find((p) => p.id === productoId);
  const multifocal = producto != null && producto.vision !== "monofocal";
  const ladoActual = producto?.por_lado ? lado : "";

  const esferas = useMemo(() => {
    const a = Number(esfDesde.replace(",", "."));
    const b = Number(esfHasta.replace(",", "."));
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 20 || Math.abs(b) > 20) return [];
    return rango(a, b).reverse();
  }, [esfDesde, esfHasta]);

  const columnas = useMemo(() => {
    if (multifocal) {
      const [a, b = a] = adiciones.replace(/,/g, ".").split(/[\s-]+/).filter(Boolean).map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0.25 || b > 4) return [];
      return rango(a, b);
    }
    const c = Number(cilHasta.replace(",", "."));
    if (!Number.isFinite(c) || c > 0 || c < -10) return [0];
    return rango(c, 0).reverse();
  }, [multifocal, adiciones, cilHasta]);

  const celda = (esf: number, col: number) =>
    multifocal ? claveCelda(productoId, ladoActual, col, esf, 0) : claveCelda(productoId, ladoActual, null, esf, col);

  const fijar = (k: string, valor: string) =>
    setCantidades((c) => {
      const n = Math.max(0, Math.trunc(Number(valor)));
      const sig = { ...c };
      if (!valor || !Number.isFinite(n) || n === 0) delete sig[k];
      else sig[k] = n;
      return sig;
    });

  /** Enter/flechas verticales recorren la columna (carga rápida por columnas). */
  const mover = (e: React.KeyboardEvent<HTMLInputElement>, fila: number, col: number) => {
    const delta = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    document.getElementById(`c-${fila + delta}-${col}`)?.focus();
  };

  // Líneas para enviar y resumen por producto.
  const lineas = Object.entries(cantidades).map(([k, cantidad]) => {
    const [p, l, ad, esf, cil] = k.split("|");
    const costo = leerImporte(costos[p] ?? "");
    return {
      producto_id: p,
      lado: l || null,
      adicion: ad ? Number(ad) : null,
      esfera: Number(esf),
      cilindro: Number(cil),
      cantidad,
      costo_unitario: costos[p] && Number.isFinite(costo) ? costo : null,
    };
  });
  const resumen = productos
    .map((p) => {
      const suyas = lineas.filter((l) => l.producto_id === p.id);
      return { producto: p, medidas: suyas.length, lunas: suyas.reduce((s, l) => s + l.cantidad, 0) };
    })
    .filter((r) => r.medidas > 0);
  const totalLunas = resumen.reduce((s, r) => s + r.lunas, 0);

  const llenarVacias = () => {
    const n = Math.trunc(Number(relleno));
    if (!(n > 0)) return;
    setCantidades((c) => {
      const sig = { ...c };
      for (const s of esferas) for (const col of columnas) sig[celda(s, col)] ??= n;
      return sig;
    });
  };

  const v = estado.valores ?? {};

  return (
    <form action={enviar} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="lineas" value={JSON.stringify(lineas)} />
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Campo nombre="fecha" etiqueta="Fecha" tipo="date" required max={hoy} defaultValue={v.fecha ?? hoy} errores={estado.campos?.fecha} />
        <Campo nombre="proveedor" etiqueta="Proveedor" maxLength={120} defaultValue={v.proveedor ?? producto?.proveedor ?? ""} errores={estado.campos?.proveedor} />
        <Campo nombre="documento" etiqueta="Factura o guía" maxLength={60} defaultValue={v.documento} errores={estado.campos?.documento} />
        <Campo nombre="lote" etiqueta="Lote" maxLength={60} defaultValue={v.lote} errores={estado.campos?.lote} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 lg:col-span-2">
            Producto
            <select value={productoId} onChange={(e) => setProductoId(e.target.value)} className={`${claseControl} h-10`}>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Esfera desde
            <input value={esfDesde} onChange={(e) => setEsfDesde(e.target.value)} inputMode="decimal" className={`${claseControl} h-10`} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Esfera hasta
            <input value={esfHasta} onChange={(e) => setEsfHasta(e.target.value)} inputMode="decimal" className={`${claseControl} h-10`} />
          </label>
          {multifocal ? (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Adiciones (desde hasta)
              <input value={adiciones} onChange={(e) => setAdiciones(e.target.value)} inputMode="decimal" className={`${claseControl} h-10`} />
            </label>
          ) : (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Cilindro hasta
              <input value={cilHasta} onChange={(e) => setCilHasta(e.target.value)} inputMode="decimal" className={`${claseControl} h-10`} />
            </label>
          )}
          {producto?.por_lado && (
            <div role="group" aria-label="Lado" className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Lado
              <div className="inline-flex h-10 rounded-lg border border-slate-300 bg-white p-0.5">
                {(["OD", "OI"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLado(l)}
                    aria-pressed={lado === l}
                    className={`flex-1 rounded-md px-3 text-sm ${lado === l ? "bg-marca-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Llenar celdas vacías con
            <input value={relleno} onChange={(e) => setRelleno(e.target.value)} inputMode="numeric" className={`${claseControl} h-9 w-24`} />
          </label>
          <Boton tamano="sm" onClick={llenarVacias}>
            Llenar
          </Boton>
          <p className="ml-auto text-xs text-slate-500">
            Cantidades en <strong>lunas sueltas</strong> (un par = 2). Enter o ↓ bajan por la columna; Tab avanza a la derecha.
          </p>
        </div>

        {esferas.length > 0 && columnas.length > 0 ? (
          <div className="mt-4 max-h-[60vh] overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="border-separate border-spacing-0.5 text-center text-xs tabular-nums">
              <thead className="sticky top-0 z-10 bg-white">
                <tr>
                  <th scope="col" className="sticky left-0 z-20 bg-white px-2 py-1 text-slate-500">
                    {multifocal ? "Esf \\ Ad" : "Esf \\ Cil"}
                  </th>
                  {columnas.map((c) => (
                    <th key={c} scope="col" className="px-1 py-1 font-semibold text-slate-600">
                      {signo(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {esferas.map((s, i) => (
                  <tr key={s}>
                    <th scope="row" className="sticky left-0 bg-white px-2 font-semibold text-slate-600">
                      {signo(s)}
                    </th>
                    {columnas.map((c, j) => {
                      const k = celda(s, c);
                      return (
                        <td key={c}>
                          <input
                            id={`c-${i}-${j}`}
                            inputMode="numeric"
                            aria-label={`Esfera ${signo(s)}, ${multifocal ? "adición" : "cilindro"} ${signo(c)}`}
                            value={cantidades[k] ?? ""}
                            onChange={(e) => fijar(k, e.target.value)}
                            onKeyDown={(e) => mover(e, i, j)}
                            onFocus={(e) => e.currentTarget.select()}
                            className={`h-8 w-12 rounded border text-center outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20 ${
                              cantidades[k] ? "border-marca-300 bg-marca-50 font-semibold text-marca-900" : "border-slate-200"
                            }`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-red-600">Revisa los rangos: esfera entre −20 y +20, cilindro entre −10 y 0, adición entre 0.25 y 4.</p>
        )}
      </section>

      <section aria-labelledby="resumen-compra">
        <h2 id="resumen-compra" className="mb-2 text-sm font-semibold text-slate-900">
          Resumen de la compra
        </h2>
        {resumen.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no escribiste cantidades. Puedes cambiar de producto y seguir cargando: lo escrito se conserva.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left">Producto</th>
                  <th scope="col" className="px-3 py-2 text-right">Medidas</th>
                  <th scope="col" className="px-3 py-2 text-right">Lunas</th>
                  <th scope="col" className="px-3 py-2 text-right">Costo por luna (S/)</th>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Quitar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r) => (
                  <tr key={r.producto.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{r.producto.nombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.medidas}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.lunas} <span className="text-xs text-slate-500">({enPares(r.lunas)})</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        aria-label={`Costo por luna de ${r.producto.nombre}`}
                        inputMode="decimal"
                        value={costos[r.producto.id] ?? ""}
                        onChange={(e) => setCostos((c) => ({ ...c, [r.producto.id]: e.target.value }))}
                        className={`${claseControl} h-8 w-24 text-right`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Boton
                        tamano="sm"
                        variante="fantasma"
                        icono={Trash2}
                        onClick={() => setCantidades((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith(`${r.producto.id}|`))))}
                      >
                        Quitar
                      </Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{lineas.length}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {totalLunas} <span className="text-xs font-normal text-slate-500">({enPares(totalLunas)})</span>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <Campo nombre="notas" etiqueta="Notas" maxLength={500} defaultValue={v.notas} errores={estado.campos?.notas} />

      <div className="flex justify-end border-t border-slate-100 pt-6">
        <BotonEnviar pendiente="Registrando compra…" icono={PackagePlus}>
          Registrar compra ({totalLunas} lunas)
        </BotonEnviar>
      </div>
    </form>
  );
}
