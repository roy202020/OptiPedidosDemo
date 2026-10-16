type ErrorPostgrest = { code?: string; message?: string; details?: string };

/**
 * Traduce errores de PostgREST/PostgreSQL a mensajes para el usuario.
 * `unicos` permite dar un mensaje propio por cada restricción UNIQUE.
 */
export function mensajeDb(error: ErrorPostgrest, unicos: Record<string, string> = {}): string {
  switch (error.code) {
    case "23505": {
      const restriccion = Object.keys(unicos).find((k) => error.message?.includes(k));
      return restriccion ? unicos[restriccion] : "Ya existe un registro con esos datos.";
    }
    case "23514":
    case "23502":
      return "Algún dato está fuera de rango o falta. Revisa el formulario.";
    case "42501":
      return "No tienes permiso para hacer esto.";
    case "P0001":
      // Mensajes de las reglas de negocio (raise exception) ya vienen en español.
      return error.message ?? "La operación no está permitida.";
    default:
      return "No se pudo guardar. Inténtalo de nuevo.";
  }
}
