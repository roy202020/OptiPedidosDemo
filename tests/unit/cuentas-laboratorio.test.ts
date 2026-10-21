/**
 * OptiPedidos · Cuentas con laboratorios: vencimientos, alertas y cuadre de órdenes.
 */
import { describe, expect, it } from "vitest";
import { alertasDeuda, cuandoVence, deudaTotal, diferenciaOrdenes, estadoVencimiento, vencimientoSugerido } from "@/lib/laboratorios/cuentas";

describe("vencimiento", () => {
  it("contado vence el mismo día; 7 días de crédito, una semana después", () => {
    expect(vencimientoSugerido("2026-10-18", 0)).toBe("2026-10-18");
    expect(vencimientoSugerido("2026-10-28", 7)).toBe("2026-11-04");
  });

  it.each([
    ["2026-10-17", 100, "vencido"],
    ["2026-10-18", 100, "por_vencer"],
    ["2026-10-20", 100, "por_vencer"],
    ["2026-10-21", 100, "al_dia"],
    ["2026-10-01", 0, "al_dia"],
  ] as const)("vence %s con deuda %d → %s (hoy 18/10)", (vence, deuda, estado) => {
    expect(estadoVencimiento(vence, deuda, "2026-10-18")).toBe(estado);
  });
});

describe("cuadre de órdenes", () => {
  it("avisa cuánto falta o sobra", () => {
    expect(diferenciaOrdenes(500, [100, 100, 100, 100, 100])).toBe(0);
    expect(diferenciaOrdenes(500, [100, 150.5])).toBe(249.5);
    expect(diferenciaOrdenes(100, [60, 60])).toBe(-20);
  });
});

describe("alertas de deuda", () => {
  const filas = [
    { laboratorio_id: "v", laboratorio: "Lab Visión", fecha_vencimiento: "2026-10-19", dias_para_vencer: 1, estado: "por_vencer", deuda: 300 },
    { laboratorio_id: "v", laboratorio: "Lab Visión", fecha_vencimiento: "2026-10-19", dias_para_vencer: 1, estado: "por_vencer", deuda: 125 },
    { laboratorio_id: "s", laboratorio: "Lab Sur", fecha_vencimiento: "2026-10-15", dias_para_vencer: -3, estado: "vencido", deuda: 1200 },
    { laboratorio_id: "s", laboratorio: "Lab Sur", fecha_vencimiento: "2026-11-15", dias_para_vencer: 28, estado: "al_dia", deuda: 90 },
  ];

  it("agrupa por laboratorio y día, primero lo vencido", () => {
    expect(alertasDeuda(filas).map((a) => a.texto.replace(/ /g, " "))).toEqual([
      "Lab Sur: S/ 1,200.00 vencidos hace 3 días",
      "Lab Visión: S/ 425.00 vencen mañana",
    ]);
  });

  it("la deuda total incluye lo que está al día", () => {
    expect(deudaTotal(filas)).toBe(1715);
  });

  it("textos de plazo", () => {
    expect([cuandoVence(-1), cuandoVence(0), cuandoVence(2)]).toEqual(["vencidos ayer", "vencen hoy", "vencen en 2 días"]);
  });
});
