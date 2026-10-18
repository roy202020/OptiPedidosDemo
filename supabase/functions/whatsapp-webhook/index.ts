// OptiPedidos · Edge Function whatsapp-webhook
//
// Recibe los eventos de la API de WhatsApp Business (Meta):
//   * GET: verificación del webhook (hub.verify_token).
//   * POST: respuestas de pacientes y estados de entrega.
//       - Si el paciente responde BAJA (o pulsa el botón de baja de la plantilla), se marca
//         fecha_baja en las ópticas que usan ese número: dejan de enviarse recordatorios.
//       - Los estados delivered/read/failed actualizan el historial de recordatorios.
// Es pública (verify_jwt = false) porque la llama Meta, pero cada POST se verifica con la firma
// X-Hub-Signature-256 calculada con el App Secret. Sin firma válida no se procesa nada.
//
// Secretos:
//   WHATSAPP_APP_SECRET       App Secret de la app de Meta (firma de los webhooks).
//   WHATSAPP_VERIFY_TOKEN     Texto que eliges y escribes también en Meta al configurar el webhook.
//   WHATSAPP_PHONE_NUMBER_ID  Número por defecto (el de las sedes sin número propio).

import { esBaja, firmaValida, igualesSeguro, leerEventos } from "../_shared/whatsapp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const NUMERO_POR_DEFECTO = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";

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

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Verificación inicial que hace Meta al registrar el webhook.
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && VERIFY_TOKEN
      && igualesSeguro(url.searchParams.get("hub.verify_token") ?? "", VERIFY_TOKEN);
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("Prohibido", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });

  const cuerpo = await req.text();
  if (!(await firmaValida(cuerpo, req.headers.get("x-hub-signature-256"), APP_SECRET))) {
    return new Response("Firma inválida", { status: 401 });
  }

  let resumen = { bajas: 0, estados: 0 };
  try {
    for (const e of leerEventos(JSON.parse(cuerpo))) {
      if (e.tipo === "respuesta" && esBaja(e.texto)) {
        const n = await rpc("registrar_baja_whatsapp", {
          p_phone_number_id: e.phoneNumberId,
          p_telefono: e.de,
          p_es_numero_por_defecto: Boolean(NUMERO_POR_DEFECTO) && e.phoneNumberId === NUMERO_POR_DEFECTO,
        });
        resumen = { ...resumen, bajas: resumen.bajas + Number(n ?? 0) };
      } else if (e.tipo === "estado") {
        await rpc("actualizar_estado_recordatorio", { p_mensaje_id: e.mensajeId, p_estado: e.estado, p_error: e.error ?? null });
        resumen = { ...resumen, estados: resumen.estados + 1 };
      }
    }
  } catch (error) {
    // Se responde 200 igual: Meta reintenta los webhooks fallidos y no queremos duplicar trabajo
    // por un error puntual; el error queda en los registros de la función.
    console.error("whatsapp-webhook", error);
  }
  return new Response(JSON.stringify(resumen), { status: 200, headers: { "Content-Type": "application/json" } });
});
