/**
 * OptiPedidos · Validación de formularios de pacientes y recetas (sin base de datos).
 * Comprueba que las reglas del formulario coinciden con las restricciones de la base,
 * para que el usuario vea el error antes de enviar y no un fallo genérico.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { edad, fecha, graduacion } from "@/lib/formato";
import { esquemaPaciente } from "@/lib/validacion/paciente";
import { esquemaReceta, leerNumero } from "@/lib/validacion/receta";

const errores = (r: { success: boolean; error?: z.ZodError }): Record<string, string[] | undefined> =>
  r.success ? {} : z.flattenError(r.error!).fieldErrors;

const recetaBase = { fecha_examen: "2026-01-15", reemplaza_a: "" };

describe("leerNumero", () => {
  it.each([
    ["+1.25", 1.25],
    ["-0,50", -0.5],
    ["  2  ", 2],
    [".75", 0.75],
    ["pl", 0],
    ["Plano", 0],
    ["", null],
  ])("lee %j como %j", (texto, esperado) => {
    expect(leerNumero(texto)).toBe(esperado);
  });

  it.each(["abc", "1.2.3", "+-1", "1e2"])("rechaza %j", (texto) => {
    expect(leerNumero(texto)).toBeNaN();
  });
});

describe("esquemaReceta", () => {
  it("acepta una receta típica con signo y coma decimal", () => {
    const r = esquemaReceta.safeParse({
      ...recetaBase,
      od_esfera: "-1,25",
      od_cilindro: "-0.50",
      od_eje: "180",
      oi_esfera: "+0.75",
      od_adicion: "2.00",
      od_dnp: "31.5",
    });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ od_esfera: -1.25, od_cilindro: -0.5, od_eje: 180, oi_esfera: 0.75, oi_cilindro: null });
  });

  it("exige al menos esfera o cilindro en algún ojo", () => {
    expect(errores(esquemaReceta.safeParse({ ...recetaBase, od_dnp: "31" })).od_esfera).toBeDefined();
  });

  it("exige eje cuando hay cilindro", () => {
    expect(errores(esquemaReceta.safeParse({ ...recetaBase, oi_cilindro: "-1.00" })).oi_eje).toBeDefined();
  });

  it("no exige eje con cilindro en cero", () => {
    expect(esquemaReceta.safeParse({ ...recetaBase, od_esfera: "-1", od_cilindro: "0" }).success).toBe(true);
  });

  it.each([
    ["od_esfera", "-1.30", "pasos de 0.25"],
    ["od_esfera", "21", "Máximo 20"],
    ["od_cilindro", "-10.25", "Mínimo -10"],
    ["od_eje", "181", "Máximo 180"],
    ["od_eje", "90.5", "pasos de 1"],
    ["od_adicion", "0", "Mínimo 0.25"],
    ["od_dnp", "61", "Máximo 60"],
    ["od_esfera", "abc", "Escribe un número"],
  ])("rechaza %s = %j", (campo, valor, mensaje) => {
    const datos = { ...recetaBase, oi_esfera: "-1", od_eje: "90", od_cilindro: "-1", [campo]: valor };
    expect(errores(esquemaReceta.safeParse(datos))[campo]?.[0]).toContain(mensaje);
  });

  it("exige la base cuando hay prisma", () => {
    const r = esquemaReceta.safeParse({ ...recetaBase, od_esfera: "1", od_prisma: "2" });
    expect(errores(r).od_base_prisma).toBeDefined();
  });

  it("rechaza fechas de examen futuras", () => {
    const r = esquemaReceta.safeParse({ ...recetaBase, fecha_examen: "2999-01-01", od_esfera: "1" });
    expect(errores(r).fecha_examen).toBeDefined();
  });
});

describe("esquemaPaciente", () => {
  const base = { nombres: " Ana ", apellidos: "Pérez", tipo_documento: "DNI" };

  it("normaliza vacíos a null y recorta espacios", () => {
    const r = esquemaPaciente.safeParse({ ...base, numero_documento: "", email: "  ", telefono: "" });
    expect(r.data).toMatchObject({ nombres: "Ana", numero_documento: null, email: null, telefono: null });
  });

  it.each([
    ["DNI", "1234567", false],
    ["DNI", "12345678", true],
    ["DNI", "1234 5678", true],
    ["CE", "ab12345", true],
    ["PASAPORTE", "12", false],
  ])("documento %s %j válido=%s", (tipo, numero, valido) => {
    expect(esquemaPaciente.safeParse({ ...base, tipo_documento: tipo, numero_documento: numero }).success).toBe(valido);
  });

  it("rechaza correo inválido y nacimiento futuro", () => {
    const e = errores(esquemaPaciente.safeParse({ ...base, email: "no-correo", fecha_nacimiento: "2999-01-01" }));
    expect(e.email).toBeDefined();
    expect(e.fecha_nacimiento).toBeDefined();
  });
});

describe("formato", () => {
  it("muestra graduaciones con signo", () => {
    expect([graduacion(1.25), graduacion(-0.5), graduacion(0), graduacion(null)]).toEqual(["+1.25", "-0.50", "0.00", "—"]);
  });

  it("formatea fechas sin desfase de zona horaria", () => {
    expect(fecha("2026-01-01")).toBe("01/01/2026");
  });

  it("calcula la edad respetando el cumpleaños", () => {
    expect(edad("2000-10-16", new Date(2026, 9, 15))).toBe(25);
    expect(edad("2000-10-15", new Date(2026, 9, 15))).toBe(26);
  });
});
