// OptiPedidos · Edge Function enviar-whatsapp
//
// Envía el aviso "lentes listos" de una orden por la API de WhatsApp Business (Meta Cloud API).
// La invoca la app (con la sesión del usuario) al marcar una orden como lista para entrega o al
// reintentar un aviso. Body JSON: { "orden_id": uuid } o { "notificacion_id": uuid }.
//
// Seguridad:
//   - Exige el JWT del usuario (verify_jwt) y comprueba con RLS que el aviso es de su óptica.
//   - Las credenciales de WhatsApp y la clave de servicio solo existen como secretos de la función.
//   - reclamar_notificacion() evita envíos duplicados (pendiente → enviando es atómico).
//
// Secretos (supabase secrets set …, o supabase/functions/.env en local):
//   WHATSAPP_TOKEN            Token de acceso permanente de la app de Meta (usuario del sistema).
//   WHATSAPP_PHONE_NUMBER_ID  Id del número emisor por defecto. Cada sede puede tener el suyo
//                             (sedes.whatsapp_phone_number_id): el aviso sale del número de la
//                             sede donde se vendió y se recoge el lente.
//   WHATSAPP_TEMPLATE         Nombre de la plantilla aprobada (por defecto: lentes_listos).
//   WHATSAPP_TEMPLATE_LANG    Idioma de la plantilla (por defecto: es).
//   WHATSAPP_API_URL          Opcional, base de la Graph API (por defecto: https://graph.facebook.com/v21.0).
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los provee Supabase.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const WA_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const WA_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE") ?? "lentes_listos";
const WA_LANG = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "es";
const WA_API = (Deno.env.get("WHATSAPP_API_URL") ?? "https://graph.facebook.com/v21.0").replace(/\/$/, "");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const responder = (status: number, cuerpo: Record<string, unknown>) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

/** Llamada a PostgREST con la clave indicada (anon + JWT del usuario, o service role). */
async function rest(ruta: string, init: RequestInit & { token: string; apikey: string }) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    ...init,
    headers: {
      apikey: init.apikey,
      Authorization: init.token,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`PostgREST ${r.status}: ${texto.slice(0, 200)}`);
  return texto ? JSON.parse(texto) : null;
}

const servicio = { token: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
const rpc = (fn: string, args: Record<string, unknown>) =>
  rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args), ...servicio });

/** Envía la plantilla. Devuelve el id del mensaje o lanza un error con el detalle del proveedor. */
async function enviarPlantilla(numeroEmisor: string, telefono: string, nombre: string): Promise<string> {
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
          components: [{ type: "body", parameters: [{ type: "text", text: nombre }] }],
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
  const token = req.headers.get("Authorization");
  if (!token) return responder(401, { error: "Sin sesión" });

  const cuerpo = await req.json().catch(() => ({}));
  const notificacionId = typeof cuerpo.notificacion_id === "string" ? cuerpo.notificacion_id : null;
  const ordenId = typeof cuerpo.orden_id === "string" ? cuerpo.orden_id : null;
  const filtro = notificacionId && UUID.test(notificacionId) ? `id=eq.${notificacionId}` : ordenId && UUID.test(ordenId) ? `orden_id=eq.${ordenId}` : null;
  if (!filtro) return responder(400, { error: "Indica orden_id o notificacion_id" });

  try {
    // 1. ¿El aviso existe y es de la óptica del usuario? (RLS con su propio JWT)
    const visibles = await rest(`notificaciones?${filtro}&select=id,estado&limit=1`, { method: "GET", token, apikey: ANON_KEY });
    if (!visibles?.length) return responder(404, { error: "Aviso no encontrado" });
    const id: string = visibles[0].id;

    // 2. Reclamarlo (si otro proceso ya lo envía o ya se envió, no hace nada).
    const aviso = await rpc("reclamar_notificacion", { p_id: id });
    if (!aviso) return responder(200, { estado: visibles[0].estado, enviado: false });

    // 3. Enviar, o registrar por qué no se pudo.
    const numeroEmisor: string = aviso.phone_number_id || WA_PHONE_ID;
    if (!WA_TOKEN || !numeroEmisor) {
      await rpc("registrar_envio", {
        p_id: id,
        p_ok: false,
        p_error: "WhatsApp no está configurado: falta el secreto WHATSAPP_TOKEN o el número de WhatsApp de la sede (ni hay WHATSAPP_PHONE_NUMBER_ID por defecto)",
      });
      return responder(200, { estado: "fallida", enviado: false });
    }
    try {
      const mensajeId = await enviarPlantilla(numeroEmisor, aviso.telefono, aviso.paciente ?? "");
      await rpc("registrar_envio", { p_id: id, p_ok: true, p_mensaje_id: mensajeId });
      return responder(200, { estado: "enviada", enviado: true });
    } catch (e) {
      const mensaje = e instanceof DOMException && e.name === "AbortError" ? "WhatsApp no respondió a tiempo" : String((e as Error).message ?? e);
      await rpc("registrar_envio", { p_id: id, p_ok: false, p_error: mensaje });
      return responder(200, { estado: "fallida", enviado: false });
    }
  } catch (e) {
    console.error("enviar-whatsapp", e);
    return responder(500, { error: "Error interno al procesar el aviso" });
  }
});
