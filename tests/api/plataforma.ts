/**
 * Acciones de la plataforma (lo que hace el superadmin) para preparar pruebas de API.
 * Usa la clave de servicio de Supabase LOCAL, que se obtiene de `supabase status`.
 * Nunca se usa contra un proyecto remoto ni llega al navegador.
 */
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

let clave: string | undefined;

function claveServicioLocal(url: string): string {
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error("La clave de servicio solo se usa con Supabase local.");
  }
  if (!clave) {
    const salida = execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    clave = JSON.parse(salida.slice(salida.indexOf("{"))).SERVICE_ROLE_KEY as string;
  }
  return clave;
}

/** Cambia el plan de una óptica como lo haría la plataforma (límites del plan Profesional). */
export async function pasarAProfesional(url: string, opticaId: string) {
  const plataforma = createClient(url, claveServicioLocal(url), { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await plataforma
    .from("opticas")
    .update({ plan: "profesional", max_usuarios: null, max_sedes: null, whatsapp_mensual: 300 })
    .eq("id", opticaId);
  if (error) throw new Error(`No se pudo cambiar el plan: ${error.message}`);
}
