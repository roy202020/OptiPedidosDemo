"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { EstadoFormulario } from "@/app/(acceso)/acciones";
import { obtenerOpticaActual, obtenerUsuario } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const esquema = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre de la óptica").max(120, "Máximo 120 caracteres"),
});

export async function crearOptica(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  await obtenerUsuario();
  // Evita duplicados por doble envío: por ahora cada usuario gestiona una sola óptica.
  if (await obtenerOpticaActual()) redirect("/panel");

  const valores = { nombre: String(datos.get("nombre") ?? "") };
  const r = esquema.safeParse(Object.fromEntries(datos));
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("crear_optica", { p_nombre: r.data.nombre });
  if (error) return { error: "No se pudo registrar la óptica. Inténtalo de nuevo.", valores };

  redirect("/panel");
}
