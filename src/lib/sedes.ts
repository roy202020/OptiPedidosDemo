/**
 * Reglas puras de la sede elegida (sin servidor: se prueban con vitest).
 * La cookie del selector es solo una preferencia; la base valida el acceso con RLS.
 */

/** Valor del selector para ver todas las sedes del usuario a la vez (solo lectura e informes). */
export const TODAS_LAS_SEDES = "todas";

type SedeMinima = { id: string; activa: boolean };

/**
 * Sede actual según la cookie: la elegida si el usuario la puede ver; null ("todas") solo si
 * ve más de una; si no, su primera sede activa (o la primera, o null si no tiene ninguna).
 */
export function resolverSede<S extends SedeMinima>(sedes: S[], valor: string | undefined): S | null {
  if (valor === TODAS_LAS_SEDES && sedes.length > 1) return null;
  return sedes.find((s) => s.id === valor) ?? sedes.find((s) => s.activa) ?? sedes[0] ?? null;
}

/**
 * Sede donde se registra algo nuevo. Con "todas" elegido solo sirve si hay una única sede activa.
 */
export function sedeDeRegistro<S extends SedeMinima & { nombre: string }>(
  sedes: S[],
  actual: S | null,
): { sede: S; error?: undefined } | { sede?: undefined; error: string } {
  const activas = sedes.filter((s) => s.activa);
  const sede = actual ?? (activas.length === 1 ? activas[0] : undefined);
  if (!sede) {
    return {
      error: sedes.length
        ? "Elige una sede en el selector de arriba para registrar."
        : "No tienes sedes asignadas. Pide al propietario que te asigne una.",
    };
  }
  if (!sede.activa) return { error: `La sede ${sede.nombre} está desactivada: elige otra en el selector de arriba.` };
  return { sede };
}
