import { z } from "zod";
import { MEDIOS_PAGO, PLANES } from "@/lib/suscripcion";
import { textoOpcional } from "./comun";

const fecha = (mensaje: string) => z.iso.date(mensaje);

/** Entero positivo opcional: vacío = el valor del plan (o sin límite). */
const limiteOpcional = (nombre: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : null),
    z.number(`Escribe ${nombre} como número`).int(`${nombre} debe ser entero`).min(0).max(100_000).nullable(),
  );

export const esquemaNuevaOptica = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre de la óptica").max(120, "Máximo 120 caracteres"),
  email: z.string().trim().toLowerCase().pipe(z.email("Escribe un correo válido")),
  plan: z.enum(PLANES, "Plan inválido"),
  vence_el: fecha("Elige la fecha de vencimiento"),
  max_sedes: limiteOpcional("Las sedes"),
});

export const esquemaCambioPlan = z.object({
  plan: z.enum(PLANES, "Plan inválido"),
  max_usuarios: limiteOpcional("Los usuarios"),
  max_sedes: limiteOpcional("Las sedes"),
  whatsapp_mensual: limiteOpcional("El tope de WhatsApp"),
  nota: textoOpcional(300),
});

export const esquemaExtension = z.object({
  vence_el: fecha("Elige la nueva fecha de vencimiento"),
  nota: textoOpcional(300),
});

export const esquemaPagoSuscripcion = z
  .object({
    monto: z.preprocess(
      (v) => (typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : undefined),
      z.number("Escribe el monto en soles").positive("El monto debe ser mayor que cero").max(1_000_000, "El monto es demasiado alto"),
    ),
    fecha: fecha("Elige la fecha del pago"),
    medio: z.enum(MEDIOS_PAGO, "Elige Yape o transferencia"),
    periodo_desde: fecha("Elige el inicio del periodo"),
    periodo_hasta: fecha("Elige el fin del periodo"),
    nota: textoOpcional(300),
    extender: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  })
  .refine((d) => d.periodo_hasta >= d.periodo_desde, { message: "El periodo termina antes de empezar", path: ["periodo_hasta"] });
