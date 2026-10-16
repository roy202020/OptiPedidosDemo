import { z } from "zod";
import { textoOpcional } from "./comun";

export const ROLES = ["propietario", "administrador", "operador"] as const;

/** Datos de la óptica (alineado con las restricciones de la tabla opticas). */
export const esquemaOptica = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre de la óptica").max(120, "Máximo 120 caracteres"),
  ruc: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.replace(/\s/g, "") : null),
    z.string().regex(/^[0-9]{11}$/, "El RUC tiene 11 dígitos").nullable(),
  ),
  telefono: textoOpcional(30),
  direccion: textoOpcional(200),
});

export const esquemaNuevoMiembro = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Escribe un correo válido")),
  rol: z.enum(ROLES, "Rol inválido"),
});

export const esquemaRol = z.enum(ROLES, "Rol inválido");

/** Datos de una sede (alineado con las restricciones de la tabla sedes). */
export const esquemaSede = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre de la sede").max(80, "Máximo 80 caracteres"),
  direccion: textoOpcional(200),
  telefono: textoOpcional(30),
  whatsapp_phone_number_id: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.replace(/\s/g, "") : null),
    z.string().regex(/^[0-9]{5,30}$/, "Es el número largo («Phone number ID») que da Meta: solo dígitos").nullable(),
  ),
});

/** Sedes marcadas para un usuario (casillas con el mismo nombre). */
export const esquemaAsignacion = z.array(z.uuid("Sede inválida")).max(200);
