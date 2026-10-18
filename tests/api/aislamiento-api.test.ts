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
import { pasarAProfesional } from "./plataforma";

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

describe("módulos de órdenes, ventas, avisos y miembros", () => {
  let ordenA: string;
  let c: SupabaseClient; // operador de A
  const correoC = `c-${sufijo}@prueba.test`;

  beforeAll(async () => {
    // Usa metas y avisos automáticos: la plataforma pasa la óptica A al plan Profesional (0012).
    await pasarAProfesional(URL, opticaA);
    const lab = await a.from("laboratorios").insert({ optica_id: opticaA, nombre: "Lab Ficticio A" }).select("id").single();
    const receta = await a
      .from("recetas")
      .insert({ optica_id: opticaA, paciente_id: pacienteA, od_esfera: -1.25 })
      .select("id")
      .single();
    expect(lab.error).toBeNull();
    expect(receta.error).toBeNull();
    const orden = await a.rpc("crear_orden", {
      p_paciente: pacienteA,
      p_receta: receta.data!.id,
      p_laboratorio: lab.data!.id,
      p_precio: 300,
    });
    expect(orden.error).toBeNull();
    ordenA = orden.data as string;
    expect((await a.from("ordenes").update({ estado: "enviada" }).eq("id", ordenA)).error).toBeNull();
    expect((await a.from("ordenes").update({ estado: "recibida_optica" }).eq("id", ordenA)).error).toBeNull();
    const periodo = `${new Date().toISOString().slice(0, 7)}-01`;
    expect((await a.from("metas_ventas").insert({ optica_id: opticaA, periodo, importe_objetivo: 1000 })).error).toBeNull();

    c = nuevoCliente();
    const registro = await c.auth.signUp({ email: correoC, password: `Clave-de-prueba-${sufijo}` });
    expect(registro.error).toBeNull();
    const alta = await a.rpc("agregar_miembro", { p_optica: opticaA, p_email: correoC.toUpperCase(), p_rol: "operador" });
    expect(alta.error).toBeNull();
  });

  describe("óptica B", () => {
    it.each(["ordenes", "laboratorios", "metas_ventas", "notificaciones", "orden_ojos", "orden_historial_estados"])(
      "no ve %s de A",
      async (tabla) => {
        const { data, error } = await b.from(tabla).select("optica_id").eq("optica_id", opticaA);
        expect(error).toBeNull();
        expect(data).toEqual([]);
      },
    );

    it("no ve las ventas de A", async () => {
      const { error } = await b.rpc("ventas_mensuales", { p_optica: opticaA });
      expect(error?.code).toBe("42501");
    });

    it("no ve los miembros de A", async () => {
      const { data } = await b.rpc("miembros_optica", { p_optica: opticaA });
      expect(data).toEqual([]);
    });

    it("no se agrega a la óptica A", async () => {
      const { error } = await b.rpc("agregar_miembro", { p_optica: opticaA, p_email: `b-${sufijo}@prueba.test`, p_rol: "propietario" });
      expect(error?.code).toBe("42501");
    });

    it("no cambia el estado de una orden de A", async () => {
      const { data } = await b.from("ordenes").update({ estado: "entregada" }).eq("id", ordenA).select();
      expect(data).toEqual([]);
    });

    it("no reintenta ni marca avisos de A", async () => {
      const { data: aviso } = await a.from("notificaciones").select("id").eq("orden_id", ordenA).single();
      expect((await b.rpc("reintentar_notificacion", { p_id: aviso!.id })).error).not.toBeNull();
      expect((await b.rpc("registrar_envio", { p_id: aviso!.id, p_ok: true, p_mensaje_id: "x" })).error).not.toBeNull();
    });
  });

  describe("operador de A", () => {
    it("trabaja con las órdenes de su óptica", async () => {
      const { data } = await c.from("ordenes").select("id, precio").eq("id", ordenA);
      expect(data).toHaveLength(1);
    });

    it("no ve metas ni el informe de ventas", async () => {
      expect((await c.from("metas_ventas").select("id")).data).toEqual([]);
      expect((await c.rpc("ventas_mensuales", { p_optica: opticaA })).error?.code).toBe("42501");
    });

    it("no edita los datos de la óptica", async () => {
      const { data } = await c.from("opticas").update({ nombre: "Cambiada" }).eq("id", opticaA).select();
      expect(data).toEqual([]);
    });

    it("no se cambia el rol ni agrega miembros", async () => {
      const { data: sesion } = await c.auth.getUser();
      const { data } = await c.from("miembros").update({ rol: "propietario" }).eq("usuario_id", sesion.user!.id).select();
      expect(data).toEqual([]);
      expect((await c.rpc("agregar_miembro", { p_optica: opticaA, p_email: correoC, p_rol: "propietario" })).error?.code).toBe("42501");
    });
  });
});

describe("inventario de lunas", () => {
  let varianteA: string;

  beforeAll(async () => {
    const producto = await a.from("lunas_productos").insert({ optica_id: opticaA, nombre: `Resina ficticia ${sufijo}` }).select("id").single();
    expect(producto.error).toBeNull();
    const compra = await a.rpc("registrar_compra", {
      p_optica: opticaA,
      p_proveedor: "Proveedor ficticio",
      p_documento: "",
      p_fecha: new Date().toISOString().slice(0, 10),
      p_notas: "",
      p_lineas: [
        { producto_id: producto.data!.id, esfera: -2, cilindro: 0, cantidad: 24 },
        { producto_id: producto.data!.id, esfera: -2.5, cilindro: 0, cantidad: 16 },
      ],
    });
    expect(compra.error).toBeNull();
    const v = await a.from("lunas_existencias").select("id, stock").eq("esfera", -2).eq("producto_id", producto.data!.id).single();
    expect(v.data!.stock).toBe(24);
    varianteA = v.data!.id;
  });

  it("B no ve el inventario de A", async () => {
    for (const tabla of ["lunas_productos", "lunas_variantes", "lunas_existencias", "inventario_movimientos", "inventario_operaciones"]) {
      const { data } = await b.from(tabla).select("optica_id").eq("optica_id", opticaA);
      expect(data, tabla).toEqual([]);
    }
  });

  it("B no mueve el stock de A", async () => {
    const { error } = await b.from("inventario_movimientos").insert({ optica_id: opticaA, variante_id: varianteA, tipo: "venta", cantidad: -1 });
    expect(error).not.toBeNull();
    const { data } = await a.from("lunas_variantes").select("stock").eq("id", varianteA).single();
    expect(data!.stock).toBe(24);
  });

  it("nadie edita el stock directamente por la API", async () => {
    const { error } = await a.from("lunas_variantes").update({ stock: 999 }).eq("id", varianteA);
    expect(error?.code).toBe("42501");
  });
});

describe("límites del plan Básico por la API", () => {
  let duena: SupabaseClient;
  let opticaZ: string;

  beforeAll(async () => {
    duena = await registrarUsuario("z");
    const { data, error } = await duena.rpc("crear_optica", { p_nombre: `Óptica Básica Z ${sufijo}` });
    expect(error).toBeNull();
    opticaZ = data as string;
    // Tres cuentas más que la óptica intentará sumar.
    await Promise.all(["z2", "z3", "z4"].map((n) => registrarUsuario(n)));
  });

  it("una óptica nueva nace en Básico con vencimiento", async () => {
    const { data } = await duena.from("opticas").select("plan, max_usuarios, max_sedes, vence_el").eq("id", opticaZ).single();
    expect(data).toMatchObject({ plan: "basico", max_usuarios: 3, max_sedes: 1 });
    expect(data!.vence_el).not.toBeNull();
  });

  it("no crea una 2.ª sede llamando directo a la API", async () => {
    const { error } = await duena.from("sedes").insert({ optica_id: opticaZ, nombre: "Segunda sede" });
    expect(error?.message).toContain("Tu plan permite 1 sede");
  });

  it("no agrega un 4.º usuario llamando directo a la API", async () => {
    for (const n of ["z2", "z3"]) {
      const { error } = await duena.rpc("agregar_miembro", { p_optica: opticaZ, p_email: `${n}-${sufijo}@prueba.test`, p_rol: "operador" });
      expect(error).toBeNull();
    }
    const { error } = await duena.rpc("agregar_miembro", { p_optica: opticaZ, p_email: `z4-${sufijo}@prueba.test`, p_rol: "operador" });
    expect(error?.message).toContain("Tu plan permite hasta 3 usuarios");
  });

  it("no usa metas ni cambia su propio plan", async () => {
    const periodo = `${new Date().toISOString().slice(0, 7)}-01`;
    const metas = await duena.from("metas_ventas").insert({ optica_id: opticaZ, periodo, importe_objetivo: 1000 });
    expect(metas.error?.message).toContain("Disponible en plan Profesional");
    const plan = await duena.from("opticas").update({ plan: "profesional" }).eq("id", opticaZ);
    expect(plan.error?.code).toBe("42501");
  });
});
