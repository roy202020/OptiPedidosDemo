/**
 * OptiPedidos · Prueba de aislamiento a través de la API REST real de Supabase.
 *
 * Simula lo que podría hacer cualquier persona con la clave pública (publishable)
 * que viaja en el navegador: consultar, filtrar, modificar o borrar directamente
 * contra la API, sin pasar por la interfaz de la app.
 *
 * Requiere Supabase local en marcha (npx supabase start) y .env.local configurado.
 * Crea usuarios y datos ficticios con correos @prueba.test; se limpian con
 * `npx supabase db reset`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Protección: estas pruebas crean usuarios, así que solo corren contra Supabase local.
const esLocal = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL);
if (!esLocal || !KEY) {
  throw new Error(
    `Las pruebas de API solo se ejecutan contra Supabase local. URL actual: "${URL}". Revisa .env.local.`,
  );
}

const nuevoCliente = () =>
  createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function registrarUsuario(nombre: string): Promise<SupabaseClient> {
  const cliente = nuevoCliente();
  const { data, error } = await cliente.auth.signUp({
    email: `${nombre}-${sufijo}@prueba.test`,
    password: `Clave-de-prueba-${sufijo}`,
  });
  if (error) throw new Error(`No se pudo registrar ${nombre}: ${error.message}`);
  if (!data.session) {
    throw new Error("El registro no devolvió sesión: desactiva la confirmación de email en supabase/config.toml");
  }
  return cliente;
}

let a: SupabaseClient; // propietario de la óptica A
let b: SupabaseClient; // propietario de la óptica B
let anon: SupabaseClient; // visitante sin sesión
let opticaA: string;
let opticaB: string;
let pacienteA: string;

beforeAll(async () => {
  [a, b] = await Promise.all([registrarUsuario("a"), registrarUsuario("b")]);
  anon = nuevoCliente();

  const ra = await a.rpc("crear_optica", { p_nombre: `Óptica Ficticia A ${sufijo}` });
  const rb = await b.rpc("crear_optica", { p_nombre: `Óptica Ficticia B ${sufijo}` });
  expect(ra.error).toBeNull();
  expect(rb.error).toBeNull();
  opticaA = ra.data as string;
  opticaB = rb.data as string;

  const pa = await a
    .from("pacientes")
    .insert({ optica_id: opticaA, nombres: "Paciente", apellidos: "Ficticio A" })
    .select("id")
    .single();
  expect(pa.error).toBeNull();
  pacienteA = pa.data!.id;

  const pb = await b
    .from("pacientes")
    .insert({ optica_id: opticaB, nombres: "Paciente", apellidos: "Ficticio B" });
  expect(pb.error).toBeNull();
});

describe("visitante sin sesión", () => {
  it("no puede leer pacientes", async () => {
    const { data, error } = await anon.from("pacientes").select("*");
    expect(error?.code).toBe("42501");
    expect(data).toBeNull();
  });

  it("no puede crear ópticas", async () => {
    const { error } = await anon.rpc("crear_optica", { p_nombre: "Intrusa" });
    expect(error).not.toBeNull();
  });
});

describe("usuario de la óptica B intentando acceder a la óptica A", () => {
  it("solo ve sus propios pacientes", async () => {
    const { data, error } = await b.from("pacientes").select("id, optica_id");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((p) => p.optica_id === opticaB)).toBe(true);
  });

  it("no obtiene nada al pedir un paciente de A por su id", async () => {
    const { data } = await b.from("pacientes").select("*").eq("id", pacienteA);
    expect(data).toEqual([]);
  });

  it("no obtiene nada filtrando explícitamente por la óptica A", async () => {
    const { data } = await b.from("pacientes").select("*").or(`optica_id.eq.${opticaA},id.eq.${pacienteA}`);
    expect(data).toEqual([]);
  });

  it("no ve la óptica A", async () => {
    const { data } = await b.from("opticas").select("id");
    expect(data!.map((o) => o.id)).toEqual([opticaB]);
  });

  it("no puede modificar un paciente de A", async () => {
    const { data } = await b.from("pacientes").update({ notas: "alterado" }).eq("id", pacienteA).select();
    expect(data).toEqual([]);
    const { data: original } = await a.from("pacientes").select("notas").eq("id", pacienteA).single();
    expect(original!.notas).toBeNull();
  });

  it("no puede crear pacientes en A", async () => {
    const { error } = await b
      .from("pacientes")
      .insert({ optica_id: opticaA, nombres: "Intruso", apellidos: "B" });
    expect(error?.code).toBe("42501");
  });

  it("no puede borrar pacientes ni órdenes", async () => {
    const p = await b.from("pacientes").delete().eq("id", pacienteA);
    const o = await b.from("ordenes").delete().eq("optica_id", opticaA);
    expect(p.error?.code).toBe("42501");
    expect(o.error?.code).toBe("42501");
  });

  it("no puede unirse a la óptica A", async () => {
    const { data: sesion } = await b.auth.getUser();
    const { error } = await b
      .from("miembros")
      .insert({ optica_id: opticaA, usuario_id: sesion.user!.id, rol: "propietario" });
    expect(error?.code).toBe("42501");
  });

  it("no puede invocar funciones internas", async () => {
    const { error } = await b.rpc("siguiente_numero_orden", { p_optica: opticaA });
    expect(error).not.toBeNull();
  });

  it("no ve la auditoría de A", async () => {
    const { data, error } = await b.from("auditoria").select("optica_id");
    expect(error).toBeNull();
    expect(data!.every((r) => r.optica_id === opticaB)).toBe(true);
  });
});
