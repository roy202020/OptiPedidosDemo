/**
 * OptiPedidos · Saldo en los mensajes al paciente y recibo de cobro.
 */
import { describe, expect, it } from "vitest";
import { enlaceWhatsApp, mensajeLentesListos, mensajeRecordatorioSaldo, saldoTrasCobro, textoRecibo } from "@/lib/ordenes/mensaje-paciente";
import { resumenPagos } from "@/lib/ordenes/pagos";

describe("saldo de la orden", () => {
  it("se calcula con varios cobros parciales y no cuenta los anulados", () => {
    const pagos = [
      { importe: "100.00", anulado_en: null },
      { importe: 150, anulado_en: "2026-10-18T10:00:00Z" },
      { importe: "80.10", anulado_en: null },
    ];
    expect(resumenPagos({ precio: "500.00", descuento: "50" }, pagos)).toEqual({ neto: 450, pagado: 180.1, saldo: 269.9 });
  });
});

describe("lente listo con saldo", () => {
  it("incluye el saldo pendiente si existe", () => {
    const m = mensajeLentesListos({ nombres: "Ana" }, "#0012", "Óptica", null, 120);
    expect(m).toContain("ya están listos");
    expect(m).toContain("Saldo pendiente: S/ 120.00.");
  });

  it("sin saldo no lo menciona", () => {
    expect(mensajeLentesListos({ nombres: "Ana" }, "#0012", "Óptica")).not.toContain("Saldo");
  });
});

describe("recordatorio de saldo", () => {
  it("distingue pedido listo de pedido en curso", () => {
    expect(mensajeRecordatorioSaldo({ nombres: "Luis Alberto" }, "#7", 80, "Óptica Sur", true)).toContain(
      "Hola, Luis. Te saluda Óptica Sur.\n\nTus lentes de la orden #7 están listos y queda un saldo pendiente de S/ 80.00.",
    );
    expect(mensajeRecordatorioSaldo({ nombres: "Luis" }, "#7", 80, "Óptica Sur", false)).toContain("tiene un saldo pendiente de S/ 80.00");
  });

  it("solo arma el enlace con un celular válido", () => {
    expect(enlaceWhatsApp("987 000 001", "hola")).toBe("https://wa.me/51987000001?text=hola");
    expect(enlaceWhatsApp("01 4445555", "hola")).toBeNull();
  });
});

describe("recibo de cobro", () => {
  const base = {
    optica: "Óptica Sur",
    sede: "Centro",
    orden: "#12",
    paciente: "Ana Pérez",
    fecha: "18/10/2026",
    importe: 150,
    medio: "Yape",
    numeroOperacion: "OP-1",
    total: 450,
    pagadoAntes: 100,
  };

  it("indica lo pagado y el saldo restante después del cobro", () => {
    expect(saldoTrasCobro(base)).toEqual({ pagado: 250, saldo: 200 });
    const t = textoRecibo(base);
    expect(t).toContain("Monto pagado: S/ 150.00 (Yape, op. OP-1)");
    expect(t).toContain("*Saldo pendiente: S/ 200.00*");
  });

  it("al cancelar todo lo dice", () => {
    expect(textoRecibo({ ...base, importe: 350 })).toContain("Pedido pagado por completo");
  });
});
