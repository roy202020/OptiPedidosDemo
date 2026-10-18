/**
 * OptiPedidos · Planes y suscripción. Reglas puras (sin base de datos) que repiten las de la
 * migración 0012: el estado depende solo de `vence_el` (y la base vuelve a validarlo todo).
 */

export type Plan = "basico" | "profesional";
export type EstadoSuscripcion = "activa" | "gracia" | "suspendida";
export type FuncionPlan = "metas" | "whatsapp_api" | "recordatorios";

export const PLANES: readonly Plan[] = ["basico", "profesional"];
export const NOMBRE_PLAN: Record<Plan, string> = { basico: "Básico", profesional: "Profesional" };
export const NOMBRE_ESTADO: Record<EstadoSuscripcion, string> = { activa: "Activa", gracia: "En gracia", suspendida: "Suspendida" };
export const TONO_ESTADO = { activa: "verde", gracia: "ambar", suspendida: "rojo" } as const;
export const MEDIOS_PAGO = ["yape", "transferencia"] as const;
export const NOMBRE_MEDIO: Record<(typeof MEDIOS_PAGO)[number], string> = { yape: "Yape", transferencia: "Transferencia" };

/** Días de aviso antes del vencimiento y de gracia después. */
export const DIAS_AVISO = 5;
export const DIAS_GRACIA = 7;

export const TEXTO_PROFESIONAL = "Disponible en plan Profesional";

/** Días de `desde` a `hasta` (fechas AAAA-MM-DD, sin zonas horarias). */
export function diasEntre(desde: string, hasta: string): number {
  const ms = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((ms(hasta) - ms(desde)) / 86_400_000);
}

/** Suma días a una fecha AAAA-MM-DD. */
export function sumarDias(iso: string, dias: number): string {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + dias));
  return d.toISOString().slice(0, 10);
}

/** Igual que estado_suscripcion_de() en la base. */
export function estadoSuscripcion(vence: string | null, hoy: string): EstadoSuscripcion {
  if (!vence) return "activa";
  const pasados = diasEntre(vence, hoy);
  if (pasados <= 0) return "activa";
  return pasados <= DIAS_GRACIA ? "gracia" : "suspendida";
}

export type AvisoSuscripcion = { tipo: "aviso" | "error"; titulo: string; texto: string };

/** Aviso para la óptica: desde 5 días antes, durante la gracia y en solo lectura. */
export function avisoSuscripcion(vence: string | null, hoy: string): AvisoSuscripcion | null {
  if (!vence) return null;
  const faltan = diasEntre(hoy, vence);
  const estado = estadoSuscripcion(vence, hoy);
  if (estado === "suspendida") {
    return {
      tipo: "error",
      titulo: "Suscripción suspendida: modo solo lectura",
      texto: "Puedes ver y exportar tus datos, pero no registrar cambios. Renueva para continuar; no se borra nada.",
    };
  }
  if (estado === "gracia") {
    const quedan = DIAS_GRACIA + faltan;
    return {
      tipo: "error",
      titulo: "Tu suscripción venció",
      texto: `Tienes ${quedan} ${quedan === 1 ? "día" : "días"} de gracia. Después la óptica pasará a solo lectura hasta que renueves.`,
    };
  }
  if (faltan <= DIAS_AVISO) {
    const cuando = faltan === 0 ? "hoy" : faltan === 1 ? "mañana" : `en ${faltan} días`;
    return {
      tipo: "aviso",
      titulo: `Tu suscripción vence ${cuando}`,
      texto: "Renueva a tiempo para no interrumpir el registro de órdenes y ventas.",
    };
  }
  return null;
}

/** Límite en texto: null = sin límite. */
export const limite = (n: number | null | undefined, sinLimite = "Sin límite") => (n == null ? sinLimite : String(n));

export type FiltroOpticas = "todas" | "por-vencer" | "gracia" | "suspendidas";

/** Filtro del panel del superadmin: "por vencer" = activas que vencen en 5 días o menos. */
export function coincideFiltro(o: { estado: string; dias_para_vencer: number | null }, filtro: FiltroOpticas): boolean {
  switch (filtro) {
    case "por-vencer":
      return o.estado === "activa" && o.dias_para_vencer != null && o.dias_para_vencer <= DIAS_AVISO;
    case "gracia":
      return o.estado === "gracia";
    case "suspendidas":
      return o.estado === "suspendida";
    default:
      return true;
  }
}
