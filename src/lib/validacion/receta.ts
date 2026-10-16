import { z } from "zod";
import { hoyISO, textoOpcional } from "./comun";

export const OJOS = ["od", "oi"] as const;
export const BASES_PRISMA = ["arriba", "abajo", "interna", "externa"] as const;

/**
 * Convierte el texto que escribe el óptico en número: acepta "+1.25", "-0,50",
 * "pl"/"plano" (0) y vacío (null). Lo que no sea número queda como NaN y falla.
 */
export function leerNumero(v: unknown): number | null {
  if (typeof v !== "string") return v == null ? null : Number.NaN;
  const t = v.trim().toLowerCase().replace(",", ".");
  if (t === "") return null;
  if (t === "pl" || t === "plano") return 0;
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return Number.NaN;
  return Number(t);
}

const multiploDe = (n: number, paso: number) => Math.abs(n / paso - Math.round(n / paso)) < 1e-9;

/** Número opcional dentro de un rango y múltiplo de un paso (igual que los dominios d_* de la base). */
const medida = (min: number, max: number, paso: number, unidad = "") =>
  z.preprocess(
    leerNumero,
    z
      .number("Escribe un número")
      .min(min, `Mínimo ${min}${unidad}`)
      .max(max, `Máximo ${max}${unidad}`)
      .refine((n) => multiploDe(n, paso), `Debe ir en pasos de ${paso}`)
      .nullable(),
  );

const camposOjo = (o: (typeof OJOS)[number]) => ({
  [`${o}_esfera`]: medida(-20, 20, 0.25),
  [`${o}_cilindro`]: medida(-10, 10, 0.25),
  [`${o}_eje`]: medida(0, 180, 1, "°"),
  [`${o}_adicion`]: medida(0.25, 4, 0.25),
  [`${o}_dnp`]: medida(0, 60, 0.1, " mm"),
  [`${o}_altura`]: medida(0, 60, 0.1, " mm"),
  [`${o}_prisma`]: medida(0, 20, 0.1),
  [`${o}_base_prisma`]: z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(BASES_PRISMA, "Base inválida").nullable()),
});

/** Reglas alineadas con las restricciones de la tabla `recetas`. */
export const esquemaReceta = z
  .object({
    fecha_examen: z.iso.date("Fecha inválida").refine((f) => f <= hoyISO(), "La fecha no puede estar en el futuro"),
    profesional: textoOpcional(120),
    observaciones: textoOpcional(1000),
    reemplaza_a: z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable()),
    ...camposOjo("od"),
    ...camposOjo("oi"),
  })
  .superRefine((r, ctx) => {
    const v = r as Record<string, number | string | null>;
    for (const o of OJOS) {
      if ((v[`${o}_cilindro`] ?? 0) !== 0 && v[`${o}_eje`] == null) {
        ctx.addIssue({ code: "custom", path: [`${o}_eje`], message: "Con cilindro, el eje es obligatorio" });
      }
      if ((v[`${o}_prisma`] ?? 0) !== 0 && v[`${o}_base_prisma`] == null) {
        ctx.addIssue({ code: "custom", path: [`${o}_base_prisma`], message: "Indica la base del prisma" });
      }
    }
    if ([v.od_esfera, v.od_cilindro, v.oi_esfera, v.oi_cilindro].every((x) => x == null)) {
      ctx.addIssue({ code: "custom", path: ["od_esfera"], message: "Registra la esfera o el cilindro de al menos un ojo" });
    }
  });

export type DatosReceta = z.infer<typeof esquemaReceta>;

export const esquemaAnulacion = z.object({
  motivo: z.string().trim().min(3, "Explica brevemente el motivo").max(300, "Máximo 300 caracteres"),
});
