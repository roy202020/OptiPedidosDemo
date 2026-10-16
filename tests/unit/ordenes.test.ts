/**
 * OptiPedidos · Reglas de órdenes, importes y metas en la aplicación (sin base de datos).
 */
import { describe, expect, it } from "vitest";
import { cumplimiento, variacion } from "@/lib/datos/ventas";
import { mes, soles } from "@/lib/formato";
import { ACTIVOS, COMERCIAL_DE, ESTADOS_INTERNOS, INTERNOS_DE, estaAtrasada, numeroOrden } from "@/lib/ordenes/estados";
import { erroresOrden, esquemaMeta, esquemaOrden, leerFormularioOrden, leerImporte, valoresOrden } from "@/lib/validacion/orden";

const UUID = "0704ad05-82b9-47b2-b246-e8b1bc46c581";

function formulario(campos: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
}

const base = {
  receta_id: UUID,
  laboratorio_id: UUID,
  tipo_trabajo: "lentes_completos",
  prioridad: "normal",
  fecha_entrega_prometida: "2999-01-01",
  precio: "350",
};

describe("estados", () => {
  it("cada estado interno tiene un estado comercial (igual que estado_comercial() en la base)", () => {
    expect(ESTADOS_INTERNOS.map((e) => COMERCIAL_DE[e])).toEqual([
      "venta_iniciada",
      "en_laboratorio",
      "en_laboratorio",
      "en_laboratorio",
      "en_laboratorio",
      "listo_entrega",
      "entregado",
      "anulado",
    ]);
    expect(INTERNOS_DE.en_laboratorio).toEqual(["enviada", "recibida_lab", "en_proceso", "lista"]);
  });

  it("las órdenes activas excluyen entregadas y anuladas", () => {
    expect(ACTIVOS).not.toContain("entregada");
    expect(ACTIVOS).not.toContain("anulada");
  });

  it.each([
    ["en_proceso", "2026-10-10", true],
    ["en_proceso", "2026-10-15", false],
    ["en_proceso", null, false],
    ["recibida_optica", "2026-10-01", false],
    ["entregada", "2026-10-01", false],
    ["borrador", "2026-10-01", true],
  ] as const)("%s con fecha %s está atrasada: %s", (estado, fechaPrometida, esperado) => {
    expect(estaAtrasada(estado, fechaPrometida, "2026-10-15")).toBe(esperado);
  });

  it("numera las órdenes con cuatro dígitos", () => {
    expect([numeroOrden(7), numeroOrden(12345)]).toEqual(["#0007", "#12345"]);
  });
});

describe("leerImporte", () => {
  it.each([
    ["350", 350],
    ["S/ 1,234.50", 1234.5],
    ["1234,5", 1234.5],
    ["15,000", 15000],
    ["12,50", 12.5],
    ["1 200", 1200],
    ["", 0],
  ])("lee %j como %j", (texto, esperado) => expect(leerImporte(texto)).toBe(esperado));

  it.each(["abc", "1.234", "12.345,6", "-5"])("rechaza %j", (texto) => {
    // "1.234" tiene tres decimales: ambiguo, se rechaza en vez de adivinar.
    expect(leerImporte(texto)).toBeNaN();
  });
});

describe("esquemaOrden", () => {
  it("acepta una orden válida y agrupa los tratamientos por ojo", () => {
    const fd = formulario({ ...base, descuento: "50", od_tratamientos: ["antirreflejo", "filtro_azul"], od_indice: "1,59" });
    const r = esquemaOrden.safeParse(leerFormularioOrden(fd));
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ precio: 350, descuento: 50, od: { tratamientos: ["antirreflejo", "filtro_azul"], indice: 1.59 } });
    expect(valoresOrden(fd).od_tratamientos).toBe("antirreflejo,filtro_azul");
  });

  it("rechaza descuento mayor que el precio", () => {
    const r = esquemaOrden.safeParse(leerFormularioOrden(formulario({ ...base, descuento: "400" })));
    expect(r.success).toBe(false);
    expect(erroresOrden(r.error!).descuento).toBeDefined();
  });

  it("exige fecha prometida futura y laboratorio", () => {
    const r = esquemaOrden.safeParse(leerFormularioOrden(formulario({ ...base, fecha_entrega_prometida: "2000-01-01", laboratorio_id: "" })));
    const e = erroresOrden(r.error!);
    expect(e.fecha_entrega_prometida).toBeDefined();
    expect(e.laboratorio_id).toBeDefined();
  });

  it("nombra los errores de los ojos como los campos del formulario", () => {
    const r = esquemaOrden.safeParse(leerFormularioOrden(formulario({ ...base, oi_diametro_mm: "120", od_tratamientos: "inventado" })));
    const e = erroresOrden(r.error!);
    expect(e.oi_diametro_mm).toBeDefined();
    expect(e.od_tratamientos).toBeDefined();
  });
});

describe("metas y ventas", () => {
  it("valida la meta mensual", () => {
    expect(esquemaMeta.safeParse({ periodo: "2026-10", importe_objetivo: "S/ 15,000" }).data).toEqual({
      periodo: "2026-10",
      importe_objetivo: 15000,
    });
    expect(esquemaMeta.safeParse({ periodo: "2026-13", importe_objetivo: "10" }).success).toBe(false);
    expect(esquemaMeta.safeParse({ periodo: "2026-10", importe_objetivo: "0" }).success).toBe(false);
  });

  it("calcula cumplimiento y lo que falta", () => {
    expect(cumplimiento(7500, 10000)).toEqual({ porcentaje: 75, falta: 2500 });
    expect(cumplimiento(12000, 10000)).toEqual({ porcentaje: 120, falta: 0 });
    expect(cumplimiento(500, null)).toBeNull();
  });

  it("calcula la variación contra el mes anterior", () => {
    expect(variacion(1100, 1000)).toBeCloseTo(10);
    expect(variacion(500, 0)).toBeNull();
  });

  it("formatea soles y meses en español", () => {
    expect(soles(1234.5).replace(/\s/g, " ")).toBe("S/ 1,234.50");
    expect(mes("2026-10-01")).toBe("octubre de 2026");
  });
});
