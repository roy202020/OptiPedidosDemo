/**
 * OptiPedidos · Pagos de las órdenes en la aplicación (sin base de datos).
 * Las reglas coinciden con las de orden_pagos en la base (migración 0008).
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MEDIOS_PAGO, resumenPagos } from "@/lib/ordenes/pagos";
import { hoyLimaISO } from "@/lib/validacion/comun";
import { esquemaPago } from "@/lib/validacion/orden";

const errores = (r: { success: boolean; error?: z.ZodError }): Record<string, string[] | undefined> =>
  r.success ? {} : z.flattenError(r.error!).fieldErrors;

describe("esquemaPago", () => {
  const hoy = hoyLimaISO();

  it("acepta un adelanto con formato de soles", () => {
    expect(esquemaPago.safeParse({ importe: "S/ 1,250.50", medio: "yape_plin", fecha: hoy }).data).toEqual({
      importe: 1250.5,
      medio: "yape_plin",
      fecha: hoy,
    });
  });

  it("acepta coma decimal y fechas pasadas", () => {
    expect(esquemaPago.safeParse({ importe: "80,5", medio: "efectivo", fecha: "2026-01-02" }).data?.importe).toBe(80.5);
  });

  it.each(["", "0", "0.00"])("rechaza el importe %j (debe ser mayor que cero)", (importe) => {
    expect(errores(esquemaPago.safeParse({ importe, medio: "efectivo", fecha: hoy })).importe).toEqual(["El importe debe ser mayor que cero"]);
  });

  it.each(["-10", "abc", "10.555"])("rechaza el importe inválido %j", (importe) => {
    expect(errores(esquemaPago.safeParse({ importe, medio: "efectivo", fecha: hoy })).importe).toBeDefined();
  });

  it("rechaza medios de pago desconocidos", () => {
    expect(errores(esquemaPago.safeParse({ importe: "10", medio: "cheque", fecha: hoy })).medio).toEqual(["Elige el medio de pago"]);
  });

  it("rechaza fechas futuras o vacías", () => {
    expect(errores(esquemaPago.safeParse({ importe: "10", medio: "tarjeta", fecha: "2999-01-01" })).fecha).toEqual([
      "La fecha del pago no puede estar en el futuro",
    ]);
    expect(errores(esquemaPago.safeParse({ importe: "10", medio: "tarjeta", fecha: "" })).fecha).toBeDefined();
  });

  it("los medios coinciden con el CHECK de la base", () => {
    expect(Object.keys(MEDIOS_PAGO)).toEqual(["efectivo", "tarjeta", "transferencia", "yape_plin"]);
  });
});

describe("hoyLimaISO", () => {
  it("devuelve AAAA-MM-DD", () => expect(hoyLimaISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/));
});

describe("resumenPagos", () => {
  const orden = { precio: "500.00", descuento: "50.00" };

  it("sin pagos, el saldo es el importe neto", () => {
    expect(resumenPagos(orden, [])).toEqual({ neto: 450, pagado: 0, saldo: 450 });
  });

  it("ignora los pagos anulados", () => {
    const pagos = [
      { importe: "200.00", anulado_en: null },
      { importe: "100.00", anulado_en: "2026-10-16T10:00:00Z" },
    ];
    expect(resumenPagos(orden, pagos)).toEqual({ neto: 450, pagado: 200, saldo: 250 });
  });

  it("suma en céntimos sin errores de coma flotante", () => {
    const pagos = [0.1, 0.2, 0.3].map((importe) => ({ importe, anulado_en: null }));
    expect(resumenPagos({ precio: 0.6, descuento: 0 }, pagos)).toEqual({ neto: 0.6, pagado: 0.6, saldo: 0 });
  });

  it("el saldo nunca es negativo", () => {
    expect(resumenPagos({ precio: 100, descuento: 0 }, [{ importe: 120, anulado_en: null }]).saldo).toBe(0);
  });
});
