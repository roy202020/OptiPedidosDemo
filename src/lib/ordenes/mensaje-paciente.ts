import { normalizarCelularPe } from "@/lib/telefono";

/**
 * Mensajes manuales al paciente por wa.me: "lentes listos", recordatorio de saldo y recibo de cobro.
 * Módulo puro: se prueba sin base de datos.
 */

/** Importe para mensajes de WhatsApp: "S/ 120.00" con espacio normal (no el de Intl). */
export const importeTexto = (n: number) => `S/ ${n.toFixed(2)}`;

const primerNombre = (nombres: string) => nombres.trim().split(/\s+/)[0];

/** Enlace wa.me a un celular peruano, o null si no es válido. */
export function enlaceWhatsApp(telefono: string | null | undefined, texto: string): string | null {
  const celular = normalizarCelularPe(telefono);
  return celular ? `https://wa.me/${celular}?text=${encodeURIComponent(texto)}` : null;
}

/**
 * Aviso manual de "lentes listos" (plan Básico, sin WhatsApp por API).
 * `enlace` es la consulta pública del estado del pedido (/estado/{codigo}), si se tiene.
 * Si queda saldo, el mensaje lo indica.
 */
export function mensajeLentesListos(
  paciente: { nombres: string },
  orden: string,
  remitente: string,
  enlace?: string | null,
  saldo = 0,
): string {
  return [
    `Hola, ${primerNombre(paciente.nombres)}. Te saluda ${remitente}.`,
    `Tus lentes de la orden ${orden} ya están listos. Puedes recogerlos en nuestro local.`,
    ...(saldo > 0 ? [`Saldo pendiente: ${importeTexto(saldo)}.`] : []),
    ...(enlace ? [`Consulta el estado de tu pedido aquí: ${enlace}`] : []),
    "¡Te esperamos!",
  ].join("\n\n");
}

/** Enlace wa.me al celular del paciente, o null si no tiene un celular peruano válido. */
export function enlaceLentesListos(
  paciente: { nombres: string; telefono: string | null },
  orden: string,
  remitente: string,
  enlace?: string | null,
  saldo = 0,
): string | null {
  return enlaceWhatsApp(paciente.telefono, mensajeLentesListos(paciente, orden, remitente, enlace, saldo));
}

/** Recordatorio manual del saldo de un pedido (reporte "Saldos pendientes"). */
export function mensajeRecordatorioSaldo(paciente: { nombres: string }, orden: string, saldo: number, remitente: string, listo: boolean): string {
  return [
    `Hola, ${primerNombre(paciente.nombres)}. Te saluda ${remitente}.`,
    listo
      ? `Tus lentes de la orden ${orden} están listos y queda un saldo pendiente de ${importeTexto(saldo)}.`
      : `Te recordamos que tu pedido ${orden} tiene un saldo pendiente de ${importeTexto(saldo)}.`,
    "Puedes pagarlo en el local, por Yape o Plin. Si ya lo pagaste, ignora este mensaje. ¡Gracias!",
  ].join("\n\n");
}

export type DatosRecibo = {
  optica: string;
  sede: string;
  orden: string;
  paciente: string;
  fecha: string;
  importe: number;
  medio: string;
  numeroOperacion: string | null;
  total: number;
  /** Cobros vigentes registrados antes de este. */
  pagadoAntes: number;
};

/** Pagado acumulado y saldo restante después de este cobro. */
export function saldoTrasCobro(r: Pick<DatosRecibo, "importe" | "total" | "pagadoAntes">) {
  const pagado = Math.round((r.pagadoAntes + r.importe) * 100) / 100;
  return { pagado, saldo: Math.max(0, Math.round((r.total - pagado) * 100) / 100) };
}

/** Recibo de cobro en texto, para compartir por WhatsApp. */
export function textoRecibo(r: DatosRecibo): string {
  const { pagado, saldo } = saldoTrasCobro(r);
  return [
    `*Recibo de pago · ${r.optica}*`,
    `Sede ${r.sede} · ${r.fecha}`,
    `Orden ${r.orden} · ${r.paciente}`,
    `Monto pagado: ${importeTexto(r.importe)} (${r.medio}${r.numeroOperacion ? `, op. ${r.numeroOperacion}` : ""})`,
    `Total del pedido: ${importeTexto(r.total)} · Pagado a la fecha: ${importeTexto(pagado)}`,
    saldo > 0 ? `*Saldo pendiente: ${importeTexto(saldo)}*` : "*Pedido pagado por completo.*",
    "¡Gracias por tu preferencia!",
  ].join("\n");
}
