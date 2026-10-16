import { crearClienteServidor } from "@/lib/supabase/servidor";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

/**
 * Avisos por WhatsApp. El aviso se encola en la base (trigger) al marcar la orden como lista;
 * aquí solo se pide a la Edge Function enviar-whatsapp que lo procese. Nunca lanza errores:
 * si la función o el proveedor fallan, el aviso queda "fallido" y se puede reintentar.
 * Recibe un cliente ya creado para poder usarse dentro de after() (fuera del render).
 */
export async function procesarAviso(supabase: Cliente, destino: { orden_id: string } | { notificacion_id: string }): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("enviar-whatsapp", { body: destino });
    if (error) console.error("No se pudo invocar enviar-whatsapp:", error.message);
  } catch (e) {
    console.error("No se pudo invocar enviar-whatsapp:", e);
  }
}

export type EstadoAviso = "pendiente" | "enviando" | "enviada" | "fallida" | "omitida";

export type Aviso = {
  id: string;
  telefono: string | null;
  estado: EstadoAviso;
  intentos: number;
  ultimo_error: string | null;
  creado_en: string;
  ultimo_intento_en: string | null;
  enviado_en: string | null;
};

/** Aviso de una orden (o null si la orden aún no llegó a "Listo para entrega"). */
export async function avisoDeOrden(ordenId: string): Promise<Aviso | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("notificaciones")
    .select("id, telefono, estado, intentos, ultimo_error, creado_en, ultimo_intento_en, enviado_en")
    .eq("orden_id", ordenId)
    .eq("tipo", "orden_lista")
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el aviso: ${error.message}`);
  return data as Aviso | null;
}
