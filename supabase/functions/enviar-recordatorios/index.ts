// OptiPedidos · Edge Function enviar-recordatorios
//
// Envía los recordatorios de control visual del día. La llama la tarea programada de la base
// (pg_cron + pg_net, 10:00 de Lima) con la cabecera x-cron-secret. No la usa el navegador.
//
// Reglas (todas se comprueban de nuevo en la base al reclamar cada envío):
//   * Solo ópticas con plan Profesional y envío automático activo, entre 9:00 y 19:00 de Lima.
//   * Consentimiento vigente, sin baja, no archivado, sin receta más nueva, un envío por ciclo.
//   * Tope mensual de mensajes de la óptica.
//   * Sale del número de la sede de la última evaluación (o del número por defecto).
//
// Secretos:
//   RECORDATORIOS_CRON_SECRET   Secreto compartido con la tarea programada (también en Vault).
//   WHATSAPP_TOKEN              Token de la app de Meta. Nunca llega al navegador.
//   WHATSAPP_PHONE_NUMBER_ID    Número por defecto (sedes sin número propio).
//   WHATSAPP_TEMPLATE_RECORDATORIO  Plantilla de MARKETING (por defecto: recordatorio_control).
//   WHATSAPP_TEMPLATE_LANG      Idioma (por defecto: es).
//   WHATSAPP_API_URL            Opcional (por defecto: https://graph.facebook.com/v21.0).

import { igualesSeguro } from "../_shared/whatsapp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("RECORDATORIOS_CRON_SECRET") ?? "";
const WA_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const WA_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE_RECORDATORIO") ?? "recordatorio_control";
const WA_LANG = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "es";
const WA_API = (Deno.env.get("WHATSAPP_API_URL") ?? "https://graph.facebook.com/v21.0").replace(/\/$/, "");

const responder = (status: number, cuerpo: Record<string, unknown>) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${fn} ${r.status}: ${texto.slice(0, 200)}`);
  return texto ? JSON.parse(texto) : null;
}

/** Plantilla de marketing: {{1}} nombre del paciente, {{2}} óptica y sede. El botón de baja es parte de la plantilla. */
async function enviarPlantilla(numeroEmisor: string, telefono: string, nombre: string, remitente: string): Promise<string> {
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), 10_000);
  try {
    const r = await fetch(`${WA_API}/${numeroEmisor}/messages`, {
      method: "POST",
      signal: controlador.signal,
      headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        type: "template",
        template: {
          name: WA_TEMPLATE,
          language: { code: WA_LANG },
          components: [{ type: "body", parameters: [{ type: "text", text: nombre }, { type: "text", text: remitente }] }],
        },
      }),
    });
    const datos = await r.json().catch(() => ({}));
    const id = datos?.messages?.[0]?.id;
    if (!r.ok || !id) {
      const e = datos?.error;
      throw new Error(e ? `WhatsApp ${e.code ?? r.status}: ${e.message ?? "error"}` : `WhatsApp respondió ${r.status}`);
    }
    return id;
  } finally {
    clearTimeout(limite);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return responder(405, { error: "Método no permitido" });
  if (!CRON_SECRET || !igualesSeguro(req.headers.get("x-cron-secret") ?? "", CRON_SECRET)) {
    return responder(401, { error: "No autorizado" });
  }

  const resumen = { candidatos: 0, enviados: 0, fallidos: 0, omitidos: 0 };
  try {
    const candidatos: { paciente_id: string; receta_id: string }[] = (await rpc("recordatorios_para_enviar", {})) ?? [];
    resumen.candidatos = candidatos.length;

    for (const c of candidatos) {
      // La base vuelve a comprobar todo (horario, tope, consentimiento, ciclo) y bloquea la óptica.
      const envio = await rpc("reclamar_recordatorio", { p_paciente: c.paciente_id, p_receta: c.receta_id });
      if (!envio) {
        resumen.omitidos++;
        continue;
      }
      const numeroEmisor: string = envio.phone_number_id || WA_PHONE_ID;
      if (!WA_TOKEN || !numeroEmisor) {
        await rpc("registrar_recordatorio", {
          p_id: envio.id,
          p_ok: false,
          p_error: "WhatsApp no está configurado: falta WHATSAPP_TOKEN o el número de la sede (ni hay WHATSAPP_PHONE_NUMBER_ID por defecto)",
        });
        resumen.fallidos++;
        continue;
      }
      try {
        const remitente = envio.sede && envio.sede !== "Sede principal" ? `${envio.optica} (${envio.sede})` : envio.optica;
        const mensajeId = await enviarPlantilla(numeroEmisor, envio.telefono, envio.paciente ?? "", remitente);
        await rpc("registrar_recordatorio", { p_id: envio.id, p_ok: true, p_mensaje_id: mensajeId });
        resumen.enviados++;
      } catch (e) {
        const mensaje = e instanceof DOMException && e.name === "AbortError" ? "WhatsApp no respondió a tiempo" : String((e as Error).message ?? e);
        await rpc("registrar_recordatorio", { p_id: envio.id, p_ok: false, p_error: mensaje });
        resumen.fallidos++;
      }
    }
    return responder(200, resumen);
  } catch (e) {
    console.error("enviar-recordatorios", e);
    return responder(500, { ...resumen, error: "Error interno al enviar recordatorios" });
  }
});
