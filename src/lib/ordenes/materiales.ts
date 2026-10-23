/** Índices nominales del selector de pedidos; no son reglas de stock ni de graduación.
 * Referencias: ZEISS (materiales orgánicos/minerales) y Mitsui Chemicals (resinas).
 */
export const INDICES_POR_MATERIAL: Record<string, readonly string[]> = {
  "CR-39": ["1.50"],
  Policarbonato: ["1.59"],
  Trivex: ["1.53"],
  "Resina de alto índice": ["1.56", "1.60", "1.61", "1.67", "1.70", "1.74"],
  "Cristal mineral": ["1.50", "1.60", "1.70", "1.80", "1.90"],
};
export const MATERIALES_LUNA = Object.keys(INDICES_POR_MATERIAL);

export function indicesParaMaterial(material: string): readonly string[] | undefined {
  if (!material.trim()) return [];
  const clave = MATERIALES_LUNA.find(nombre => nombre.toLocaleLowerCase() === material.trim().toLocaleLowerCase());
  return clave ? INDICES_POR_MATERIAL[clave] : undefined;
}

/** Al cambiar material conserva un índice compatible, elige el único o pide elegir de nuevo. */
export function indiceAlCambiarMaterial(material: string, anterior: string): string {
  const indices = indicesParaMaterial(material);
  if (!indices) return "";
  if (indices.length === 1) return indices[0];
  return indices.includes(anterior) ? anterior : "";
}

export function indiceCompatible(material: string | null, indice: number | null): boolean {
  if (!material || indice == null) return true;
  const indices = indicesParaMaterial(material);
  // Los materiales históricos ajenos al selector conservan su configuración existente.
  return !indices || indices.includes(indice.toFixed(2));
}
