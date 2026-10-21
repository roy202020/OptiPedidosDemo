/**
 * OptiPedidos · Egresos por la API real (PostgREST + Storage) de Supabase LOCAL.
 * Solo propietario y administrador registran y ven egresos y sus recibos.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL) || !KEY) {
  throw new Error(`Las pruebas de API solo se ejecutan contra Supabase local. URL actual: "${URL}". Revisa .env.local.`);
}

const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const correo = (nombre: string) => `egreso-${nombre}-${sufijo}@prueba.test`;

async function registrarUsuario(nombre: string): Promise<SupabaseClient> {
  const cliente = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await cliente.auth.signUp({ email: correo(nombre), password: `Clave-de-prueba-${sufijo}` });
  if (error || !data.session) throw new Error(`No se pudo registrar ${nombre}: ${error?.message ?? "sin sesión"}`);
  return cliente;
}

const JPEG = Uint8Array.from(atob("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="), (c) =>
  c.charCodeAt(0),
);

let duena: SupabaseClient;
let vendedor: SupabaseClient;
let otraOptica: SupabaseClient;
let optica: string;
let sede: string;
let foto: string;
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

beforeAll(async () => {
  [duena, vendedor, otraOptica] = await Promise.all(["duena", "vendedor", "otra"].map(registrarUsuario));
  const ro = await duena.rpc("crear_optica", { p_nombre: `Óptica Egresos ${sufijo}` });
  expect(ro.error).toBeNull();
  optica = ro.data as string;
  expect((await otraOptica.rpc("crear_optica", { p_nombre: `Óptica Ajena ${sufijo}` })).error).toBeNull();
  sede = (await duena.from("sedes").select("id").eq("optica_id", optica).single()).data!.id;
  expect((await duena.rpc("agregar_miembro", { p_optica: optica, p_email: correo("vendedor"), p_rol: "operador" })).error).toBeNull();

  foto = `${optica}/${sede}/egresos/${crypto.randomUUID()}.jpg`;
  expect((await duena.storage.from("laboratorios").upload(foto, JPEG, { contentType: "image/jpeg" })).error).toBeNull();
  const r = await duena.rpc("registrar_egreso", {
    p_sede: sede,
    p_fecha: hoy,
    p_monto: 85.5,
    p_categoria: "servicios",
    p_concepto: "Agua",
    p_medio: "yape",
    p_foto: foto,
  });
  expect(r.error).toBeNull();
});

describe("egresos por la API", () => {
  it("la propietaria ve su egreso y el recibo", async () => {
    const { data } = await duena.from("egresos").select("monto, foto_path").eq("optica_id", optica);
    expect(data).toEqual([{ monto: 85.5, foto_path: foto }]);
    expect((await duena.storage.from("laboratorios").download(foto)).error).toBeNull();
  });

  it("el vendedor no registra, no ve egresos ni sus recibos", async () => {
    const r = await vendedor.rpc("registrar_egreso", { p_sede: sede, p_fecha: hoy, p_monto: 5, p_categoria: "movilidad", p_concepto: "Taxi", p_medio: "yape" });
    expect(r.error?.code).toBe("42501");
    expect((await vendedor.from("egresos").select("id").eq("optica_id", optica)).data).toEqual([]);
    expect((await vendedor.storage.from("laboratorios").download(foto)).error).not.toBeNull();
    const subida = await vendedor.storage.from("laboratorios").upload(`${optica}/${sede}/egresos/${crypto.randomUUID()}.jpg`, JPEG, { contentType: "image/jpeg" });
    expect(subida.error).not.toBeNull();
  });

  it("otra óptica no ve los egresos ni sus recibos", async () => {
    expect((await otraOptica.from("egresos").select("id").eq("optica_id", optica)).data).toEqual([]);
    expect((await otraOptica.storage.from("laboratorios").createSignedUrl(foto, 60)).error).not.toBeNull();
  });

  it("nadie inserta egresos directo en la tabla", async () => {
    const { error } = await duena.from("egresos").insert({ optica_id: optica, sede_id: sede, fecha: hoy, monto: 1, categoria: "otros", concepto: "x", medio: "yape" });
    expect(error?.code).toBe("42501");
  });
});
