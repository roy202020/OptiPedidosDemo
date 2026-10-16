import { redirect } from "next/navigation";
import { cache } from "react";
import { tienePermiso, type Permiso } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/**
 * Capa de acceso a la sesión. Toda página o acción privada debe pasar por aquí:
 * el proxy solo redirige, no protege los datos.
 */

export type Usuario = { id: string; email: string };

export type OpticaActual = {
  id: string;
  nombre: string;
  rol: "propietario" | "administrador" | "operador";
};

/** Usuario autenticado (validado contra Supabase Auth) o redirección a /ingresar. */
export const obtenerUsuario = cache(async (): Promise<Usuario> => {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/ingresar");
  return { id: data.user.id, email: data.user.email ?? "" };
});

/**
 * Primera óptica activa del usuario, o null si todavía no pertenece a ninguna.
 * RLS ya limita la consulta a las membresías propias.
 */
export const obtenerOpticaActual = cache(async (): Promise<OpticaActual | null> => {
  const usuario = await obtenerUsuario();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("miembros")
    .select("rol, opticas(id, nombre)")
    .eq("usuario_id", usuario.id)
    .eq("activo", true)
    .order("creado_en")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer la óptica: ${error.message}`);
  if (!data?.opticas) return null;

  const optica = data.opticas as unknown as { id: string; nombre: string };
  return { id: optica.id, nombre: optica.nombre, rol: data.rol };
});

/** Para páginas que requieren tener una óptica: si no hay, lleva al alta. */
export async function exigirOptica(): Promise<OpticaActual> {
  const optica = await obtenerOpticaActual();
  if (!optica) redirect("/nueva-optica");
  return optica;
}

/** Para páginas y acciones restringidas por rol: sin permiso, vuelve al panel. */
export async function exigirPermiso(permiso: Permiso): Promise<OpticaActual> {
  const optica = await exigirOptica();
  if (!tienePermiso(optica.rol, permiso)) redirect("/panel");
  return optica;
}
