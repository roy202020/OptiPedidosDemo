/**
 * OptiPedidos · Mensaje de WhatsApp de la orden para el laboratorio.
 */
import { describe, expect, it } from "vitest";
import { enlaceWhatsAppLaboratorio, mensajeLaboratorio, type OrdenParaLaboratorio } from "@/lib/ordenes/mensaje-laboratorio";
import { normalizarCelularPe } from "@/lib/telefono";

const ojo = (o: "OD" | "OI", extra: Partial<OrdenParaLaboratorio["ojos"][number]> = {}) => ({
  ojo: o,
  esfera: -1.25,
  cilindro: null,
  eje: null,
  adicion: null,
  dnp: null,
  altura: null,
  prisma: null,
  base_prisma: null,
  material: "Policarbonato",
  indice: 1.59,
  diseno: "monofocal",
  tratamientos: ["antirreflejo"],
  tinte: null,
  diametro_mm: null,
  ...extra,
});

const orden: OrdenParaLaboratorio = {
  numero: 7,
  creado_en: "2026-10-16T15:00:00Z",
  fecha_entrega_prometida: "2026-10-20",
  prioridad: "urgente",
  tipo_trabajo: "lentes_completos",
  montura_descripcion: "Metálica negra 52-18",
  montura_origen: "paciente",
  paciente: { nombres: "Lucía", apellidos: "Ficticia Ramos" },
  laboratorio: { nombre: "Lab Ficticio", telefono: "987 654 321" },
  ojos: [ojo("OD", { cilindro: -0.75, eje: 180, dnp: 31.5 }), ojo("OI", { esfera: 0.5 })],
  observaciones: [{ texto: "Biselado fino" }],
};

describe("normalizarCelularPe", () => {
  it.each([
    ["987 654 321", "51987654321"],
    ["+51 987-654-321", "51987654321"],
    ["0051987654321", "51987654321"],
    ["01 4445555", null],
    ["", null],
    [null, null],
  ])("%j → %j", (entrada, esperado) => expect(normalizarCelularPe(entrada)).toBe(esperado));
});

describe("mensajeLaboratorio", () => {
  const texto = mensajeLaboratorio(orden, { nombre: "Óptica Ficticia", telefono: "01 555 1234" });

  it("incluye número, urgencia, paciente y fecha de entrega", () => {
    expect(texto).toContain("*Óptica Ficticia* · Orden de trabajo *#0007*");
    expect(texto).toContain("*URGENTE*");
    expect(texto).toContain("Paciente: Ficticia Ramos, Lucía");
    expect(texto).toContain("Entrega requerida: *20/10/2026*");
  });

  it("escribe la graduación de cada ojo", () => {
    expect(texto).toContain("OD: -1.25 -0.75 x180° DNP 31.5");
    expect(texto).toContain("OI: +0.50");
  });

  it("agrupa el lente si es igual en ambos ojos", () => {
    expect(texto).toContain("OD y OI: Policarbonato · índice 1.59 · Monofocal · Antirreflejo");
  });

  it("incluye montura y observaciones, sin precios", () => {
    expect(texto).toContain("Montura: del paciente · Metálica negra 52-18");
    expect(texto).toContain("- Biselado fino");
    expect(texto).not.toMatch(/S\/|precio/i);
  });
});

describe("enlaceWhatsAppLaboratorio", () => {
  it("abre el chat del laboratorio con el mensaje codificado", () => {
    const { url, conNumero } = enlaceWhatsAppLaboratorio(orden, { nombre: "Óptica Ficticia" });
    expect(conNumero).toBe(true);
    expect(url.startsWith("https://wa.me/51987654321?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toContain("Orden de trabajo *#0007*");
  });

  it("sin celular válido deja elegir el contacto", () => {
    const { url, conNumero } = enlaceWhatsAppLaboratorio({ ...orden, laboratorio: { nombre: "Lab", telefono: "01 4445555" } }, { nombre: "Ó" });
    expect(conNumero).toBe(false);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
  });
});

describe("fecha del mensaje", () => {
  it("usa la hora de Lima: una orden de las 11 p. m. no aparece con fecha del día siguiente", () => {
    const texto = mensajeLaboratorio({ ...orden, creado_en: "2026-10-16T04:19:00Z" }, { nombre: "Ó" });
    expect(texto).toContain("Fecha: 15/10/2026");
  });
});
