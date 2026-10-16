import { notFound } from "next/navigation";
import { z } from "zod";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/**
 * Lecturas de pacientes y recetas. Todas filtran por la óptica actual además de RLS,
 * para que un usuario con varias ópticas no mezcle datos.
 */

export type Paciente = {
  id: string;
  nombres: string;
  apellidos: string;
  tipo_documento: "DNI" | "CE" | "PASAPORTE";
  numero_documento: string | null;
  fecha_nacimiento: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  archivado_en: string | null;
  creado_en: string;
};

export type Receta = {
  id: string;
  paciente_id: string;
  fecha_examen: string;
  profesional: string | null;
  reemplaza_a: string | null;
  observaciones: string | null;
  anulada_en: string | null;
  motivo_anulacion: string | null;
  creado_en: string;
} & Record<`${"od" | "oi"}_${"esfera" | "cilindro" | "eje" | "adicion" | "dnp" | "altura" | "prisma"}`, number | null> &
  Record<`${"od" | "oi"}_base_prisma`, string | null>;

const esUuid = (v: string) => z.uuid().safeParse(v).success;

/** Quita los caracteres con significado en los filtros de PostgREST. */
const limpiarBusqueda = (q: string) =>
  q
    .replace(/[,()*%\\:."']/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);

export async function listarPacientes({ q = "", archivados = false } = {}) {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("pacientes")
    .select("id, nombres, apellidos, tipo_documento, numero_documento, telefono, fecha_nacimiento, archivado_en")
    .eq("optica_id", optica.id)
    .order("apellidos")
    .order("nombres")
    .limit(100);

  consulta = archivados ? consulta.not("archivado_en", "is", null) : consulta.is("archivado_en", null);

  // Cada palabra debe aparecer en nombres, apellidos o documento.
  for (const palabra of limpiarBusqueda(q)) {
    consulta = consulta.or(
      `nombres.ilike.*${palabra}*,apellidos.ilike.*${palabra}*,numero_documento.ilike.*${palabra}*`,
    );
  }

  const { data, error } = await consulta;
  if (error) throw new Error(`No se pudieron leer los pacientes: ${error.message}`);
  return data as Pick<
    Paciente,
    "id" | "nombres" | "apellidos" | "tipo_documento" | "numero_documento" | "telefono" | "fecha_nacimiento" | "archivado_en"
  >[];
}

export async function obtenerPaciente(id: string): Promise<Paciente> {
  if (!esUuid(id)) notFound();
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("pacientes")
    .select("*")
    .eq("optica_id", optica.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el paciente: ${error.message}`);
  if (!data) notFound();
  return data as Paciente;
}

export async function listarRecetas(pacienteId: string): Promise<Receta[]> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("recetas")
    .select("*")
    .eq("optica_id", optica.id)
    .eq("paciente_id", pacienteId)
    .order("fecha_examen", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron leer las recetas: ${error.message}`);
  return data as Receta[];
}

export async function obtenerReceta(id: string, pacienteId: string): Promise<Receta | null> {
  if (!esUuid(id)) return null;
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("recetas")
    .select("*")
    .eq("optica_id", optica.id)
    .eq("paciente_id", pacienteId)
    .eq("id", id)
    .maybeSingle();
  return (data as Receta | null) ?? null;
}
