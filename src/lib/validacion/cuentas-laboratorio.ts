import { z } from "zod";
import { MEDIOS_PAGO_LAB } from "@/lib/laboratorios/cuentas";
import { hoyLimaISO, textoOpcional } from "./comun";
import { leerImporte } from "./orden";

const importe = (nombre: string, minimo = 0.01) =>
  z.preprocess(
    leerImporte,
    z
      .number(`Escribe ${nombre} en soles (máximo 2 decimales)`)
      .min(minimo, minimo > 0 ? `${nombre[0].toUpperCase()}${nombre.slice(1)} debe ser mayor que cero` : "No puede ser negativo")
      .max(9_999_999, "El importe es demasiado alto"),
  );

const fechaPasada = (mensaje: string) =>
  z.iso.date(mensaje).refine((f) => f <= hoyLimaISO(), "La fecha no puede estar en el futuro");

/** Lista en JSON que arma el formulario (órdenes de un ticket o tickets de un pago). */
const listaJson = <T extends z.ZodTypeAny>(item: T, vacia: string) =>
  z.preprocess((v) => {
    if (typeof v !== "string" || v.trim() === "") return [];
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }, z.array(item, "Lista inválida").min(1, vacia));

export const esquemaTicket = z
  .object({
    laboratorio_id: z.uuid("Elige el laboratorio"),
    numero_ticket: z.string().trim().min(1, "Escribe el número del ticket").max(40, "Máximo 40 caracteres"),
    fecha: fechaPasada("Elige la fecha del ticket"),
    fecha_vencimiento: z.iso.date("Elige la fecha de vencimiento"),
    monto_total: importe("el monto total"),
    observaciones: textoOpcional(500),
    ordenes: listaJson(
      z.object({ orden_id: z.uuid(), monto: z.preprocess(leerImporte, z.number("Costo inválido").min(0).max(9_999_999)) }),
      "Agrega al menos una orden al ticket",
    ),
    confirmar_duplicado: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  })
  .refine((d) => d.fecha_vencimiento >= d.fecha, { message: "El vencimiento no puede ser antes de la fecha del ticket", path: ["fecha_vencimiento"] });

export const esquemaEdicionTicket = z.object({
  fecha_vencimiento: z.iso.date("Elige la fecha de vencimiento"),
  monto_total: importe("el monto total"),
  observaciones: textoOpcional(500),
});

export const esquemaPagoLab = z.object({
  laboratorio_id: z.uuid("Elige el laboratorio"),
  fecha: fechaPasada("Elige la fecha del pago"),
  medio: z.enum(MEDIOS_PAGO_LAB, "Elige cómo se pagó"),
  numero_operacion: textoOpcional(60),
  observaciones: textoOpcional(500),
  aplicaciones: listaJson(
    z.object({ ticket_id: z.uuid(), monto: z.preprocess(leerImporte, z.number("Monto inválido").min(0).max(9_999_999)) }),
    "Indica cuánto pagas de cada ticket",
  ).refine((l) => l.some((a) => a.monto > 0), "Indica cuánto pagas de al menos un ticket"),
});

export const esquemaAnulacion = z.object({
  motivo: z.string().trim().min(3, "Escribe el motivo (mínimo 3 caracteres)").max(300, "Máximo 300 caracteres"),
});

export const esquemaAperturaCaja = z.object({ monto_inicial: importe("el monto inicial", 0) });
export const esquemaCierreCaja = z.object({ monto_contado: importe("el monto contado", 0), observaciones: textoOpcional(300) });

export const esquemaEgreso = z.object({
  fecha: fechaPasada("Elige la fecha del egreso"),
  monto: importe("el monto"),
  categoria: z.enum(["servicios", "alquiler", "sueldos", "movilidad", "compras", "otros"], "Elige la categoría"),
  concepto: z.string().trim().min(1, "Describe el egreso (p. ej. Luz de octubre)").max(300, "Máximo 300 caracteres"),
  medio: z.enum(["efectivo_caja", "yape", "plin", "transferencia", "tarjeta", "otro"], "Elige cómo se pagó"),
  numero_comprobante: textoOpcional(60),
});
