import { normalizarOjo, type OjoReceta, type ReglaRango } from "@/lib/cotizaciones/compatibilidad";
import { TRATAMIENTOS } from "@/lib/ordenes/estados";

export type TarifaLuna = ReglaRango & {
  id: string; nombre: string; material: string | null; indice: number | null;
  tratamiento: string | null; color: string | null; vision: string;
  unidad: "por_luna" | "por_par"; precio: number;
};
export type RecetaPrecio = Record<`${"od" | "oi"}_${"esfera" | "cilindro" | "eje" | "adicion"}`, number | null>;
type Lente = { material: string | null; indice: string | number | null; tratamientos: string[]; diseno: string | null; tinte: string | null };
export type SeleccionPrecio = { ojos_pedido: string; od: Lente; oi: Lente };
export type ResultadoPrecio = { total: number; lineas: { ojo: string; nombre: string; importe: number }[]; error?: never } | { error: string; total?: never; lineas?: never };
const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
const alias: Record<string,string> = { ar: "antirreflejo", "blue cut": "filtro_azul", "filtro azul": "filtro_azul", "uv": "uv", "sin tratamiento": "", "sin tratamientos": "" };
for (const [clave, etiqueta] of Object.entries(TRATAMIENTOS)) { alias[normal(etiqueta)] = clave; alias[clave] = clave; }
function tratamientos(texto: string | null): string {
  return [...new Set((texto ?? "").split(/[,;+|]/).map(t => alias[normal(t)] ?? normal(t)).filter(Boolean))].sort().join(",");
}

/** Tarifas del catálogo incluyen la combinación completa de tratamientos; nunca inventa recargos. */
export function calcularPrecioLunas(d: SeleccionPrecio, receta: RecetaPrecio, tarifas: TarifaLuna[]): ResultadoPrecio {
  const ojos = d.ojos_pedido === "ambos" ? ["od", "oi"] as const : d.ojos_pedido === "od" ? ["od"] as const : ["oi"] as const;
  const lineas: { ojo: string; nombre: string; importe: number }[] = [];
  for (const o of ojos) {
    const lente = d[o];
    const rx: OjoReceta = { esfera: receta[`${o}_esfera`], cilindro: receta[`${o}_cilindro`], eje: receta[`${o}_eje`], adicion: receta[`${o}_adicion`] };
    const medida = normalizarOjo(rx);
    if (!medida) return { error: `La receta no tiene graduación para ${o.toUpperCase()}.` };
    if (!lente.material || !lente.indice) return { error: "Elige material e índice para calcular el precio." };
    const coincidencias = tarifas.filter(t => normal(t.material ?? "") === normal(lente.material!) && Number(t.indice) === Number(lente.indice)
      && tratamientos(t.tratamiento) === tratamientos(lente.tratamientos.join(","))
      && !normal(lente.tinte ?? "")
      && (lente.diseno ? t.vision === lente.diseno : t.vision === "monofocal")
      && medida.esfera >= t.esfera_min && medida.esfera <= t.esfera_max
      && medida.cilindro >= t.cilindro_min && medida.cilindro <= t.cilindro_max
      && (t.vision === "monofocal" ? medida.adicion === null : medida.adicion !== null && t.adicion_min !== null && t.adicion_max !== null && medida.adicion >= t.adicion_min && medida.adicion <= t.adicion_max));
    if (!coincidencias.length) return { error: `Sin tarifa para ${o.toUpperCase()}: revisa material, índice, diseño, tratamientos y graduación en el catálogo.` };
    const precios = [...new Set(coincidencias.map(t => Math.round(t.precio * 100) / (t.unidad === "por_par" ? 2 : 1)))];
    if (precios.length !== 1) return { error: `Hay varias tarifas para ${o.toUpperCase()} con precios distintos. Revisa el catálogo o usa un precio acordado.` };
    lineas.push({ ojo: o.toUpperCase(), nombre: coincidencias[0].nombre, importe: precios[0] / 100 });
  }
  // Redondear el total una sola vez: dos mitades de un par con céntimos impares conservan su precio.
  const total = Math.round(lineas.reduce((s,l) => s + l.importe, 0) * 100) / 100;
  let acumulado = 0;
  lineas.forEach((l,i) => { l.importe = i === lineas.length - 1 ? Math.round((total - acumulado) * 100) / 100 : Math.round(l.importe * 100) / 100; acumulado += l.importe; });
  return { total, lineas };
}

/** Suma importes en céntimos para evitar errores de coma flotante. */
export const sumarPreciosPedido = (lunas: number, montura: number) => (Math.round(lunas * 100) + Math.round(montura * 100)) / 100;
