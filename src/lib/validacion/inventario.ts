import { z } from "zod";
import { SUPERFICIES, TIPOS_LUNA, VISIONES } from "@/lib/inventario/medidas";
import { textoOpcional } from "./comun";
import { leerImporte } from "./orden";
import { leerNumero } from "./receta";

const claves = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const vacioANull = (v: unknown) => (v === "" || v == null ? null : v);
const multiplo = (n: number, paso: number) => Math.abs(n / paso - Math.round(n / paso)) < 1e-9;

const entero = (min: number, mensaje: string) =>
  z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number(mensaje).int(mensaje).min(min, mensaje));

export const esquemaProducto = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre del producto").max(120, "Máximo 120 caracteres"),
  tipo: z.enum(claves(TIPOS_LUNA), "Tipo inválido"),
  material: textoOpcional(60),
  indice: z.preprocess(
    leerNumero,
    z.number("Escribe un número").min(1.4, "Mínimo 1.40").max(2, "Máximo 2.00").refine((n) => multiplo(n, 0.01), "Usa dos decimales").nullable(),
  ),
  tratamiento: textoOpcional(60),
  color_tratamiento: textoOpcional(40),
  vision: z.enum(claves(VISIONES), "Visión inválida"),
  superficie: z.preprocess(vacioANull, z.enum(claves(SUPERFICIES), "Superficie inválida").nullable()),
  por_lado: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  proveedor: textoOpcional(120),
  costo_referencial: z.preprocess(
    (v) => (v === "" || v == null ? null : leerImporte(v)),
    z.number("Escribe el costo en soles").min(0, "No puede ser negativo").nullable(),
  ),
  stock_minimo_defecto: entero(0, "Escribe un número entero de lunas"),
});

const medidaEsfera = z.number().min(-20).max(20).refine((n) => multiplo(n, 0.25), "Esfera en pasos de 0.25");
const medidaCilindro = z.number().min(-10).max(0, "El stock se registra en cilindro negativo").refine((n) => multiplo(n, 0.25), "Cilindro en pasos de 0.25");

/** Línea de compra (llega como JSON desde la matriz). */
export const esquemaLineaCompra = z.object({
  producto_id: z.uuid(),
  esfera: medidaEsfera,
  cilindro: medidaCilindro,
  adicion: z.number().min(0.25).max(4).refine((n) => multiplo(n, 0.25)).nullable().default(null),
  lado: z.enum(["OD", "OI"]).nullable().default(null),
  cantidad: z.number().int().min(1).max(10_000),
  costo_unitario: z.number().min(0).max(99_999).nullable().default(null),
});

export const esquemaCompra = z.object({
  proveedor: textoOpcional(120),
  documento: textoOpcional(60),
  fecha: z.iso.date("Fecha inválida"),
  notas: textoOpcional(500),
  lote: textoOpcional(60),
  lineas: z.array(esquemaLineaCompra).min(1, "Escribe al menos una cantidad en la matriz").max(2000, "Máximo 2000 medidas por compra"),
});

export const TIPOS_SALIDA = ["venta", "perdida", "devolucion", "ajuste"] as const;

/** Movimiento manual de una variante (venta, pérdida, devolución o ajuste). */
export const esquemaMovimiento = z
  .object({
    tipo: z.enum(TIPOS_SALIDA, "Tipo inválido"),
    cantidad: z.preprocess((v) => Number(v), z.number("Escribe la cantidad").int("Solo lunas enteras").refine((n) => n !== 0, "La cantidad no puede ser cero")),
    motivo: textoOpcional(300),
    autoriza_negativo: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  })
  .superRefine((m, ctx) => {
    if ((m.tipo === "ajuste" || m.tipo === "perdida") && !m.motivo) {
      ctx.addIssue({ code: "custom", path: ["motivo"], message: "Indica el motivo" });
    }
    if (m.tipo !== "ajuste" && m.cantidad < 0) {
      ctx.addIssue({ code: "custom", path: ["cantidad"], message: "Escribe la cantidad en positivo" });
    }
  });

export const esquemaVariante = z.object({
  stock_minimo: entero(0, "Escribe un número entero de lunas"),
  ubicacion: textoOpcional(60),
});
