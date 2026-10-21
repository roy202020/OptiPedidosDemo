import type { EstadoInterno } from "@/lib/ordenes/estados";

/**
 * Consulta pública del estado del pedido (cliente final, sin sesión).
 * Módulo puro: se prueba sin base de datos. La base genera y valida el código con las mismas
 * reglas (public.generar_codigo_consulta y public.consulta_estado_publico).
 */

/** Alfabeto sin caracteres confusos (sin 0/O ni 1/I/L). */
export const ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const LARGO_CODIGO = 12;
const FORMATO_CODIGO = /^[2-9A-HJKMNP-Z]{12}$/;

/** Días que el enlace sigue funcionando después de la entrega. */
export const DIAS_TRAS_ENTREGA = 30;

/** Quita espacios y guiones y pasa a mayúsculas: "abcd-efgh 2345" → "ABCDEFGH2345". */
export const normalizarCodigo = (texto: string) => texto.replace(/[^0-9A-Za-z]/g, "").toUpperCase();

export const codigoValido = (codigo: string) => FORMATO_CODIGO.test(codigo);

/** Código en grupos de 4 para leerlo o dictarlo: "ABCD-EFGH-2345". */
export const codigoLegible = (codigo: string) => codigo.match(/.{1,4}/g)?.join("-") ?? codigo;

/** Enlace directo de consulta (sin guiones en la URL). */
export const enlaceConsulta = (base: string, codigo: string) => `${base.replace(/\/$/, "")}/estado/${codigo}`;

/** Lo único que devuelve la consulta pública. */
export type ConsultaPublica = {
  optica: string;
  sede: string;
  direccion: string | null;
  horario: string | null;
  whatsapp: string | null;
  numero: number;
  paciente: string;
  estado: Exclude<EstadoInterno, "anulada">;
  actualizado_en: string;
  fecha_prometida: string | null;
  entregada_en: string | null;
  saldo: number;
};

/** Claves permitidas en la respuesta (las pruebas comprueban que no haya otras). */
export const CAMPOS_CONSULTA = [
  "optica",
  "sede",
  "direccion",
  "horario",
  "whatsapp",
  "numero",
  "paciente",
  "estado",
  "actualizado_en",
  "fecha_prometida",
  "entregada_en",
  "saldo",
] as const satisfies readonly (keyof ConsultaPublica)[];

export type ResultadoConsulta = { tipo: "encontrada"; datos: ConsultaPublica } | { tipo: "no_encontrada" } | { tipo: "limitada" };

/** Interpreta la respuesta de consulta_estado_publico(). Cualquier forma inesperada cuenta como no encontrada. */
export function leerConsulta(respuesta: unknown): ResultadoConsulta {
  if (!respuesta || typeof respuesta !== "object") return { tipo: "no_encontrada" };
  const r = respuesta as Record<string, unknown>;
  if (r.limitado === true) return { tipo: "limitada" };
  if (typeof r.numero !== "number" || typeof r.estado !== "string" || !(r.estado in INDICE_ETAPA)) return { tipo: "no_encontrada" };
  // Solo se copian los campos permitidos, aunque la base devolviera más.
  const datos = Object.fromEntries(CAMPOS_CONSULTA.map((c) => [c, r[c] ?? null])) as ConsultaPublica;
  datos.saldo = Number(datos.saldo ?? 0);
  return { tipo: "encontrada", datos };
}

/** Línea de tiempo simple que ve el cliente. */
export const ETAPAS = ["Registrado", "Enviado al laboratorio", "En proceso", "Listo para recoger", "Entregado"] as const;

const INDICE_ETAPA: Record<Exclude<EstadoInterno, "anulada">, number> = {
  borrador: 0,
  enviada: 1,
  recibida_lab: 1,
  en_proceso: 2,
  lista: 2, // terminada en el laboratorio, aún no llega a la sede
  recibida_optica: 3,
  entregada: 4,
};

export const etapaDe = (estado: ConsultaPublica["estado"]) => INDICE_ETAPA[estado];

/** Último día en que funciona el enlace de una orden entregada (fecha ISO AAAA-MM-DD, hora de Lima). */
export function venceEnlace(entregadaEn: string): string {
  const d = new Date(new Date(entregadaEn).getTime() + DIAS_TRAS_ENTREGA * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(d);
}

/** wa.me a la sede con un mensaje que solo menciona el número de orden. */
export const enlaceWhatsAppSede = (celular: string, orden: string) =>
  `https://wa.me/${celular}?text=${encodeURIComponent(`Hola, quisiera consultar por mi pedido ${orden}.`)}`;

/** IP del cliente según las cabeceras del proxy de la plataforma (primer valor de x-forwarded-for). */
export function ipDeCabeceras(cabeceras: { get(nombre: string): string | null }): string | null {
  const reenviada = cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim();
  return reenviada || cabeceras.get("x-real-ip")?.trim() || null;
}

/** "Centro" → "Sede Centro"; "Sede principal" se deja igual. */
export const nombreSede = (nombre: string) => (/^sede\b/i.test(nombre.trim()) ? nombre : `Sede ${nombre}`);
