import { z } from "zod";
import { fechaPasadaOpcional, textoObligatorio, textoOpcional } from "./comun";

export const TIPOS_DOCUMENTO = ["DNI", "CE", "PASAPORTE"] as const;

/** Reglas alineadas con las restricciones de la tabla `pacientes`. */
export const esquemaPaciente = z
  .object({
    nombres: textoObligatorio("Escribe los nombres", 100),
    apellidos: textoObligatorio("Escribe los apellidos", 100),
    tipo_documento: z.enum(TIPOS_DOCUMENTO, "Tipo de documento inválido"),
    numero_documento: z.preprocess(
      (v) => (typeof v === "string" && v.trim() !== "" ? v.replace(/\s/g, "").toUpperCase() : null),
      z.string().max(20, "Máximo 20 caracteres").nullable(),
    ),
    fecha_nacimiento: fechaPasadaOpcional,
    telefono: textoOpcional(30),
    email: z.preprocess(
      (v) => (typeof v === "string" && v.trim() !== "" ? v.trim().toLowerCase() : null),
      z.email("Correo inválido").nullable(),
    ),
    notas: textoOpcional(1000),
    // Checkbox: llega "on" si está marcado y no llega si no.
    acepta_whatsapp: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
    // Recordatorios de control (marketing): consentimiento aparte del aviso "lentes listos".
    acepta_recordatorios: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  })
  .superRefine((p, ctx) => {
    if (!p.numero_documento) return;
    const reglas: Record<(typeof TIPOS_DOCUMENTO)[number], [RegExp, string]> = {
      DNI: [/^[0-9]{8}$/, "El DNI tiene 8 dígitos"],
      CE: [/^[0-9A-Z]{6,12}$/, "Carné de extranjería inválido"],
      PASAPORTE: [/^[0-9A-Z]{5,20}$/, "Pasaporte inválido"],
    };
    const [patron, mensaje] = reglas[p.tipo_documento];
    if (!patron.test(p.numero_documento)) ctx.addIssue({ code: "custom", path: ["numero_documento"], message: mensaje });
  });

export type DatosPaciente = z.infer<typeof esquemaPaciente>;
