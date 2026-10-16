import { notFound } from "next/navigation";
import { z } from "zod";
import { aCilindroNegativo, type EstadoStock, type TipoMovimiento } from "@/lib/inventario/medidas";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/**
 * Lecturas del inventario de lunas. Todas filtran por la óptica actual además de RLS.
 * Las existencias se leen de la vista lunas_existencias (disponible y estado calculados).
 */

export type Producto = {
  id: string;
  nombre: string;
  tipo: string;
  material: string | null;
  indice: number | null;
  tratamiento: string | null;
  color_tratamiento: string | null;
  vision: "monofocal" | "bifocal" | "progresivo" | "ocupacional";
  superficie: string | null;
  por_lado: boolean;
  proveedor: string | null;
  costo_referencial: number | null;
  stock_minimo_defecto: number;
  activo: boolean;
};

export type Existencia = {
  id: string;
  producto_id: string;
  producto: string;
  tipo: string;
  material: string | null;
  indice: number | null;
  tratamiento: string | null;
  color_tratamiento: string | null;
  vision: Producto["vision"];
  por_lado: boolean;
  esfera: number;
  cilindro: number;
  eje: number | null;
  adicion: number | null;
  lado: "OD" | "OI" | null;
  stock: number;
  reservado: number;
  disponible: number;
  stock_minimo: number;
  ubicacion: string | null;
  activo: boolean;
  estado_stock: EstadoStock;
};

export const EXISTENCIAS_POR_PAGINA = 50;
const esUuid = (v?: string | null) => Boolean(v && z.uuid().safeParse(v).success);
const num = (v: unknown) => (v == null ? null : Number(v));

/** Normaliza números que PostgREST devuelve como texto (numeric). */
function existencia(r: Record<string, unknown>): Existencia {
  return {
    ...(r as unknown as Existencia),
    esfera: Number(r.esfera),
    cilindro: Number(r.cilindro),
    adicion: num(r.adicion),
    indice: num(r.indice),
  };
}

export async function listarProductos({ incluirInactivos = true } = {}) {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  let q = supabase.from("lunas_productos").select("*").eq("optica_id", optica.id).order("activo", { ascending: false }).order("nombre");
  if (!incluirInactivos) q = q.eq("activo", true);
  const [productos, existencias] = await Promise.all([
    q,
    supabase.from("lunas_existencias").select("producto_id, stock, disponible, estado_stock, stock_minimo").eq("optica_id", optica.id).limit(20000),
  ]);
  const error = productos.error ?? existencias.error;
  if (error) throw new Error(`No se pudo leer el inventario: ${error.message}`);

  const resumen = new Map<string, { medidas: number; stock: number; disponible: number; alertas: number }>();
  for (const e of existencias.data as { producto_id: string; stock: number; disponible: number; estado_stock: EstadoStock; stock_minimo: number }[]) {
    const r = resumen.get(e.producto_id) ?? { medidas: 0, stock: 0, disponible: 0, alertas: 0 };
    r.medidas++;
    r.stock += e.stock;
    r.disponible += e.disponible;
    if (e.stock_minimo > 0 && e.estado_stock !== "ok") r.alertas++;
    resumen.set(e.producto_id, r);
  }
  return (productos.data as Producto[]).map((p) => ({
    ...p,
    indice: num(p.indice),
    resumen: resumen.get(p.id) ?? { medidas: 0, stock: 0, disponible: 0, alertas: 0 },
  }));
}

export async function obtenerProducto(id: string): Promise<Producto> {
  if (!esUuid(id)) notFound();
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("lunas_productos").select("*").eq("optica_id", optica.id).eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo leer el producto: ${error.message}`);
  if (!data) notFound();
  return { ...(data as Producto), indice: num(data.indice), costo_referencial: num(data.costo_referencial) };
}

export async function existenciasDeProducto(productoId: string): Promise<Existencia[]> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("lunas_existencias")
    .select("*")
    .eq("optica_id", optica.id)
    .eq("producto_id", productoId)
    .order("esfera", { ascending: false })
    .order("cilindro", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`No se pudieron leer las existencias: ${error.message}`);
  return data.map(existencia);
}

export type FiltrosExistencias = {
  producto?: string;
  esfera?: number | null;
  cilindro?: number | null;
  indice?: number | null;
  tratamiento?: string;
  estado?: "disponible" | "bajo" | "agotado" | "reponer";
  pagina?: number;
};

export async function buscarExistencias(f: FiltrosExistencias) {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const pagina = Math.max(1, f.pagina ?? 1);
  let q = supabase.from("lunas_existencias").select("*", { count: "exact" }).eq("optica_id", optica.id).eq("activo", true);
  if (esUuid(f.producto)) q = q.eq("producto_id", f.producto!);
  if (f.esfera != null) q = q.eq("esfera", f.esfera);
  if (f.cilindro != null) q = q.eq("cilindro", f.cilindro);
  if (f.indice != null) q = q.eq("indice", f.indice);
  const tratamiento = (f.tratamiento ?? "").replace(/[,()*%\\:."']/g, " ").trim();
  if (tratamiento) q = q.or(`tratamiento.ilike.*${tratamiento}*,color_tratamiento.ilike.*${tratamiento}*,producto.ilike.*${tratamiento}*`);
  if (f.estado === "disponible") q = q.gt("disponible", 0);
  if (f.estado === "bajo") q = q.eq("estado_stock", "bajo");
  if (f.estado === "agotado") q = q.eq("estado_stock", "agotado");
  if (f.estado === "reponer") q = q.in("estado_stock", ["bajo", "agotado"]).gt("stock_minimo", 0);

  const { data, error, count } = await q
    .order("producto")
    .order("esfera", { ascending: false })
    .order("cilindro", { ascending: false })
    .range((pagina - 1) * EXISTENCIAS_POR_PAGINA, pagina * EXISTENCIAS_POR_PAGINA - 1);
  if (error?.code === "PGRST103") return { existencias: [] as Existencia[], total: count ?? 0 };
  if (error) throw new Error(`No se pudieron buscar las existencias: ${error.message}`);
  return { existencias: data.map(existencia), total: count ?? 0 };
}

/** Todas las existencias que cumplen el filtro (para exportar a Excel). */
export async function exportarExistencias(f: Omit<FiltrosExistencias, "pagina">) {
  const filas: Existencia[] = [];
  for (let pagina = 1; pagina <= 400; pagina++) {
    const { existencias, total } = await buscarExistencias({ ...f, pagina });
    filas.push(...existencias);
    if (filas.length >= total || existencias.length === 0) break;
  }
  return filas;
}

/** Medidas con mínimo configurado que están bajo el mínimo o agotadas. */
export async function contarAlertas() {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const base = () =>
    supabase.from("lunas_existencias").select("id", { count: "exact", head: true }).eq("optica_id", optica.id).eq("activo", true).gt("stock_minimo", 0);
  const [bajo, agotado] = await Promise.all([base().eq("estado_stock", "bajo"), base().eq("estado_stock", "agotado")]);
  return { bajo: bajo.count ?? 0, agotado: agotado.count ?? 0 };
}

export type Movimiento = {
  id: number;
  tipo: TipoMovimiento;
  cantidad: number;
  stock_anterior: number;
  stock_resultante: number;
  motivo: string | null;
  lote: string | null;
  costo_unitario: number | null;
  autoriza_negativo: boolean;
  creado_por: string;
  creado_en: string;
  orden_id: string | null;
  operacion: { tipo: string; proveedor: string | null; documento: string | null } | null;
  orden: { numero: number } | null;
};

export async function obtenerVariante(id: string) {
  if (!esUuid(id)) notFound();
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const [variante, movimientos, reservas, miembros] = await Promise.all([
    supabase.from("lunas_existencias").select("*").eq("optica_id", optica.id).eq("id", id).maybeSingle(),
    supabase
      .from("inventario_movimientos")
      .select("id, tipo, cantidad, stock_anterior, stock_resultante, motivo, lote, costo_unitario, autoriza_negativo, creado_por, creado_en, orden_id, operacion:inventario_operaciones(tipo, proveedor, documento), orden:ordenes(numero)")
      .eq("optica_id", optica.id)
      .eq("variante_id", id)
      .order("id", { ascending: false })
      .limit(200),
    supabase
      .from("inventario_reservas")
      .select("id, ojo, cantidad, creado_en, orden:ordenes(id, numero)")
      .eq("optica_id", optica.id)
      .eq("variante_id", id)
      .eq("estado", "activa"),
    supabase.rpc("miembros_optica", { p_optica: optica.id }),
  ]);
  const error = variante.error ?? movimientos.error ?? reservas.error;
  if (error) throw new Error(`No se pudo leer la medida: ${error.message}`);
  if (!variante.data) notFound();
  const correos = new Map(((miembros.data ?? []) as { usuario_id: string; email: string }[]).map((m) => [m.usuario_id, m.email]));
  return {
    variante: existencia(variante.data),
    movimientos: movimientos.data as unknown as Movimiento[],
    reservas: reservas.data as unknown as { id: string; ojo: string; cantidad: number; creado_en: string; orden: { id: string; numero: number } }[],
    usuario: (uid: string) => correos.get(uid) ?? "Usuario desconocido",
  };
}

export async function movimientosRecientes(pagina = 1) {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const porPagina = 50;
  const { data, error, count } = await supabase
    .from("inventario_movimientos")
    .select(
      "id, tipo, cantidad, stock_resultante, motivo, creado_por, creado_en, variante:lunas_variantes(id, esfera, cilindro, adicion, lado, producto:lunas_productos(nombre)), orden:ordenes(id, numero)",
      { count: "exact" },
    )
    .eq("optica_id", optica.id)
    .order("id", { ascending: false })
    .range((pagina - 1) * porPagina, pagina * porPagina - 1);
  if (error?.code === "PGRST103") return { movimientos: [], total: count ?? 0, porPagina };
  if (error) throw new Error(`No se pudieron leer los movimientos: ${error.message}`);
  return {
    movimientos: data as unknown as {
      id: number;
      tipo: TipoMovimiento;
      cantidad: number;
      stock_resultante: number;
      motivo: string | null;
      creado_en: string;
      variante: { id: string; esfera: number; cilindro: number; adicion: number | null; lado: string | null; producto: { nombre: string } };
      orden: { id: string; numero: number } | null;
    }[],
    total: count ?? 0,
    porPagina,
  };
}

// ------------------------------------------------------------------ órdenes

export type OjoOrden = {
  ojo: "OD" | "OI";
  esfera: number | null;
  cilindro: number | null;
  eje: number | null;
  adicion: number | null;
};

/**
 * Busca la medida EXACTA que necesita un ojo dentro de un producto. Nunca elige otra:
 * si no existe o no hay stock, lo informa. La única equivalencia es la transposición
 * a cilindro negativo (la misma luna óptica).
 */
export async function buscarMedidaExacta(productoId: string, ojo: OjoOrden, producto: Producto) {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const m = aCilindroNegativo({ esfera: Number(ojo.esfera ?? 0), cilindro: Number(ojo.cilindro ?? 0), eje: ojo.eje });
  const adicion = producto.vision === "monofocal" ? null : ojo.adicion;

  let q = supabase
    .from("lunas_existencias")
    .select("*")
    .eq("optica_id", optica.id)
    .eq("producto_id", productoId)
    .eq("esfera", m.esfera)
    .eq("cilindro", m.cilindro)
    .eq("activo", true);
  q = adicion == null ? q.is("adicion", null) : q.eq("adicion", adicion);
  q = producto.por_lado ? q.eq("lado", ojo.ojo) : q.is("lado", null);
  const { data, error } = await q;
  if (error) throw new Error(`No se pudo buscar la medida: ${error.message}`);

  // Variantes con eje solo coinciden con el mismo eje; sin eje, sirven para cualquiera.
  const candidatas = data.map(existencia).filter((v) => v.eje == null || v.eje === m.eje);
  return { medida: m, adicion, variante: candidatas.sort((a, b) => b.disponible - a.disponible)[0] ?? null };
}

/** Sugerencias (solo para que el usuario decida): medidas vecinas del mismo producto y la misma medida en otros productos. */
export async function sugerencias(productoId: string, medida: { esfera: number; cilindro: number }, adicion: number | null, ojo: "OD" | "OI") {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const [vecinas, otros] = await Promise.all([
    supabase
      .from("lunas_existencias")
      .select("*")
      .eq("optica_id", optica.id)
      .eq("producto_id", productoId)
      .eq("activo", true)
      .gt("disponible", 0)
      .gte("esfera", medida.esfera - 0.25)
      .lte("esfera", medida.esfera + 0.25)
      .gte("cilindro", medida.cilindro - 0.25)
      .lte("cilindro", Math.min(0, medida.cilindro + 0.25))
      .limit(8),
    supabase
      .from("lunas_existencias")
      .select("*")
      .eq("optica_id", optica.id)
      .neq("producto_id", productoId)
      .eq("activo", true)
      .gt("disponible", 0)
      .eq("esfera", medida.esfera)
      .eq("cilindro", medida.cilindro)
      .limit(8),
  ]);
  const ok = (v: Existencia) => (v.lado == null || v.lado === ojo) && (v.vision === "monofocal" ? true : v.adicion === adicion);
  return {
    vecinas: (vecinas.data ?? []).map(existencia).filter((v) => ok(v) && !(v.esfera === medida.esfera && v.cilindro === medida.cilindro)),
    otrosProductos: (otros.data ?? []).map(existencia).filter(ok),
  };
}

/** Reservas vigentes de una orden (activas o ya descontadas) por ojo. */
export async function reservasDeOrden(ordenId: string) {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("inventario_reservas")
    .select("id, ojo, estado, variante_id, creado_en, cerrada_en")
    .eq("optica_id", optica.id)
    .eq("orden_id", ordenId)
    .neq("estado", "liberada");
  if (error) throw new Error(`No se pudieron leer las reservas: ${error.message}`);
  const ids = data.map((r) => r.variante_id);
  const variantes = ids.length
    ? ((await supabase.from("lunas_existencias").select("*").in("id", ids)).data ?? []).map(existencia)
    : [];
  return data.map((r) => ({ ...r, variante: variantes.find((v) => v.id === r.variante_id)! })) as {
    id: string;
    ojo: "OD" | "OI";
    estado: "activa" | "consumida";
    variante_id: string;
    creado_en: string;
    cerrada_en: string | null;
    variante: Existencia;
  }[];
}
