import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { tienePermiso, type Permiso } from "@/lib/permisos";
import { resolverSede, sedeDeRegistro, TODAS_LAS_SEDES } from "@/lib/sedes";
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

// ------------------------------------------------------------------ sedes

export type Sede = {
  id: string;
  nombre: string;
  activa: boolean;
  direccion: string | null;
  telefono: string | null;
  horario: string | null;
  whatsapp_phone_number_id: string | null;
};

export { TODAS_LAS_SEDES };
export const COOKIE_SEDE = "sede";

/** Sedes que el usuario puede ver (RLS: el propietario todas, el resto las asignadas). */
export const obtenerSedes = cache(async (): Promise<Sede[]> => {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("sedes")
    .select("id, nombre, activa, direccion, telefono, horario, whatsapp_phone_number_id")
    .eq("optica_id", optica.id)
    .order("activa", { ascending: false })
    .order("nombre");
  if (error) throw new Error(`No se pudieron leer las sedes: ${error.message}`);
  return data as Sede[];
});

export type SedeActual = {
  optica: OpticaActual;
  sedes: Sede[];
  /** Sede elegida en el selector, o null si se ven todas (o el usuario no tiene ninguna). */
  actual: Sede | null;
};

/**
 * Sede elegida en el selector (cookie). La cookie solo es una preferencia: se valida contra
 * las sedes visibles del usuario y, si no sirve, se usa su primera sede activa.
 */
export const obtenerSedeActual = cache(async (): Promise<SedeActual> => {
  const [optica, sedes, galletas] = await Promise.all([exigirOptica(), obtenerSedes(), cookies()]);
  return { optica, sedes, actual: resolverSede(sedes, galletas.get(COOKIE_SEDE)?.value) };
});

/** Id de la sede para filtrar consultas; null = todas las sedes visibles (RLS limita el resto). */
export async function sedeFiltro(): Promise<string | null> {
  return (await obtenerSedeActual()).actual?.id ?? null;
}

/**
 * Sede donde se registra algo nuevo (pedido, compra, meta…). Con "todas las sedes" elegido solo
 * sirve si el usuario tiene una única sede activa. La base vuelve a validar el acceso.
 */
export async function sedeParaRegistrar(): Promise<{ sede: Sede; error?: undefined } | { sede?: undefined; error: string }> {
  const { sedes, actual } = await obtenerSedeActual();
  return sedeDeRegistro(sedes, actual);
}

// ------------------------------------------------------------------ plataforma

/** El usuario es superadmin de la plataforma (tabla superadmins, cargada solo por SQL). */
export const esSuperadmin = cache(async (): Promise<boolean> => {
  await obtenerUsuario();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("es_superadmin");
  if (error) throw new Error(`No se pudo comprobar el acceso: ${error.message}`);
  return data === true;
});

/** Para el panel de la plataforma: quien no es superadmin vuelve a su panel. Las funciones lo revalidan. */
export async function exigirSuperadmin(): Promise<Usuario> {
  const [usuario, es] = await Promise.all([obtenerUsuario(), esSuperadmin()]);
  if (!es) redirect("/panel");
  return usuario;
}
