import type { Tono } from "@/components/ui";
import { fecha } from "@/lib/formato";

/**
 * Recordatorios de control visual: estado de cada paciente en la lista del mes y mensaje
 * para el envío manual (wa.me). Módulo puro: se prueba sin base de datos.
 */

export type FilaRecordatorio = {
  paciente_id: string;
  nombres: string;
  apellidos: string;
  telefono: string | null;
  celular: string | null;
  receta_id: string;
  fecha_examen: string;
  vence_en: string;
  sede_id: string;
  sede: string;
  sede_con_whatsapp: boolean;
  acepta: boolean;
  de_baja: boolean;
  envio_estado: "pendiente" | "enviado" | "fallido" | "entregado" | null;
  envio_canal: "automatico" | "manual" | null;
  enviado_en: string | null;
};

export type EstadoFila = { texto: string; tono: Tono; puedeEnviar: boolean; motivo?: string };

/** Qué mostrar en la lista y si se puede enviar el recordatorio manual. */
export function estadoRecordatorio(f: FilaRecordatorio): EstadoFila {
  if (f.envio_estado === "entregado") return { texto: "Entregado", tono: "verde", puedeEnviar: false };
  if (f.envio_estado === "enviado") {
    return { texto: f.envio_canal === "manual" ? "Enviado (manual)" : "Enviado", tono: "azul", puedeEnviar: false };
  }
  if (f.envio_estado === "pendiente") return { texto: "Enviándose", tono: "azul", puedeEnviar: false };
  if (f.de_baja) return { texto: "Se dio de baja", tono: "rojo", puedeEnviar: false, motivo: "Pidió no recibir recordatorios" };
  if (!f.acepta) return { texto: "Sin consentimiento", tono: "neutro", puedeEnviar: false, motivo: "No autorizó recordatorios" };
  if (!f.celular) return { texto: "Sin celular", tono: "ambar", puedeEnviar: false, motivo: "Registra un celular válido de Perú" };
  if (f.envio_estado === "fallido") return { texto: "Falló el envío", tono: "rojo", puedeEnviar: true };
  return { texto: "Por recordar", tono: "ambar", puedeEnviar: true };
}

/** Mensaje del recordatorio para enviar desde el WhatsApp de la sede. Incluye cómo darse de baja. */
export function mensajeRecordatorio(f: Pick<FilaRecordatorio, "nombres" | "fecha_examen">, remitente: string): string {
  return [
    `Hola, ${f.nombres}. Te saluda ${remitente}.`,
    `Tu último control visual fue el ${fecha(f.fecha_examen)} y ya es momento del siguiente. Revisar tu vista cada año ayuda a detectar cambios a tiempo.`,
    "Respóndenos para separar tu cita.",
    "Si no deseas recibir más recordatorios, responde BAJA.",
  ].join("\n\n");
}

export const enlaceRecordatorio = (f: FilaRecordatorio, remitente: string) =>
  `https://wa.me/${f.celular}?text=${encodeURIComponent(mensajeRecordatorio(f, remitente))}`;
