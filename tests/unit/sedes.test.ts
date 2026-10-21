/**
 * OptiPedidos · Varias sedes por óptica en la aplicación (sin base de datos).
 * La separación real la hace la base con RLS (supabase/tests/database/10_sedes.test.sql);
 * aquí se prueban las reglas de la interfaz: sede elegida, sede de registro, permisos y totales.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { totalConsolidado } from "@/lib/datos/ventas";
import { NOMBRE_ROL, tienePermiso } from "@/lib/permisos";
import { resolverSede, sedeDeRegistro, TODAS_LAS_SEDES } from "@/lib/sedes";
import { esquemaAsignacion, esquemaSede } from "@/lib/validacion/administracion";

const centro = { id: "c", nombre: "Centro", activa: true };
const norte = { id: "n", nombre: "Norte", activa: true };
const sur = { id: "s", nombre: "Sur", activa: false };

describe("resolverSede (selector)", () => {
  it("usa la sede de la cookie si el usuario la puede ver", () => {
    expect(resolverSede([centro, norte], "n")).toBe(norte);
  });

  it("ignora una cookie con una sede ajena y usa la primera activa", () => {
    expect(resolverSede([sur, centro, norte], "otra-sede")).toBe(centro);
  });

  it("'todas' solo vale con más de una sede", () => {
    expect(resolverSede([centro, norte], TODAS_LAS_SEDES)).toBeNull();
    expect(resolverSede([centro], TODAS_LAS_SEDES)).toBe(centro);
  });

  it("sin cookie elige la primera activa; sin sedes, ninguna", () => {
    expect(resolverSede([centro, norte], undefined)).toBe(centro);
    expect(resolverSede([], undefined)).toBeNull();
  });
});

describe("sedeDeRegistro (dónde se crea un pedido, compra o meta)", () => {
  it("registra en la sede elegida", () => {
    expect(sedeDeRegistro([centro, norte], norte).sede).toBe(norte);
  });

  it("con 'todas' pide elegir una sede, salvo que solo haya una activa", () => {
    expect(sedeDeRegistro([centro, norte], null).error).toMatch(/Elige una sede/);
    expect(sedeDeRegistro([centro, sur], null).sede).toBe(centro);
  });

  it("no registra en una sede desactivada", () => {
    expect(sedeDeRegistro([centro, sur], sur).error).toMatch(/desactivada/);
  });

  it("sin sedes asignadas lo explica", () => {
    expect(sedeDeRegistro([], null).error).toMatch(/No tienes sedes asignadas/);
  });
});

describe("permisos multisede", () => {
  it("solo el propietario gestiona sedes y ve el consolidado", () => {
    for (const p of ["gestionarSedes", "verConsolidado"] as const) {
      expect(tienePermiso("propietario", p)).toBe(true);
      expect(tienePermiso("administrador", p)).toBe(false);
      expect(tienePermiso("operador", p)).toBe(false);
    }
  });

  it("el administrador sigue viendo ventas y metas (de sus sedes)", () => {
    expect(tienePermiso("administrador", "verVentas")).toBe(true);
    expect(tienePermiso("administrador", "configurarMetas")).toBe(true);
  });

  it("el operador se muestra como Vendedor", () => {
    expect(NOMBRE_ROL.operador).toBe("Vendedor");
  });
});

describe("esquemaSede", () => {
  it("acepta una sede con id de WhatsApp de Meta", () => {
    expect(esquemaSede.safeParse({ nombre: " Norte ", direccion: "", telefono: "", whatsapp_phone_number_id: "1234 5678 90" }).data).toEqual({
      nombre: "Norte",
      direccion: null,
      telefono: null,
      horario: null,
      whatsapp_phone_number_id: "1234567890",
    });
  });

  it("rechaza nombre vacío y un id de WhatsApp con letras (igual que el CHECK de la base)", () => {
    const r = esquemaSede.safeParse({ nombre: "  ", whatsapp_phone_number_id: "+51 987" });
    expect(r.success).toBe(false);
    const campos = z.flattenError(r.error!).fieldErrors;
    expect(campos.nombre).toBeDefined();
    expect(campos.whatsapp_phone_number_id).toBeDefined();
  });

  it("las asignaciones son ids de sede", () => {
    expect(esquemaAsignacion.safeParse(["0704ad05-82b9-47b2-b246-e8b1bc46c581"]).success).toBe(true);
    expect(esquemaAsignacion.safeParse(["Centro"]).success).toBe(false);
  });
});

describe("totalConsolidado", () => {
  const fila = (ventas: number, meta: number | null) => ({ ventas, ordenes: 1, meta, pedidosEnCurso: 2, saldoPendiente: 0.1, cobrado: 0.2 });

  it("suma las sedes sin errores de coma flotante", () => {
    expect(totalConsolidado([fila(0.1, 100), fila(0.2, 50), fila(0, null)])).toEqual({
      ventas: 0.3,
      ordenes: 3,
      meta: 150,
      pedidosEnCurso: 6,
      saldoPendiente: 0.3,
      cobrado: 0.6,
    });
  });

  it("sin metas en ninguna sede, la meta total es null", () => {
    expect(totalConsolidado([fila(10, null)]).meta).toBeNull();
  });
});
