import { z } from "zod";
import { DISENOS, ORIGENES_MONTURA, PRIORIDADES, TIPOS_TRABAJO, TRATAMIENTOS } from "@/lib/ordenes/estados";
import { indiceCompatible } from "@/lib/ordenes/materiales";
import { MEDIOS_COBRO } from "@/lib/ordenes/pagos";
import { hoyISO, hoyLimaISO, textoOpcional } from "./comun";
import { leerNumero } from "./receta";

const claves = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const vacioANull = (v: unknown) => (v === "" || v == null ? null : v);

const numeroOpcional = (min: number, max: number, paso: number, unidad = "") =>
  z.preprocess(
    leerNumero,
    z
      .number("Escribe un número")
      .min(min, `Mínimo ${min}${unidad}`)
      .max(max, `Máximo ${max}${unidad}`)
      .refine((n) => Math.abs(n / paso - Math.round(n / paso)) < 1e-9, `Usa pasos de ${paso}`)
      .nullable(),
  );

/**
 * Lee un importe en soles: acepta "S/ 1,234.50", "1234,5" o "1 234.50". Vacío = 0.
 * Devuelve NaN si no es un número.
 */
export function leerImporte(v: unknown): number {
  if (typeof v !== "string") return typeof v === "number" ? v : Number.NaN;
  let t = v.replace(/S\/|\s/gi, "");
  if (t === "") return 0;
  // Con punto, las comas son de miles (1,234.50). Sin punto, "15,000" son miles y "12,5" es decimal.
  if (t.includes(".") || /^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, "");
  else t = t.replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : Number.NaN;
}

const importe = (nombre: string) =>
  z.preprocess(leerImporte, z.number(`Escribe el ${nombre} en soles (máximo 2 decimales)`).min(0, `El ${nombre} no puede ser negativo`).max(99_999_999, `El ${nombre} es demasiado alto`));

/** Datos del lente de un ojo (la graduación se copia de la receta en la base). */
const lente = {
  material: textoOpcional(60),
  indice: numeroOpcional(1.4, 2, 0.01),
  diseno: z.preprocess(vacioANull, z.enum(claves(DISENOS), "Diseño inválido").nullable()),
  tratamientos: z.array(z.enum(claves(TRATAMIENTOS))).default([]),
  tinte: textoOpcional(60),
  diametro_mm: numeroOpcional(40, 90, 1, " mm"),
};

const esquemaLente = z.object(lente).refine(d => indiceCompatible(d.material, d.indice), { path: ["indice"], message: "El índice no es compatible con el material seleccionado" });

export const esquemaOrden = z
  .object({
  ojos_pedido: z.enum(["ambos", "od", "oi"], "Elige ambos ojos, derecho o izquierdo").default("ambos"),
  receta_id: z.uuid("Elige una receta"),
  laboratorio_id: z.uuid("Elige un laboratorio"),
  tipo_trabajo: z.enum(claves(TIPOS_TRABAJO), "Tipo de trabajo inválido"),
  montura_catalogo_id: z.preprocess(vacioANull,z.uuid("Elige una montura válida").nullable()).default(null),
  montura_descripcion: textoOpcional(200),
  montura_origen: z.preprocess(vacioANull, z.enum(claves(ORIGENES_MONTURA), "Origen inválido").nullable()),
  fecha_entrega_prometida: z.iso
    .date("Indica la fecha prometida")
    .refine((f) => f >= hoyISO(), "La fecha prometida no puede estar en el pasado"),
  prioridad: z.enum(claves(PRIORIDADES), "Prioridad inválida"),
  observacion: textoOpcional(1000),
  precio: importe("precio"),
  precio_montura: importe("precio de la montura").default(0),
  descuento: importe("descuento"),
  od: esquemaLente,
  oi: esquemaLente,
})
  .refine(d => d.precio_montura <= d.precio, {path:["precio_montura"],message:"La montura no puede superar el precio total"})
  .refine((d) => d.descuento <= d.precio, { path: ["descuento"], message: "El descuento no puede superar el precio" });

export type DatosOrden = z.infer<typeof esquemaOrden>;

/**
 * Convierte el FormData plano (od_material, oi_tratamientos…) en la forma que valida el esquema.
 * Los tratamientos llegan como varios checkboxes con el mismo nombre.
 */
export function leerFormularioOrden(datos: FormData) {
  const texto = (k: string) => {
    const v = datos.get(k);
    return typeof v === "string" ? v : "";
  };
  const compartida = texto("configuracion_lentes") === "compartida";
  const prefijo = (o: "od" | "oi") => compartida ? "luna" : o;
  const ojo = (lado: "od" | "oi") => {
    const o = prefijo(lado);
    return ({
    material: texto(`${o}_material`),
    indice: texto(`${o}_indice`),
    diseno: texto(`${o}_diseno`),
    tratamientos: datos.getAll(`${o}_tratamientos`).filter((v) => typeof v === "string"),
    tinte: texto(`${o}_tinte`),
    diametro_mm: texto(`${o}_diametro_mm`),
  });
  };
  return {
    ojos_pedido: texto("ojos_pedido") || "ambos",
    receta_id: texto("receta_id"),
    laboratorio_id: texto("laboratorio_id"),
    tipo_trabajo: texto("tipo_trabajo"),
    montura_catalogo_id: texto("montura_catalogo_id"),
    montura_descripcion: texto("montura_descripcion"),
    montura_origen: texto("montura_origen"),
    fecha_entrega_prometida: texto("fecha_entrega_prometida"),
    prioridad: texto("prioridad"),
    observacion: texto("observacion"),
    precio: texto("precio"),
    precio_montura: texto("precio_montura"),
    descuento: texto("descuento"),
    od: ojo("od"),
    oi: ojo("oi"),
  };
}

/** Valores del formulario como texto plano para volver a llenarlo (tratamientos separados por coma). */
export function valoresOrden(datos: FormData): Record<string, string> {
  const v: Record<string, string> = {};
  for (const [k, valor] of datos.entries()) {
    if (k.startsWith("$") || typeof valor !== "string") continue;
    v[k] = k.endsWith("_tratamientos") && v[k] ? `${v[k]},${valor}` : valor;
  }
  return v;
}

/** Errores anidados (od.material) aplanados con el nombre del campo del formulario (od_material). */
export function erroresOrden(error: z.ZodError, datos?: FormData): Record<string, string[]> {
  const campos: Record<string, string[]> = {};
  for (const issue of error.issues) {
    let clave = issue.path.filter((p) => typeof p !== "number").join("_");
    if (datos?.get("configuracion_lentes") === "compartida") clave = clave.replace(/^(od|oi)_/, "luna_");
    (campos[clave] ??= []).push(issue.message);
  }
  return campos;
}

/** Forma que esperan las funciones crear_orden / actualizar_orden_borrador para p_ojos. */
export const ojosParaRpc = (d: DatosOrden) => ({
  OD: d.od, OI: d.oi, _precio_montura: d.precio_montura, _montura_catalogo_id: d.montura_catalogo_id ?? "",
  ...(d.ojos_pedido !== "ambos" ? { _ojos: [d.ojos_pedido.toUpperCase()] } : {}),
});

export const esquemaLaboratorio = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre del laboratorio").max(120, "Máximo 120 caracteres"),
  contacto: textoOpcional(120),
  telefono: textoOpcional(30),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim().toLowerCase() : null),
    z.email("Correo inválido").nullable(),
  ),
  /** Solo propietario y administrador lo envían (la base lo vuelve a comprobar). */
  dias_credito: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : undefined),
    z.number("Escribe los días como número").int("Los días deben ser enteros").min(0, "Mínimo 0 (contado)").max(365, "Máximo 365 días").optional(),
  ),
});

/** Meta mensual: periodo AAAA-MM (input type=month) e importe en soles. */
export const esquemaMeta = z.object({
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Elige el mes"),
  importe_objetivo: z.preprocess(leerImporte, z.number("Escribe el importe en soles").gt(0, "La meta debe ser mayor que cero").max(9_999_999_999, "Importe demasiado alto")),
});

export const esquemaMotivo = z.object({
  motivo: z.string().trim().min(3, "Explica brevemente el motivo").max(300, "Máximo 300 caracteres"),
});

export const esquemaObservacion = z.object({
  texto: z.string().trim().min(1, "Escribe la observación").max(1000, "Máximo 1000 caracteres"),
});

/** Pago de una orden: importe en soles mayor que cero, medio y fecha (hoy o antes, hora de Lima). */
export const esquemaPago = z.object({
  importe: z.preprocess(
    leerImporte,
    z.number("Escribe el importe en soles (máximo 2 decimales)").gt(0, "El importe debe ser mayor que cero").max(99_999_999, "El importe es demasiado alto"),
  ),
  // El formulario ofrece Yape y Plin por separado; "yape_plin" se sigue aceptando (cobros anteriores a la 0015).
  medio: z.enum([...claves(MEDIOS_COBRO), "yape_plin"], "Elige el medio de pago"),
  numero_operacion: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined),
    z.string().max(60, "Máximo 60 caracteres").optional(),
  ),
  fecha: z.iso.date("Indica la fecha del pago").refine((f) => f <= hoyLimaISO(), "La fecha del pago no puede estar en el futuro"),
});

export type DatosPago = z.infer<typeof esquemaPago>;
