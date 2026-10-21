/**
 * OptiPedidos · Egresos: totales por categoría y rango del mes.
 */
import { describe, expect, it } from "vitest";
import { rangoMes, totalesEgresos } from "@/lib/egresos";

describe("totalesEgresos", () => {
  it("suma por categoría sin contar los anulados, de mayor a menor", () => {
    const r = totalesEgresos([
      { categoria: "servicios", monto: "120.50", anulado_en: null },
      { categoria: "servicios", monto: 99.9, anulado_en: null },
      { categoria: "alquiler", monto: 1500, anulado_en: null },
      { categoria: "movilidad", monto: 20, anulado_en: "2026-10-18T10:00:00Z" },
    ]);
    expect(r.total).toBe(1720.4);
    expect(r.porCategoria).toEqual([
      { categoria: "alquiler", monto: 1500 },
      { categoria: "servicios", monto: 220.4 },
    ]);
  });
});

describe("rangoMes", () => {
  it("da el primer y último día del mes", () => {
    expect(rangoMes("2026-10")).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(rangoMes("2028-02")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });
});
