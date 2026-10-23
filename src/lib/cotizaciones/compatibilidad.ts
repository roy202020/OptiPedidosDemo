import { aCilindroNegativo, type Medida } from "@/lib/inventario/medidas";

export type OjoReceta = {
  esfera: number | null;
  cilindro: number | null;
  eje: number | null;
  adicion: number | null;
};

export type ReglaRango = {
  esfera_min: number;
  esfera_max: number;
  cilindro_min: number;
  cilindro_max: number;
  adicion_min: number | null;
  adicion_max: number | null;
};

export type VarianteDisponible = {
  id: string;
  esfera: number;
  cilindro: number;
  eje: number | null;
  adicion: number | null;
  lado: "OD" | "OI" | null;
  stock: number;
  reservado: number;
};

export function normalizarOjo(ojo: OjoReceta): (Medida & { adicion: number | null }) | null {
  if (ojo.esfera === null && ojo.cilindro === null) return null;
  const normalizada = aCilindroNegativo({ esfera: ojo.esfera ?? 0, cilindro: ojo.cilindro ?? 0, eje: ojo.eje });
  return { esfera: normalizada.esfera, cilindro: normalizada.cilindro, eje: normalizada.eje, adicion: ojo.adicion };
}

export function compatibleConRango(od: OjoReceta, oi: OjoReceta, vision: string, rango: ReglaRango): boolean {
  const ojos = [normalizarOjo(od), normalizarOjo(oi)];
  if (ojos.some((ojo) => ojo === null)) return false;
  return ojos.every((ojo) => {
    if (!ojo || ojo.esfera < rango.esfera_min || ojo.esfera > rango.esfera_max || ojo.cilindro < rango.cilindro_min || ojo.cilindro > rango.cilindro_max) return false;
    return vision === "monofocal"
      ? ojo.adicion === null
      : ojo.adicion !== null && rango.adicion_min !== null && rango.adicion_max !== null && ojo.adicion >= rango.adicion_min && ojo.adicion <= rango.adicion_max;
  });
}

export function precioTotal(precio: number, unidad: "por_luna" | "por_par"): number {
  return Math.round(precio * (unidad === "por_luna" ? 2 : 1) * 100) / 100;
}

export function hayStockExactoParaPar(od: OjoReceta, oi: OjoReceta, porLado: boolean, variantes: VarianteDisponible[]): boolean {
  const medidas = [normalizarOjo(od), normalizarOjo(oi)];
  const medidaOd = medidas[0];
  const medidaOi = medidas[1];
  if (medidaOd === null || medidaOi === null) return false;
  const halladas = [medidaOd, medidaOi].map((m, index) => variantes.find((v) =>
    Number(v.esfera) === m.esfera && Number(v.cilindro) === m.cilindro &&
    (m.cilindro === 0 ? v.eje === null : v.eje === m.eje) &&
    (Number(v.adicion ?? 0) === Number(m.adicion ?? 0)) &&
    (porLado ? v.lado === (index === 0 ? "OD" : "OI") : v.lado === null) &&
    Number(v.stock) - Number(v.reservado) > 0,
  ));
  if (!halladas[0] || !halladas[1]) return false;
  if (halladas[0].id === halladas[1].id) return Number(halladas[0].stock) - Number(halladas[0].reservado) >= 2;
  return true;
}
