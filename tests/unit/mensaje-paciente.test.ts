/**
 * OptiPedidos · Aviso manual de lentes listos (plan Básico).
 */
import { describe, expect, it } from "vitest";
import { enlaceLentesListos, mensajeLentesListos } from "@/lib/ordenes/mensaje-paciente";

describe("aviso manual de lentes listos", () => {
  it("saluda por el primer nombre y menciona la orden", () => {
    const m = mensajeLentesListos({ nombres: "Ana María" }, "OT-00012", "Óptica Ficticia (sede Centro)");
    expect(m).toContain("Hola, Ana. Te saluda Óptica Ficticia (sede Centro).");
    expect(m).toContain("orden OT-00012 ya están listos");
  });

  it("arma el enlace wa.me con el celular normalizado", () => {
    const url = enlaceLentesListos({ nombres: "Ana", telefono: "987 000 001" }, "OT-1", "Óptica");
    expect(url?.startsWith("https://wa.me/51987000001?text=")).toBe(true);
  });

  it("sin celular válido no hay enlace", () => {
    expect(enlaceLentesListos({ nombres: "Ana", telefono: "01 4445555" }, "OT-1", "Óptica")).toBeNull();
    expect(enlaceLentesListos({ nombres: "Ana", telefono: null }, "OT-1", "Óptica")).toBeNull();
  });
});
