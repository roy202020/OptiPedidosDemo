/**
 * OptiPedidos · Lista de recordatorios: estado de cada paciente y mensaje manual.
 */
import { describe, expect, it } from "vitest";
import { enlaceRecordatorio, estadoRecordatorio, mensajeRecordatorio, type FilaRecordatorio } from "@/lib/recordatorios";

const base: FilaRecordatorio = {
  paciente_id: "p",
  nombres: "Ana",
  apellidos: "Ficticia",
  telefono: "987 000 001",
  celular: "51987000001",
  receta_id: "r",
  fecha_examen: "2025-10-17",
  vence_en: "2026-10-17",
  sede_id: "s",
  sede: "Sede principal",
  sede_con_whatsapp: false,
  acepta: true,
  de_baja: false,
  envio_estado: null,
  envio_canal: null,
  enviado_en: null,
};

describe("estadoRecordatorio", () => {
  it("con consentimiento y celular se puede enviar", () => {
    expect(estadoRecordatorio(base)).toMatchObject({ texto: "Por recordar", puedeEnviar: true });
  });

  it.each([
    [{ acepta: false }, "Sin consentimiento"],
    [{ acepta: false, de_baja: true }, "Se dio de baja"],
    [{ celular: null }, "Sin celular"],
    [{ envio_estado: "enviado", envio_canal: "manual" }, "Enviado (manual)"],
    [{ envio_estado: "enviado", envio_canal: "automatico" }, "Enviado"],
    [{ envio_estado: "entregado", envio_canal: "automatico" }, "Entregado"],
    [{ envio_estado: "pendiente", envio_canal: "automatico" }, "Enviándose"],
  ] as const)("%j → %s sin botón de envío", (cambios, texto) => {
    expect(estadoRecordatorio({ ...base, ...cambios })).toMatchObject({ texto, puedeEnviar: false });
  });

  it("un envío fallido se puede reintentar a mano", () => {
    expect(estadoRecordatorio({ ...base, envio_estado: "fallido", envio_canal: "automatico" })).toMatchObject({ puedeEnviar: true });
  });
});

describe("mensajeRecordatorio", () => {
  it("saluda, menciona la última evaluación y explica cómo darse de baja", () => {
    const m = mensajeRecordatorio(base, "Óptica Ficticia (Sede Norte)");
    expect(m).toContain("Hola, Ana. Te saluda Óptica Ficticia (Sede Norte).");
    expect(m).toContain("17/10/2025");
    expect(m).toContain("responde BAJA");
  });

  it("arma el enlace wa.me al celular del paciente", () => {
    const url = enlaceRecordatorio(base, "Óptica");
    expect(url.startsWith("https://wa.me/51987000001?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toContain("Hola, Ana.");
  });
});
