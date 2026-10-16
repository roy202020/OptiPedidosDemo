import { notFound } from "next/navigation";
import { z } from "zod";
import {
  ACTIVOS,
  INTERNOS_DE,
  PENDIENTES_DE_LLEGAR,
  type EstadoComercial,
  type EstadoInterno,
} from "@/lib/ordenes/estados";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { hoyISO } from "@/lib/validacion/comun";

export const ORDENES_POR_PAGINA = 20;

export type FiltrosOrdenes = {
  estado?: EstadoComercial;
  laboratorio?: string;
  paciente?: string;
  q?: string;
  desde?: string;
  hasta?: string;
  atrasadas?: boolean;
  pagina?: number;
};

export type OrdenResumen = {
  id: string;
  numero: number;
  estado: EstadoInterno;
  prioridad: "normal" | "urgente";
  tipo_trabajo: "lentes_completos" | "solo_lunas";
  fecha_entrega_prometida: string | null;
  creado_en: string;
  paciente: { id: string; nombres: string; apellidos: string; telefono: string | null };
  laboratorio: { id: string; nombre: string } | null;
};

const COLUMNAS_RESUMEN =
  "id, numero, estado, prioridad, tipo_trabajo, fecha_entrega_prometida, creado_en, paciente:pacientes!inner(id, nombres, apellidos, telefono), laboratorio:laboratorios(id, nombre)";

const esUuid = (v?: string) => Boolean(v && z.uuid().safeParse(v).success);
const esFecha = (v?: string) => Boolean(v && z.iso.date().safeParse(v).success);
const diaSiguiente = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const palabras = (q: string) =>
  q
    .replace(/[,()*%\\:."'#]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);

/** Aplica los filtros comunes a una consulta de órdenes (tabla y tablero). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- el tipo del query builder de PostgREST es muy profundo
function aplicarFiltros<Q extends { [k: string]: any }>(consulta: Q, f: FiltrosOrdenes): Q {
  let c = consulta;
  if (f.estado) c = c.in("estado", INTERNOS_DE[f.estado]);
  if (esUuid(f.laboratorio)) c = c.eq("laboratorio_id", f.laboratorio);
  if (esUuid(f.paciente)) c = c.eq("paciente_id", f.paciente);
  if (esFecha(f.desde)) c = c.gte("creado_en", f.desde);
  if (esFecha(f.hasta)) c = c.lt("creado_en", diaSiguiente(f.hasta!));
  if (f.atrasadas) c = c.in("estado", PENDIENTES_DE_LLEGAR).lt("fecha_entrega_prometida", hoyISO());

  const q = (f.q ?? "").trim();
  if (/^#?\d{1,9}$/.test(q)) {
    c = c.eq("numero", Number(q.replace("#", "")));
  } else {
    // Cada palabra debe aparecer en el nombre o apellido del paciente.
    for (const p of palabras(q)) c = c.or(`nombres.ilike.*${p}*,apellidos.ilike.*${p}*`, { referencedTable: "pacientes" });
  }
  return c;
}

export async function listarOrdenes(f: FiltrosOrdenes) {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const pagina = Math.max(1, f.pagina ?? 1);

  const consulta = aplicarFiltros(
    supabase.from("ordenes").select(COLUMNAS_RESUMEN, { count: "exact" }).eq("optica_id", optica.id),
    f,
  )
    .order("creado_en", { ascending: false })
    .range((pagina - 1) * ORDENES_POR_PAGINA, pagina * ORDENES_POR_PAGINA - 1);

  const { data, error, count } = await consulta;
  if (error?.code === "PGRST103") return { ordenes: [] as OrdenResumen[], total: count ?? 0 };
  if (error) throw new Error(`No se pudieron leer las órdenes: ${error.message}`);
  return { ordenes: data as unknown as OrdenResumen[], total: count ?? 0 };
}

/** Órdenes para el tablero: activas más las entregadas en los últimos 14 días. */
export async function listarTablero(f: FiltrosOrdenes) {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const hace14 = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const base = () => supabase.from("ordenes").select(COLUMNAS_RESUMEN).eq("optica_id", optica.id);
  const [activas, entregadas] = await Promise.all([
    aplicarFiltros(base().in("estado", ACTIVOS), { ...f, estado: undefined }).order("fecha_entrega_prometida").limit(300),
    f.atrasadas
      ? Promise.resolve({ data: [], error: null })
      : aplicarFiltros(base().eq("estado", "entregada").gte("actualizado_en", hace14), { ...f, estado: undefined })
          .order("actualizado_en", { ascending: false })
          .limit(50),
  ]);
  const error = activas.error ?? entregadas.error;
  if (error) throw new Error(`No se pudo leer el tablero: ${error.message}`);
  return [...(activas.data ?? []), ...(entregadas.data ?? [])] as unknown as OrdenResumen[];
}

export type OrdenOjo = {
  ojo: "OD" | "OI";
  esfera: number | null;
  cilindro: number | null;
  eje: number | null;
  adicion: number | null;
  dnp: number | null;
  altura: number | null;
  prisma: number | null;
  base_prisma: string | null;
  material: string | null;
  indice: number | null;
  diseno: string | null;
  tratamientos: string[];
  tinte: string | null;
  diametro_mm: number | null;
  observaciones: string | null;
};

export type OrdenDetalle = OrdenResumen & {
  optica_id: string;
  receta_id: string;
  laboratorio_id: string;
  montura_descripcion: string | null;
  montura_origen: "optica" | "paciente" | null;
  motivo_anulacion: string | null;
  anulada_en: string | null;
  creado_por: string;
  actualizado_en: string;
  precio: number;
  descuento: number;
  confirmada_en: string | null;
  paciente: OrdenResumen["paciente"] & { email: string | null };
  laboratorio: { id: string; nombre: string; telefono: string | null; contacto: string | null; activo: boolean };
  receta: { id: string; fecha_examen: string; profesional: string | null; anulada_en: string | null };
  ojos: OrdenOjo[];
  historial: { id: string; desde: EstadoInterno | null; hasta: EstadoInterno; usuario_id: string | null; creado_en: string }[];
  observaciones: { id: string; texto: string; creado_por: string; creado_en: string }[];
};

export async function obtenerOrden(id: string) {
  if (!esUuid(id)) notFound();
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();

  const [orden, miembros] = await Promise.all([
    supabase
      .from("ordenes")
      .select(
        `*,
         paciente:pacientes(id, nombres, apellidos, telefono, email),
         laboratorio:laboratorios(id, nombre, telefono, contacto, activo),
         receta:recetas(id, fecha_examen, profesional, anulada_en),
         ojos:orden_ojos(*),
         historial:orden_historial_estados(id, desde, hasta, usuario_id, creado_en),
         observaciones:orden_observaciones(id, texto, creado_por, creado_en)`,
      )
      .eq("optica_id", optica.id)
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("miembros_optica", { p_optica: optica.id }),
  ]);
  if (orden.error) throw new Error(`No se pudo leer la orden: ${orden.error.message}`);
  if (!orden.data) notFound();

  const o = orden.data as unknown as OrdenDetalle;
  o.ojos.sort((a, b) => a.ojo.localeCompare(b.ojo));
  o.historial.sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  o.observaciones.sort((a, b) => b.creado_en.localeCompare(a.creado_en));

  const correos = new Map(((miembros.data ?? []) as { usuario_id: string; email: string }[]).map((m) => [m.usuario_id, m.email]));
  return { orden: o, usuario: (uid: string | null) => (uid && correos.get(uid)) || "Usuario desconocido" };
}

/** Estados a los que puede pasar una orden según la tabla transiciones_estado (fuente de verdad). */
export async function transicionesDesde(estado: EstadoInterno): Promise<EstadoInterno[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("transiciones_estado").select("hasta").eq("desde", estado);
  if (error) throw new Error(`No se pudieron leer las transiciones: ${error.message}`);
  return (data as { hasta: EstadoInterno }[]).map((t) => t.hasta);
}

/** Recetas que se pueden usar en una orden: no anuladas y no reemplazadas por otra válida. */
export async function recetasUtilizables(pacienteId: string) {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("recetas")
    .select("id, fecha_examen, profesional, reemplaza_a, anulada_en, od_esfera, od_cilindro, od_eje, oi_esfera, oi_cilindro, oi_eje, od_adicion, oi_adicion")
    .eq("optica_id", optica.id)
    .eq("paciente_id", pacienteId)
    .order("fecha_examen", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron leer las recetas: ${error.message}`);
  const reemplazadas = new Set(data.filter((r) => !r.anulada_en && r.reemplaza_a).map((r) => r.reemplaza_a));
  return data.filter((r) => !r.anulada_en && !reemplazadas.has(r.id));
}
