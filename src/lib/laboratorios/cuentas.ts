/**
 * OptiPedidos · Cuentas con los laboratorios: estados, alertas y textos. Módulo puro (sin base de datos);
 * las reglas son las mismas de la migración 0013 y la base las vuelve a validar.
 */
import { soles } from "@/lib/formato";

export type EstadoPago = "pendiente" | "parcial" | "pagado" | "anulado";
export type EstadoVencimiento = "al_dia" | "por_vencer" | "vencido";
export type Tono = "neutro" | "azul" | "verde" | "ambar" | "rojo" | "violeta";

export const ESTADO_PAGO: Record<EstadoPago, { texto: string; tono: Tono }> = {
  pendiente: { texto: "Pendiente", tono: "ambar" },
  parcial: { texto: "Pago parcial", tono: "azul" },
  pagado: { texto: "Pagado", tono: "verde" },
  anulado: { texto: "Anulado", tono: "neutro" },
};

export const ESTADO_VENCIMIENTO: Record<EstadoVencimiento, { texto: string; tono: Tono }> = {
  al_dia: { texto: "Al día", tono: "verde" },
  por_vencer: { texto: "Por vencer", tono: "ambar" },
  vencido: { texto: "Vencido", tono: "rojo" },
};

export const MEDIOS_PAGO_LAB = ["efectivo_caja", "yape", "plin", "transferencia", "otro"] as const;
export type MedioPagoLab = (typeof MEDIOS_PAGO_LAB)[number];
export const NOMBRE_MEDIO_LAB: Record<MedioPagoLab, string> = {
  efectivo_caja: "Efectivo de caja",
  yape: "Yape",
  plin: "Plin",
  transferencia: "Transferencia",
  otro: "Otro",
};

/** Días de anticipación para "por vencer" (igual que lab_estado_vencimiento en la base). */
export const DIAS_POR_VENCER = 2;

/** Suma días a una fecha AAAA-MM-DD sin pasar por zonas horarias. */
export function sumarDiasISO(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Vencimiento sugerido: fecha del ticket + días de crédito del laboratorio. */
export const vencimientoSugerido = (fecha: string, diasCredito: number) => sumarDiasISO(fecha, Math.max(0, diasCredito));

/** Estado de vencimiento de lo que se debe (un ticket pagado nunca está vencido). */
export function estadoVencimiento(vence: string, deuda: number, hoy: string): EstadoVencimiento {
  if (deuda <= 0) return "al_dia";
  if (vence < hoy) return "vencido";
  return diasHasta(hoy, vence) <= DIAS_POR_VENCER ? "por_vencer" : "al_dia";
}

/** Días de `desde` a `hasta` (AAAA-MM-DD). */
export function diasHasta(desde: string, hasta: string): number {
  const ms = (iso: string) => {
    const [a, m, d] = iso.split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((ms(hasta) - ms(desde)) / 86_400_000);
}

/** Diferencia entre el total del ticket y la suma de sus órdenes (0 = cuadra). */
export function diferenciaOrdenes(total: number, montos: number[]): number {
  const suma = montos.reduce((s, m) => s + (Number.isFinite(m) ? m : 0), 0);
  return Math.round((total - suma) * 100) / 100;
}

export type FilaDeuda = {
  laboratorio_id: string;
  laboratorio: string;
  fecha_vencimiento: string;
  dias_para_vencer: number;
  estado: string;
  deuda: number;
  /** Tickets pendientes con ese vencimiento. */
  tickets?: number;
};

export type AlertaDeuda = { laboratorioId: string; tipo: "vencido" | "por_vencer"; dias: number; monto: number; texto: string };

/** Cuándo vence, en palabras: "vencen hoy", "vencen mañana", "vencidos hace 3 días". */
export function cuandoVence(dias: number): string {
  if (dias < -1) return `vencidos hace ${-dias} días`;
  if (dias === -1) return "vencidos ayer";
  if (dias === 0) return "vencen hoy";
  if (dias === 1) return "vencen mañana";
  return `vencen en ${dias} días`;
}

/**
 * Alertas del panel: montos vencidos y por vencer, agrupados por laboratorio y día de vencimiento.
 * Primero lo vencido (el más antiguo arriba), luego lo que vence antes.
 */
export function alertasDeuda(filas: FilaDeuda[]): AlertaDeuda[] {
  const grupos = new Map<string, AlertaDeuda & { nombre: string }>();
  for (const f of filas) {
    if (f.estado !== "vencido" && f.estado !== "por_vencer") continue;
    const clave = `${f.laboratorio_id}|${f.dias_para_vencer}`;
    const g = grupos.get(clave) ?? {
      laboratorioId: f.laboratorio_id,
      nombre: f.laboratorio,
      tipo: f.estado,
      dias: f.dias_para_vencer,
      monto: 0,
      texto: "",
    };
    g.monto = Math.round((g.monto + Number(f.deuda)) * 100) / 100;
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map(({ nombre, ...g }) => ({ ...g, texto: `${nombre}: ${soles(g.monto)} ${cuandoVence(g.dias)}` }))
    .sort((a, b) => a.dias - b.dias || b.monto - a.monto);
}

/** Total de deuda (lo pendiente de todos los tickets vigentes). */
export const deudaTotal = (filas: Pick<FilaDeuda, "deuda">[]) => Math.round(filas.reduce((s, f) => s + Number(f.deuda), 0) * 100) / 100;
