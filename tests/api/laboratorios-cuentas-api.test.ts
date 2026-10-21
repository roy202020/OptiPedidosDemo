/**
 * OptiPedidos · Tickets y pagos a laboratorios por la API real (PostgREST + Storage) de Supabase LOCAL.
 * Un vendedor de otra sede u otra óptica no ve tickets, pagos ni fotos, ni consultando directo.
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
const correo = (nombre: string) => `lab-${nombre}-${sufijo}@prueba.test`;

async function registrarUsuario(nombre: string): Promise<SupabaseClient> {
  const cliente = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await cliente.auth.signUp({ email: correo(nombre), password: `Clave-de-prueba-${sufijo}` });
  if (error || !data.session) throw new Error(`No se pudo registrar ${nombre}: ${error?.message ?? "sin sesión"}`);
  return cliente;
}

// Una imagen JPEG mínima (1×1) para las fotos.
const JPEG = Uint8Array.from(
  atob(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  ),
  (c) => c.charCodeAt(0),
);

let duena: SupabaseClient; // propietaria de la óptica
let vendedoraNorte: SupabaseClient; // vendedora asignada solo a la Sede Norte
let otraOptica: SupabaseClient; // propietaria de otra óptica
let optica: string;
let sedePrincipal: string;
let ticket: string;
let fotoTicket: string;
let fotoPago: string;

beforeAll(async () => {
  [duena, vendedoraNorte, otraOptica] = await Promise.all([registrarUsuario("duena"), registrarUsuario("norte"), registrarUsuario("otra")]);
  const ro = await duena.rpc("crear_optica", { p_nombre: `Óptica Cuentas ${sufijo}` });
  expect(ro.error).toBeNull();
  optica = ro.data as string;
  expect((await otraOptica.rpc("crear_optica", { p_nombre: `Óptica Ajena ${sufijo}` })).error).toBeNull();
  await pasarAProfesional(URL, optica); // dos sedes

  const principal = await duena.from("sedes").select("id").eq("optica_id", optica).eq("nombre", "Sede principal").single();
  sedePrincipal = principal.data!.id;
  // Sin RETURNING: la sede recién creada aún no es visible para la política de lectura (igual que en la app).
  expect((await duena.from("sedes").insert({ optica_id: optica, nombre: "Sede Norte" })).error).toBeNull();
  const norte = await duena.from("sedes").select("id").eq("optica_id", optica).eq("nombre", "Sede Norte").single();
  expect((await duena.rpc("agregar_miembro", { p_optica: optica, p_email: correo("norte"), p_rol: "operador" })).error).toBeNull();
  expect(
    (await duena.from("miembro_sedes").insert({ optica_id: optica, usuario_id: (await vendedoraNorte.auth.getUser()).data.user!.id, sede_id: norte.data!.id }))
      .error,
  ).toBeNull();

  const lab = await duena.from("laboratorios").insert({ optica_id: optica, nombre: "Lab Visión", dias_credito: 7 }).select("id").single();
  const paciente = await duena.from("pacientes").insert({ optica_id: optica, nombres: "Ana", apellidos: "Ficticia" }).select("id").single();
  expect(lab.error).toBeNull();
  expect(paciente.error).toBeNull();
  const receta = await duena.from("recetas").insert({ optica_id: optica, paciente_id: paciente.data!.id, od_esfera: -1 }).select("id").single();
  expect(receta.error).toBeNull();
  const orden = await duena.rpc("crear_orden", {
    p_paciente: paciente.data!.id,
    p_receta: receta.data!.id,
    p_laboratorio: lab.data!.id,
    p_precio: 300,
    p_sede: sedePrincipal,
  });
  expect(orden.error).toBeNull();

  fotoTicket = `${optica}/${sedePrincipal}/tickets/${crypto.randomUUID()}.jpg`;
  fotoPago = `${optica}/${sedePrincipal}/pagos/${crypto.randomUUID()}.jpg`;
  for (const ruta of [fotoTicket, fotoPago]) {
    const { error } = await duena.storage.from("laboratorios").upload(ruta, JPEG, { contentType: "image/jpeg" });
    expect(error).toBeNull();
  }

  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const t = await duena.rpc("registrar_lab_ticket", {
    p_sede: sedePrincipal,
    p_laboratorio: lab.data!.id,
    p_numero: "A-100",
    p_fecha: hoy,
    p_monto_total: 120,
    p_ordenes: [{ orden_id: orden.data, monto: 120 }],
    p_foto: fotoTicket,
  });
  expect(t.error).toBeNull();
  ticket = t.data as string;
  const p = await duena.rpc("registrar_lab_pago", {
    p_sede: sedePrincipal,
    p_laboratorio: lab.data!.id,
    p_fecha: hoy,
    p_medio: "yape",
    p_aplicaciones: [{ ticket_id: ticket, monto: 50 }],
    p_foto: fotoPago,
  });
  expect(p.error).toBeNull();
});

describe("cuentas con laboratorios por la API", () => {
  it("la propietaria ve su ticket, su pago y sus fotos", async () => {
    expect((await duena.from("lab_tickets").select("id")).data).toHaveLength(1);
    expect((await duena.from("lab_pagos").select("id")).data).toHaveLength(1);
    expect((await duena.storage.from("laboratorios").download(fotoTicket)).error).toBeNull();
    expect((await duena.storage.from("laboratorios").createSignedUrl(fotoPago, 60)).error).toBeNull();
  });

  it("el bucket es privado: sin firma no hay URL pública", async () => {
    const publica = duena.storage.from("laboratorios").getPublicUrl(fotoTicket).data.publicUrl;
    expect((await fetch(publica)).ok).toBe(false);
  });

  for (const [quien, cliente] of [
    ["un vendedor de otra sede", () => vendedoraNorte],
    ["otra óptica", () => otraOptica],
  ] as const) {
    describe(quien, () => {
      it("no ve tickets, líneas, pagos ni caja consultando directo", async () => {
        for (const tabla of ["lab_tickets", "lab_ticket_ordenes", "lab_pagos", "lab_pago_aplicaciones", "lab_tickets_estado", "cajas", "caja_movimientos"]) {
          const { data, error } = await cliente().from(tabla).select("*").eq("optica_id", optica);
          expect(error, tabla).toBeNull();
          expect(data, tabla).toEqual([]);
        }
      });

      it("no descarga ni firma las fotos", async () => {
        for (const ruta of [fotoTicket, fotoPago]) {
          expect((await cliente().storage.from("laboratorios").download(ruta)).error).not.toBeNull();
          expect((await cliente().storage.from("laboratorios").createSignedUrl(ruta, 60)).error).not.toBeNull();
        }
      });

      it("no sube fotos a esa carpeta ni registra en esa sede", async () => {
        const subida = await cliente().storage.from("laboratorios").upload(`${optica}/${sedePrincipal}/tickets/${crypto.randomUUID()}.jpg`, JPEG, { contentType: "image/jpeg" });
        expect(subida.error).not.toBeNull();
        const pago = await cliente().rpc("registrar_lab_pago", {
          p_sede: sedePrincipal,
          p_laboratorio: crypto.randomUUID(),
          p_fecha: "2026-01-01",
          p_medio: "yape",
          p_aplicaciones: [{ ticket_id: ticket, monto: 1 }],
        });
        expect(pago.error?.code).toBe("42501");
      });
    });
  }

  it("nadie inserta tickets ni pagos directo en las tablas", async () => {
    const r = await duena.from("lab_pagos").insert({ optica_id: optica, sede_id: sedePrincipal, monto: 1 });
    expect(r.error?.code).toBe("42501");
  });
});
