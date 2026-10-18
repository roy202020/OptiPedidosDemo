// OptiPedidos · Utilidades puras de WhatsApp compartidas por las Edge Functions.
// Sin APIs de Deno: también se prueban con Vitest (tests/unit/whatsapp-webhook.test.ts).

/** Texto normalizado: sin tildes, sin signos, en mayúsculas y con espacios simples. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Respuestas que significan "no quiero más recordatorios". */
const BAJAS = new Set(["BAJA", "DAR DE BAJA", "DARME DE BAJA", "STOP", "DETENER", "DETENER PROMOCIONES", "NO MAS", "NO DESEO RECIBIR"]);

/** ¿El texto del paciente (o el del botón de la plantilla) pide la baja? */
export function esBaja(texto: string | null | undefined): boolean {
  if (!texto) return false;
  return BAJAS.has(normalizarTexto(texto));
}

/** Comparación en tiempo constante (evita filtrar el secreto por tiempos de respuesta). */
export function igualesSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

/** Verifica la cabecera X-Hub-Signature-256 de Meta (HMAC-SHA256 del cuerpo con el App Secret). */
export async function firmaValida(cuerpo: string, cabecera: string | null, secreto: string): Promise<boolean> {
  if (!cabecera?.startsWith("sha256=") || !secreto) return false;
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(cuerpo));
  const hex = Array.from(new Uint8Array(firma), (b) => b.toString(16).padStart(2, "0")).join("");
  return igualesSeguro(hex, cabecera.slice("sha256=".length));
}

export type EventoWebhook =
  | { tipo: "respuesta"; phoneNumberId: string; de: string; texto: string }
  | { tipo: "estado"; phoneNumberId: string; mensajeId: string; estado: string; error?: string };

/** Extrae respuestas de pacientes y estados de entrega del cuerpo del webhook de Meta. */
export function leerEventos(cuerpo: unknown): EventoWebhook[] {
  const eventos: EventoWebhook[] = [];
  const entradas = (cuerpo as { entry?: unknown[] })?.entry ?? [];
  for (const entrada of entradas as { changes?: { value?: Record<string, unknown> }[] }[]) {
    for (const cambio of entrada.changes ?? []) {
      const v = cambio.value ?? {};
      const phoneNumberId = String((v.metadata as { phone_number_id?: string })?.phone_number_id ?? "");
      for (const m of (v.messages as Record<string, any>[] | undefined) ?? []) {
        const texto = m.text?.body ?? m.button?.text ?? m.button?.payload ?? m.interactive?.button_reply?.title ?? "";
        if (m.from && texto) eventos.push({ tipo: "respuesta", phoneNumberId, de: String(m.from), texto: String(texto) });
      }
      for (const s of (v.statuses as Record<string, any>[] | undefined) ?? []) {
        if (s.id && s.status) {
          eventos.push({ tipo: "estado", phoneNumberId, mensajeId: String(s.id), estado: String(s.status), error: s.errors?.[0]?.title ?? s.errors?.[0]?.message });
        }
      }
    }
  }
  return eventos;
}
