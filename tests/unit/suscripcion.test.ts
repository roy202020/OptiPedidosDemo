/**
 * OptiPedidos · Estado de la suscripción y avisos (mismas reglas que la base).
 */
import { describe, expect, it } from "vitest";
import { avisoSuscripcion, coincideFiltro, diasEntre, estadoSuscripcion, sumarDias } from "@/lib/suscripcion";

describe("estadoSuscripcion", () => {
  it.each([
    [null, "activa"],
    ["2026-10-20", "activa"],
    ["2026-10-17", "activa"],
    ["2026-10-16", "gracia"],
    ["2026-10-10", "gracia"],
    ["2026-10-09", "suspendida"],
  ] as const)("vence %s → %s (hoy 17/10)", (vence, estado) => {
    expect(estadoSuscripcion(vence, "2026-10-17")).toBe(estado);
  });
});

describe("avisoSuscripcion", () => {
  const hoy = "2026-10-17";

  it("sin aviso a más de 5 días", () => {
    expect(avisoSuscripcion("2026-10-23", hoy)).toBeNull();
  });

  it("avisa desde 5 días antes", () => {
    expect(avisoSuscripcion("2026-10-22", hoy)).toMatchObject({ tipo: "aviso", titulo: "Tu suscripción vence en 5 días" });
    expect(avisoSuscripcion("2026-10-17", hoy)?.titulo).toBe("Tu suscripción vence hoy");
  });

  it("en gracia cuenta los días que quedan", () => {
    expect(avisoSuscripcion("2026-10-14", hoy)).toMatchObject({ tipo: "error", texto: expect.stringContaining("4 días de gracia") });
  });

  it("suspendida: solo lectura sin borrar datos", () => {
    expect(avisoSuscripcion("2026-10-01", hoy)).toMatchObject({ tipo: "error", texto: expect.stringContaining("no se borra nada") });
  });
});

describe("fechas", () => {
  it("cuenta días y suma sin desfases de zona horaria", () => {
    expect(diasEntre("2026-10-17", "2026-11-16")).toBe(30);
    expect(sumarDias("2026-12-25", 10)).toBe("2027-01-04");
  });
});

describe("coincideFiltro", () => {
  it("por vencer: activas que vencen en 5 días o menos", () => {
    expect(coincideFiltro({ estado: "activa", dias_para_vencer: 5 }, "por-vencer")).toBe(true);
    expect(coincideFiltro({ estado: "activa", dias_para_vencer: 6 }, "por-vencer")).toBe(false);
    expect(coincideFiltro({ estado: "gracia", dias_para_vencer: -2 }, "por-vencer")).toBe(false);
    expect(coincideFiltro({ estado: "gracia", dias_para_vencer: -2 }, "gracia")).toBe(true);
  });
});
