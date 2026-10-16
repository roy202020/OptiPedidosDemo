/**
 * OptiPedidos · Inventario de lunas: medidas, transposición y validación (sin base de datos).
 */
import { describe, expect, it } from "vitest";
import { aCilindroNegativo, clave, enPares, estadoStock, rango, textoMedida } from "@/lib/inventario/medidas";
import { esquemaCompra, esquemaMovimiento, esquemaProducto } from "@/lib/validacion/inventario";

const UUID = "0704ad05-82b9-47b2-b246-e8b1bc46c581";

describe("aCilindroNegativo", () => {
  it("deja igual una medida en cilindro negativo o esférica", () => {
    expect(aCilindroNegativo({ esfera: -2, cilindro: -0.5, eje: 180 })).toEqual({ esfera: -2, cilindro: -0.5, eje: 180, transpuesta: false });
    expect(aCilindroNegativo({ esfera: 1.25, cilindro: 0, eje: null })).toMatchObject({ esfera: 1.25, cilindro: 0, transpuesta: false });
  });

  it.each([
    [{ esfera: -2.5, cilindro: 0.5, eje: 90 }, { esfera: -2, cilindro: -0.5, eje: 180 }],
    [{ esfera: 1, cilindro: 1.25, eje: 135 }, { esfera: 2.25, cilindro: -1.25, eje: 45 }],
    [{ esfera: -0.25, cilindro: 0.25, eje: 10 }, { esfera: 0, cilindro: -0.25, eje: 100 }],
  ])("transpone %j a %j (misma luna)", (entrada, esperado) => {
    expect(aCilindroNegativo(entrada)).toEqual({ ...esperado, transpuesta: true });
  });
});

describe("matriz", () => {
  it("genera rangos con paso de 0.25 incluyendo extremos", () => {
    expect(rango(-1, 0)).toEqual([-1, -0.75, -0.5, -0.25, 0]);
    expect(rango(0, -0.5)).toEqual([-0.5, -0.25, 0]);
  });

  it("la clave de celda no confunde medidas parecidas", () => {
    expect(clave(-2, 0)).not.toBe(clave(-2, -0.5));
    expect(clave(-2, 0)).toBe(clave(-2.0, -0));
  });
});

describe("stock", () => {
  it.each([
    [0, 4, "agotado"],
    [-1, 0, "agotado"],
    [4, 4, "bajo"],
    [5, 4, "ok"],
    [1, 0, "ok"],
  ] as const)("disponible %d con mínimo %d es %s", (disponible, minimo, esperado) => {
    expect(estadoStock(disponible, minimo)).toBe(esperado);
  });

  it("expresa lunas sueltas en pares", () => {
    expect([enPares(24), enPares(13), enPares(1), enPares(0), enPares(2)]).toEqual(["12 pares", "6 pares + 1", "1 luna", "0 pares", "1 par"]);
  });

  it("muestra la medida completa", () => {
    expect(textoMedida({ esfera: -2, cilindro: -0.5 })).toBe("-2.00 / -0.50");
    expect(textoMedida({ esfera: 1, cilindro: 0, adicion: 2, lado: "OD" })).toBe("+1.00 / 0.00 Ad +2.00 OD");
  });
});

describe("validación", () => {
  it("valida productos", () => {
    const r = esquemaProducto.safeParse({ nombre: "Resina blanca", tipo: "resina", vision: "monofocal", indice: "1,56", stock_minimo_defecto: "4" });
    expect(r.data).toMatchObject({ indice: 1.56, por_lado: false, stock_minimo_defecto: 4 });
    expect(esquemaProducto.safeParse({ nombre: "X", tipo: "resina", vision: "monofocal", stock_minimo_defecto: "-1" }).success).toBe(false);
  });

  it("acepta una compra de varias medidas y rechaza cilindro positivo o esfera fuera de paso", () => {
    const linea = { producto_id: UUID, esfera: -2, cilindro: 0, cantidad: 24 };
    expect(esquemaCompra.safeParse({ fecha: "2026-10-16", lineas: [linea, { ...linea, esfera: -2.5 }] }).success).toBe(true);
    expect(esquemaCompra.safeParse({ fecha: "2026-10-16", lineas: [{ ...linea, cilindro: 0.5 }] }).success).toBe(false);
    expect(esquemaCompra.safeParse({ fecha: "2026-10-16", lineas: [{ ...linea, esfera: -2.1 }] }).success).toBe(false);
    expect(esquemaCompra.safeParse({ fecha: "2026-10-16", lineas: [] }).success).toBe(false);
  });

  it("exige motivo en ajustes y pérdidas, y cantidad positiva en ventas", () => {
    expect(esquemaMovimiento.safeParse({ tipo: "ajuste", cantidad: "-2" }).success).toBe(false);
    expect(esquemaMovimiento.safeParse({ tipo: "ajuste", cantidad: "-2", motivo: "Rayada" }).success).toBe(true);
    expect(esquemaMovimiento.safeParse({ tipo: "venta", cantidad: "-2" }).success).toBe(false);
    expect(esquemaMovimiento.safeParse({ tipo: "venta", cantidad: "0" }).success).toBe(false);
  });
});
