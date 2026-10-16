import { z } from "zod";

/** Fecha de hoy en formato AAAA-MM-DD (misma convención que current_date en la base). */
export const hoyISO = () => new Date().toISOString().slice(0, 10);

/** Texto opcional: recorta espacios y convierte "" en null. */
export const textoOpcional = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
    z.string().max(max, `Máximo ${max} caracteres`).nullable(),
  );

/** Texto obligatorio recortado. */
export const textoObligatorio = (mensaje: string, max: number) =>
  z.string().trim().min(1, mensaje).max(max, `Máximo ${max} caracteres`);

/** Fecha AAAA-MM-DD opcional que no puede estar en el futuro. */
export const fechaPasadaOpcional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
  z.iso
    .date("Fecha inválida")
    .refine((f) => f <= hoyISO(), "La fecha no puede estar en el futuro")
    .nullable(),
);

/** Valores del formulario como texto, para volver a llenarlo si hay errores. */
export const valoresDe = (datos: FormData) =>
  Object.fromEntries([...datos.entries()].filter(([k, v]) => !k.startsWith("$") && typeof v === "string")) as Record<
    string,
    string
  >;
