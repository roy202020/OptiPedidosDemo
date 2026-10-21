/**
 * OptiPedidos · Consulta pública del estado del pedido (módulo puro).
 */
import { describe, expect, it } from "vitest";
import {
  ALFABETO_CODIGO,
  CAMPOS_CONSULTA,
  ETAPAS,
  codigoLegible,
  codigoValido,
  enlaceConsulta,
  enlaceWhatsAppSede,
  etapaDe,
  ipDeCabeceras,
  leerConsulta,
  normalizarCodigo,
  venceEnlace,
} from "@/lib/ordenes/consulta-publica";
import { mensajeLentesListos } from "@/lib/ordenes/mensaje-paciente";

const respuesta = {
  optica: "Óptica Ficticia",
  sede: "Centro",
  direccion: "Av. Uno 123",
  horario: null,
  whatsapp: "51987654321",
  numero: 12,
  paciente: "Ana",
  estado: "en_proceso",
  actualizado_en: "2026-10-18T15:00:00+00:00",
  fecha_prometida: "2026-10-21",
  entregada_en: null,
  saldo: "80.00",
};

describe("código de consulta", () => {
  it("el alfabeto no tiene caracteres confusos", () => {
    expect(ALFABETO_CODIGO).toHaveLength(31);
    expect(ALFABETO_CODIGO).not.toMatch(/[01OIL]/);
  });

  it("normaliza lo que escribe el cliente", () => {
    expect(normalizarCodigo(" abcd-efgh 2345 ")).toBe("ABCDEFGH2345");
    expect(codigoValido("ABCDEFGH2345")).toBe(true);
    expect(codigoValido("ABCDEFGH234O")).toBe(false); // O no está en el alfabeto
    expect(codigoValido("ABCDEFGH234")).toBe(false);
  });

  it("se imprime en grupos de 4 y el enlace va sin guiones", () => {
    expect(codigoLegible("ABCDEFGH2345")).toBe("ABCD-EFGH-2345");
    expect(enlaceConsulta("https://app.ejemplo.pe/", "ABCDEFGH2345")).toBe("https://app.ejemplo.pe/estado/ABCDEFGH2345");
  });
});

describe("respuesta de la consulta", () => {
  it("solo conserva los campos permitidos", () => {
    const r = leerConsulta({ ...respuesta, apellidos: "Pérez", receta: { od_esfera: -2 } });
    expect(r.tipo).toBe("encontrada");
    if (r.tipo !== "encontrada") return;
    expect(Object.keys(r.datos).sort()).toEqual([...CAMPOS_CONSULTA].sort());
    expect(JSON.stringify(r.datos)).not.toContain("Pérez");
    expect(r.datos.saldo).toBe(80);
  });

  it("null o formas inesperadas cuentan como no encontrada", () => {
    expect(leerConsulta(null).tipo).toBe("no_encontrada");
    expect(leerConsulta({}).tipo).toBe("no_encontrada");
    expect(leerConsulta({ ...respuesta, estado: "anulada" }).tipo).toBe("no_encontrada");
  });

  it("reconoce el límite de intentos", () => {
    expect(leerConsulta({ limitado: true }).tipo).toBe("limitada");
  });
});

describe("línea de tiempo", () => {
  it("agrupa los estados internos en 5 etapas", () => {
    expect(ETAPAS).toEqual(["Registrado", "Enviado al laboratorio", "En proceso", "Listo para recoger", "Entregado"]);
    expect(etapaDe("borrador")).toBe(0);
    expect(etapaDe("enviada")).toBe(1);
    expect(etapaDe("recibida_lab")).toBe(1);
    expect(etapaDe("en_proceso")).toBe(2);
    expect(etapaDe("lista")).toBe(2);
    expect(etapaDe("recibida_optica")).toBe(3);
    expect(etapaDe("entregada")).toBe(4);
  });

  it("el enlace vence 30 días después de la entrega (hora de Lima)", () => {
    expect(venceEnlace("2026-10-01T20:00:00Z")).toBe("2026-10-31");
    expect(venceEnlace("2026-10-01T03:00:00Z")).toBe("2026-10-30"); // aún era 30/09 en Lima
  });
});

describe("enlaces", () => {
  it("el WhatsApp a la sede solo menciona el número de orden", () => {
    const url = enlaceWhatsAppSede("51987654321", "#0012");
    expect(url.startsWith("https://wa.me/51987654321?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe("Hola, quisiera consultar por mi pedido #0012.");
  });

  it("el aviso de lentes listos incluye el enlace de consulta", () => {
    const m = mensajeLentesListos({ nombres: "Ana" }, "#0012", "Óptica", "https://app.ejemplo.pe/estado/ABCDEFGH2345");
    expect(m).toContain("Consulta el estado de tu pedido aquí: https://app.ejemplo.pe/estado/ABCDEFGH2345");
    expect(mensajeLentesListos({ nombres: "Ana" }, "#0012", "Óptica")).not.toContain("Consulta el estado");
  });

  it("toma la IP del primer valor de x-forwarded-for", () => {
    const cabeceras = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });
    expect(ipDeCabeceras(cabeceras({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(ipDeCabeceras(cabeceras({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(ipDeCabeceras(cabeceras({}))).toBeNull();
  });
});
