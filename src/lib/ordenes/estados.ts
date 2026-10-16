import type { Tono } from "@/components/ui";

/**
 * Estados de las órdenes. La base guarda el estado interno (enum estado_orden) y la interfaz
 * muestra el estado comercial. El mapeo es el mismo que public.estado_comercial() en la base
 * (migración 0003); si cambia uno, debe cambiar el otro.
 */
export const ESTADOS_INTERNOS = [
  "borrador",
  "enviada",
  "recibida_lab",
  "en_proceso",
  "lista",
  "recibida_optica",
  "entregada",
  "anulada",
] as const;
export type EstadoInterno = (typeof ESTADOS_INTERNOS)[number];

export const ESTADOS_COMERCIALES = ["venta_iniciada", "en_laboratorio", "listo_entrega", "entregado", "anulado"] as const;
export type EstadoComercial = (typeof ESTADOS_COMERCIALES)[number];

export const COMERCIAL_DE: Record<EstadoInterno, EstadoComercial> = {
  borrador: "venta_iniciada",
  enviada: "en_laboratorio",
  recibida_lab: "en_laboratorio",
  en_proceso: "en_laboratorio",
  lista: "en_laboratorio",
  recibida_optica: "listo_entrega",
  entregada: "entregado",
  anulada: "anulado",
};

export const INTERNOS_DE = Object.fromEntries(
  ESTADOS_COMERCIALES.map((c) => [c, ESTADOS_INTERNOS.filter((i) => COMERCIAL_DE[i] === c)]),
) as Record<EstadoComercial, EstadoInterno[]>;

export const COMERCIAL: Record<EstadoComercial, { texto: string; tono: Tono }> = {
  venta_iniciada: { texto: "Venta iniciada", tono: "neutro" },
  en_laboratorio: { texto: "En el laboratorio", tono: "azul" },
  listo_entrega: { texto: "Listo para entrega", tono: "verde" },
  entregado: { texto: "Entregado", tono: "violeta" },
  anulado: { texto: "Anulado", tono: "rojo" },
};

/** Detalle del subestado (solo se muestra cuando aporta información). */
export const SUBESTADO: Record<EstadoInterno, string> = {
  borrador: "Venta iniciada",
  enviada: "Enviada al laboratorio",
  recibida_lab: "Recibida por el laboratorio",
  en_proceso: "En proceso en el laboratorio",
  lista: "Terminada en el laboratorio",
  recibida_optica: "Lista para entrega",
  entregada: "Entregada al paciente",
  anulada: "Anulada",
};

/** Texto del botón para pasar a cada estado. */
export const ACCION_HACIA: Record<EstadoInterno, string> = {
  borrador: "Devolver a venta iniciada",
  enviada: "Enviar al laboratorio",
  recibida_lab: "Recibida por el laboratorio",
  en_proceso: "En proceso",
  lista: "Terminada en el laboratorio",
  recibida_optica: "Lista para entrega",
  entregada: "Entregar al paciente",
  anulada: "Anular orden",
};

/** Estados en los que el trabajo todavía no llegó a la óptica: aquí cuenta el atraso. */
export const PENDIENTES_DE_LLEGAR: EstadoInterno[] = ["borrador", "enviada", "recibida_lab", "en_proceso", "lista"];
/** Órdenes activas: todo lo que no está entregado ni anulado. */
export const ACTIVOS: EstadoInterno[] = [...PENDIENTES_DE_LLEGAR, "recibida_optica"];

/**
 * Una orden está atrasada si su fecha prometida ya pasó y el trabajo aún no llegó a la óptica.
 * Las órdenes listas para entrega no se consideran atrasadas: esperan al paciente.
 */
export function estaAtrasada(estado: EstadoInterno, fechaPrometida: string | null, hoy: string): boolean {
  return Boolean(fechaPrometida && fechaPrometida < hoy && PENDIENTES_DE_LLEGAR.includes(estado));
}

export const TIPOS_TRABAJO = { lentes_completos: "Lentes completos", solo_lunas: "Solo lunas" } as const;
export const ORIGENES_MONTURA = { optica: "De la óptica", paciente: "Del paciente" } as const;
export const PRIORIDADES = { normal: "Normal", urgente: "Urgente" } as const;
export const DISENOS = { monofocal: "Monofocal", bifocal: "Bifocal", progresivo: "Progresivo", ocupacional: "Ocupacional" } as const;
export const TRATAMIENTOS = {
  antirreflejo: "Antirreflejo",
  filtro_azul: "Filtro de luz azul",
  fotocromatico: "Fotocromático",
  polarizado: "Polarizado",
  endurecido: "Endurecido",
  uv: "Protección UV",
} as const;

/** Número de orden con ceros a la izquierda: 7 → "0007". */
export const numeroOrden = (n: number) => `#${String(n).padStart(4, "0")}`;
