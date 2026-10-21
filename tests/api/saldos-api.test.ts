/**
 * OptiPedidos · Saldos de clientes y cobros por la API real (PostgREST) de Supabase LOCAL.
 * Un usuario de otra sede u otra óptica no ve saldos ni cobros, ni consultando directo.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { pasarAProfesional } from "./plataforma";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL) || !KEY) {
  throw new Error(`Las pruebas de API solo se ejecutan contra Supabase local. URL actual: "${URL}". Revisa .env.local.`);
}

const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const correo = (nombre: string) => `saldo-${nombre}-${sufijo}@prueba.test`;

async function registrarUsuario(nombre: string): Promise<SupabaseClient> {
  const cliente = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await cliente.auth.signUp({ email: correo(nombre), password: `Clave-de-prueba-${sufijo}` });
  if (error || !data.session) throw new Error(`No se pudo registrar ${nombre}: ${error?.message ?? "sin sesión"}`);
  return cliente;
}

let duena: SupabaseClient; // propietaria
let vendedor: SupabaseClient; // vendedor de la sede principal
let vendedorNorte: SupabaseClient; // vendedor solo de la Sede Norte
let otraOptica: SupabaseClient;
let optica: string;
let sedePrincipal: string;
let orden: string;

beforeAll(async () => {
  [duena, vendedor, vendedorNorte, otraOptica] = await Promise.all(["duena", "vendedor", "norte", "otra"].map(registrarUsuario));
  const ro = await duena.rpc("crear_optica", { p_nombre: `Óptica Saldos ${sufijo}` });
  expect(ro.error).toBeNull();
  optica = ro.data as string;
  expect((await otraOptica.rpc("crear_optica", { p_nombre: `Óptica Ajena ${sufijo}` })).error).toBeNull();
  await pasarAProfesional(URL, optica); // dos sedes

  sedePrincipal = (await duena.from("sedes").select("id").eq("optica_id", optica).eq("nombre", "Sede principal").single()).data!.id;
  // El vendedor de la principal entra con una sola sede (asignación automática).
  expect((await duena.rpc("agregar_miembro", { p_optica: optica, p_email: correo("vendedor"), p_rol: "operador" })).error).toBeNull();
  expect((await duena.from("sedes").insert({ optica_id: optica, nombre: "Sede Norte" })).error).toBeNull();
  const norte = (await duena.from("sedes").select("id").eq("optica_id", optica).eq("nombre", "Sede Norte").single()).data!.id;
  expect((await duena.rpc("agregar_miembro", { p_optica: optica, p_email: correo("norte"), p_rol: "operador" })).error).toBeNull();
  const idNorte = (await vendedorNorte.auth.getUser()).data.user!.id;
  expect((await duena.from("miembro_sedes").insert({ optica_id: optica, usuario_id: idNorte, sede_id: norte })).error).toBeNull();

  const lab = await duena.from("laboratorios").insert({ optica_id: optica, nombre: "Lab" }).select("id").single();
  const paciente = await duena.from("pacientes").insert({ optica_id: optica, nombres: "Ana", apellidos: "Deudora" }).select("id").single();
  const receta = await duena.from("recetas").insert({ optica_id: optica, paciente_id: paciente.data!.id, od_esfera: -1 }).select("id").single();
  const r = await duena.rpc("crear_orden", {
    p_paciente: paciente.data!.id,
    p_receta: receta.data!.id,
    p_laboratorio: lab.data!.id,
    p_precio: 300,
    p_sede: sedePrincipal,
  });
  expect(r.error).toBeNull();
  orden = r.data as string;
  expect((await duena.from("ordenes").update({ estado: "enviada" }).eq("id", orden)).error).toBeNull();
});

const cobrar = (c: SupabaseClient, importe: number, medio = "yape") =>
  c.from("orden_pagos").insert({ optica_id: optica, orden_id: orden, importe, medio, numero_operacion: "OP-1" });

describe("saldos por la API", () => {
  it("el vendedor cobra en partes y el saldo se calcula solo", async () => {
    expect((await cobrar(vendedor, 100)).error).toBeNull();
    expect((await cobrar(vendedor, 50, "plin")).error).toBeNull();
    const { data } = await vendedor.from("ordenes").select("saldo").eq("id", orden).single();
    expect(Number(data!.saldo)).toBe(150);
  });

  it("no se cobra más que el saldo ni en efectivo sin caja abierta", async () => {
    expect((await cobrar(vendedor, 150.01)).error?.message).toContain("supera el saldo pendiente");
    expect((await cobrar(vendedor, 10, "efectivo")).error?.message).toContain("No hay una caja abierta");
  });

  it("el saldo no se escribe a mano", async () => {
    const { error } = await duena.from("ordenes").update({ saldo: 0 } as never).eq("id", orden);
    expect(error).not.toBeNull();
  });

  it("el vendedor no anula cobros", async () => {
    const { data: pagos } = await vendedor.from("orden_pagos").select("id").eq("orden_id", orden).limit(1);
    const { error } = await vendedor.from("orden_pagos").update({ motivo_anulacion: "Error" }).eq("id", pagos![0].id);
    expect(error?.code).toBe("42501");
  });

  it("la propietaria y el vendedor de la sede ven el saldo", async () => {
    for (const c of [duena, vendedor]) {
      const { data, error } = await c.rpc("saldos_pendientes", { p_optica: optica });
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(Number(data[0].saldo)).toBe(150);
    }
  });

  it("un vendedor de otra sede no ve el saldo ni los cobros", async () => {
    expect((await vendedorNorte.rpc("saldos_pendientes", { p_optica: optica })).data).toEqual([]);
    expect((await vendedorNorte.rpc("saldos_pendientes", { p_optica: optica, p_sede: sedePrincipal })).error?.code).toBe("42501");
    expect((await vendedorNorte.from("orden_pagos").select("id").eq("optica_id", optica)).data).toEqual([]);
    expect((await vendedorNorte.from("ordenes").select("id").eq("optica_id", optica)).data).toEqual([]);
  });

  it("otra óptica no ve el saldo ni los cobros", async () => {
    expect((await otraOptica.rpc("saldos_pendientes", { p_optica: optica })).error?.code).toBe("42501");
    expect((await otraOptica.rpc("resumen_por_cobrar", { p_optica: optica })).error?.code).toBe("42501");
    expect((await otraOptica.from("orden_pagos").select("id").eq("optica_id", optica)).data).toEqual([]);
  });
});
