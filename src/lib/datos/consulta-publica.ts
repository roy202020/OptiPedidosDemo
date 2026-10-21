import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { connection } from "next/server";
import QRCode from "qrcode";
import { ipDeCabeceras, leerConsulta, type ResultadoConsulta } from "@/lib/ordenes/consulta-publica";

/**
 * Consulta pública del estado del pedido. Usa siempre el rol anon (sin la sesión de quien
 * navega), que solo puede ejecutar public.consulta_estado_publico(). El límite de intentos
 * por IP lo aplica la base; aquí solo se le pasa la IP que informa el proxy de la plataforma.
 */
export async function consultarEstadoPublico(codigo: string): Promise<ResultadoConsulta> {
  await connection();
  const ip = ipDeCabeceras(await headers());
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await anon.rpc("consulta_estado_publico", { p_codigo: codigo.slice(0, 64), p_ip: ip });
  if (error) throw new Error(`No se pudo consultar el pedido: ${error.message}`);
  return leerConsulta(data);
}

/** Dirección pública de la app: NEXT_PUBLIC_SITE_URL o, si no existe, el origen de la petición. */
export async function urlPublica(): Promise<string> {
  const configurada = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configurada) return configurada.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${protocolo}://${host}`;
}

/** Código QR como SVG (texto) para incrustar en el ticket. */
export const qrSvg = (texto: string) => QRCode.toString(texto, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
