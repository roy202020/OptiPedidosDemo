import { normalizarCelularPe } from "@/lib/telefono";

/**
 * Aviso manual de "lentes listos" por wa.me (plan Básico, sin WhatsApp por API).
 * Módulo puro: se prueba sin base de datos.
 */

export function mensajeLentesListos(paciente: { nombres: string }, orden: string, remitente: string): string {
  const nombre = paciente.nombres.trim().split(/\s+/)[0];
  return [
    `Hola, ${nombre}. Te saluda ${remitente}.`,
    `Tus lentes de la orden ${orden} ya están listos. Puedes recogerlos en nuestro local.`,
    "¡Te esperamos!",
  ].join("\n\n");
}

/** Enlace wa.me al celular del paciente, o null si no tiene un celular peruano válido. */
export function enlaceLentesListos(
  paciente: { nombres: string; telefono: string | null },
  orden: string,
  remitente: string,
): string | null {
  const celular = normalizarCelularPe(paciente.telefono);
  return celular ? `https://wa.me/${celular}?text=${encodeURIComponent(mensajeLentesListos(paciente, orden, remitente))}` : null;
}
