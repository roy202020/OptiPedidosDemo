import type { CategoriaEgreso, MedioEgreso } from "@/lib/egresos";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export type Egreso = {
  id: string;
  sede_id: string;
  fecha: string;
  monto: number;
  categoria: CategoriaEgreso;
  concepto: string;
  medio: MedioEgreso;
  numero_comprobante: string | null;
  foto_path: string | null;
  registrado_por: string | null;
  creado_en: string;
  anulado_en: string | null;
  motivo_anulacion: string | null;
};

/** Egresos (vigentes y anulados) del periodo. RLS: solo propietario y administrador, en sus sedes. */
export async function listarEgresos(f: { sede: string | null; desde: string; hasta: string; categoria?: CategoriaEgreso }): Promise<Egreso[]> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  let c = supabase.from("egresos").select("*").eq("optica_id", optica.id).gte("fecha", f.desde).lte("fecha", f.hasta);
  if (f.sede) c = c.eq("sede_id", f.sede);
  if (f.categoria) c = c.eq("categoria", f.categoria);
  const { data, error } = await c.order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(500);
  if (error) throw new Error(`No se pudieron leer los egresos: ${error.message}`);
  return (data as Egreso[]).map((e) => ({ ...e, monto: Number(e.monto) }));
}
