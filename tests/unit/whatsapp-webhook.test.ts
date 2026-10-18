/**
 * OptiPedidos · Webhook de WhatsApp: baja por respuesta, firma de Meta y lectura de eventos.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { esBaja, firmaValida, leerEventos } from "../../supabase/functions/_shared/whatsapp";

describe("esBaja", () => {
  it.each(["BAJA", "baja", " Baja. ", "BÁJA", "Darme de baja", "STOP", "detener promociones"])("%j pide la baja", (t) => {
    expect(esBaja(t)).toBe(true);
  });
  it.each(["Hola", "¿Cuándo abren?", "bajada", "No baja", "", null])("%j no pide la baja", (t) => {
    expect(esBaja(t)).toBe(false);
  });
});

describe("firmaValida", () => {
  const secreto = "secreto-ficticio";
  const cuerpo = JSON.stringify({ entry: [] });
  const firma = `sha256=${createHmac("sha256", secreto).update(cuerpo).digest("hex")}`;

  it("acepta la firma correcta", async () => {
    expect(await firmaValida(cuerpo, firma, secreto)).toBe(true);
  });
  it("rechaza cuerpo alterado, firma ausente o secreto vacío", async () => {
    expect(await firmaValida(`${cuerpo} `, firma, secreto)).toBe(false);
    expect(await firmaValida(cuerpo, null, secreto)).toBe(false);
    expect(await firmaValida(cuerpo, firma, "")).toBe(false);
    expect(await firmaValida(cuerpo, "sha256=abc", secreto)).toBe(false);
  });
});

describe("leerEventos", () => {
  it("lee respuestas de texto y de botón, y estados de entrega", () => {
    const eventos = leerEventos({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "1111111111" },
                messages: [
                  { from: "51987000006", type: "text", text: { body: "BAJA" } },
                  { from: "51987000007", type: "button", button: { text: "Darme de baja", payload: "BAJA" } },
                ],
                statuses: [
                  { id: "wamid.A", status: "delivered" },
                  { id: "wamid.B", status: "failed", errors: [{ title: "Número no válido" }] },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(eventos).toEqual([
      { tipo: "respuesta", phoneNumberId: "1111111111", de: "51987000006", texto: "BAJA" },
      { tipo: "respuesta", phoneNumberId: "1111111111", de: "51987000007", texto: "Darme de baja" },
      { tipo: "estado", phoneNumberId: "1111111111", mensajeId: "wamid.A", estado: "delivered", error: undefined },
      { tipo: "estado", phoneNumberId: "1111111111", mensajeId: "wamid.B", estado: "failed", error: "Número no válido" },
    ]);
  });

  it("ignora cuerpos vacíos o desconocidos", () => {
    expect(leerEventos({})).toEqual([]);
    expect(leerEventos(null)).toEqual([]);
  });
});
