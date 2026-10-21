/**
 * OptiPedidos · Consulta pública del estado del pedido a través de la API REST real de Supabase.
 *
 * Simula al cliente final (o a cualquiera con la clave pública): sin sesión solo puede ejecutar
 * consulta_estado_publico(); las tablas siguen cerradas.
 *
 * Requiere Supabase local en marcha (npx supabase start) y .env.local configurado.
 * Crea usuarios y datos ficticios con correos @prueba.test; se limpian con `npx supabase db reset`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { CAMPOS_CONSULTA, codigoLegible, leerConsulta } from "@/lib/ordenes/consulta-publica";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL) || !KEY) {
  throw new Error(`Las pruebas de API solo se ejecutan contra Supabase local. URL actual: "${URL}". Revisa .env.local.`);
}

const nuevoCliente = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
// IP propia de esta ejecución (documentación, RFC 5737) para no chocar con el límite de otras corridas.
const ip = `192.0.2.${Math.floor(Math.random() * 250) + 1}-${sufijo}`;

let duena: SupabaseClient;
let anon: SupabaseClient;
let orden: string;
let codigo: string;

const consultar = (c: string | null) => anon.rpc("consulta_estado_publico", { p_codigo: c, p_ip: ip });

beforeAll(async () => {
  duena = nuevoCliente();
  const registro = await duena.auth.signUp({ email: `consulta-${sufijo}@prueba.test`, password: `Clave-de-prueba-${sufijo}` });
  if (registro.error || !registro.data.session) throw new Error(`No se pudo registrar: ${registro.error?.message ?? "sin sesión"}`);
  anon = nuevoCliente();

  const optica = (await duena.rpc("crear_optica", { p_nombre: `Óptica Consulta ${sufijo}` })).data as string;
  const lab = await duena.from("laboratorios").insert({ optica_id: optica, nombre: "Lab Consulta" }).select("id").single();
  const paciente = await duena
    .from("pacientes")
    .insert({ optica_id: optica, nombres: "Lucía Fernanda", apellidos: "Quispe Mamani", tipo_documento: "DNI", numero_documento: "70707070", telefono: "955 444 333" })
    .select("id")
    .single();
  expect(lab.error).toBeNull();
  expect(paciente.error).toBeNull();
  const receta = await duena
    .from("recetas")
    .insert({ optica_id: optica, paciente_id: paciente.data!.id, od_esfera: -4.25, od_cilindro: -0.75, od_eje: 180 })
    .select("id")
    .single();
  expect(receta.error).toBeNull();
  const r = await duena.rpc("crear_orden", { p_paciente: paciente.data!.id, p_receta: receta.data!.id, p_laboratorio: lab.data!.id, p_precio: 250 });
  expect(r.error).toBeNull();
  orden = r.data as string;
  const leida = await duena.from("ordenes").select("codigo_consulta").eq("id", orden).single();
  expect(leida.error).toBeNull();
  codigo = leida.data!.codigo_consulta as string;
});

describe("consulta pública sin sesión", () => {
  it("la orden nueva tiene un código de 12 caracteres sin caracteres confusos", () => {
    expect(codigo).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{12}$/);
  });

  it("un código válido devuelve el estado y solo los campos permitidos", async () => {
    const { data, error } = await consultar(codigo);
    expect(error).toBeNull();
    expect(Object.keys(data).sort()).toEqual([...CAMPOS_CONSULTA].sort());
    expect(data).toMatchObject({ paciente: "Lucía", estado: "borrador", saldo: 250 });
    expect(leerConsulta(data).tipo).toBe("encontrada");
  });

  it("acepta el código tal como se imprime (con guiones)", async () => {
    const { data } = await consultar(codigoLegible(codigo).toLowerCase());
    expect(data?.estado).toBe("borrador");
  });

  it("la respuesta nunca contiene receta, documento, teléfono ni apellidos", async () => {
    const texto = JSON.stringify((await consultar(codigo)).data);
    for (const prohibido of ["Quispe", "Mamani", "70707070", "955 444 333", "955444333","-4.25", "-0.75", "esfera", "receta", orden]) {
      expect(texto).not.toContain(prohibido);
    }
  });

  it("un código inválido no devuelve nada", async () => {
    for (const c of ["ZZZZZZZZZZZZ", "", null, "*", `${codigo.slice(0, 11)}`, `${codigo}' or '1'='1`]) {
      const { data, error } = await consultar(c);
      expect(error).toBeNull();
      expect(data).toBeNull();
    }
  });

  it("no puede leer órdenes, pacientes ni recetas directamente", async () => {
    for (const tabla of ["ordenes", "pacientes", "recetas", "orden_ojos", "sedes", "opticas", "consultas_publicas_intentos"]) {
      const { data, error } = await anon.from(tabla).select("*").limit(1);
      expect(error?.code, tabla).toBe("42501");
      expect(data).toBeNull();
    }
    const filtro = await anon.from("ordenes").select("id").eq("codigo_consulta", codigo);
    expect(filtro.error?.code).toBe("42501");
  });

  it("no puede regenerar códigos", async () => {
    const { error } = await anon.rpc("regenerar_codigo_consulta", { p_orden: orden });
    expect(error?.code).toBe("42501");
  });

  it("si la orden se anula el enlace deja de funcionar, con la misma respuesta que un código inexistente", async () => {
    const anulada = await duena.from("ordenes").update({ estado: "anulada", motivo_anulacion: "Prueba de consulta" }).eq("id", orden);
    expect(anulada.error).toBeNull();
    const { data, error } = await consultar(codigo);
    expect(error).toBeNull();
    expect(data).toEqual((await consultar("ZZZZZZZZZZZZ")).data);
    expect(data).toBeNull();
  });
});
