import { describe, expect, it } from "vitest";
import { esquemaOrden, erroresOrden, leerFormularioOrden, ojosParaRpc, valoresOrden } from "@/lib/validacion/orden";

function formulario(ojos = "ambos") {
  const fd = new FormData();
  const campos = {
    receta_id: "0704ad05-82b9-47b2-b246-e8b1bc46c581", laboratorio_id: "0704ad05-82b9-47b2-b246-e8b1bc46c581",
    fecha_entrega_prometida: "2999-01-01", tipo_trabajo: "solo_lunas", prioridad: "normal", precio: "100",
    configuracion_lentes: "compartida", ojos_pedido: ojos, luna_material: "Policarbonato", luna_indice: "1.59", luna_diseno: "monofocal",
  };
  for (const [k,v] of Object.entries(campos)) fd.set(k,v);
  fd.append("luna_tratamientos", "antirreflejo");
  fd.append("luna_tratamientos", "uv");
  return fd;
}

describe("datos compartidos y selección de lentes", () => {
  it("aplica una sola captura a los dos ojos sin modificar la graduación", () => {
    const fd = formulario();
    const dato = esquemaOrden.parse(leerFormularioOrden(fd));
    expect(dato.od).toEqual(dato.oi);
    expect(dato.od).toMatchObject({ material:"Policarbonato", indice:1.59, tratamientos:["antirreflejo", "uv"] });
    expect(ojosParaRpc(dato)).not.toHaveProperty("_ojos");
  });
  it.each([["od", "OD"], ["oi", "OI"]])("envía únicamente %s como ojo solicitado", (valor, ojo) => {
    const payload = ojosParaRpc(esquemaOrden.parse(leerFormularioOrden(formulario(valor))));
    expect(payload._ojos).toEqual([ojo]);
  });
  it("rechaza una selección de ojo desconocida", () => {
    expect(esquemaOrden.safeParse(leerFormularioOrden(formulario("ninguno"))).success).toBe(false);
  });
  it("devuelve el error al control compartido visible y conserva tratamientos al fallar", () => {
    const fd = formulario(); fd.set("luna_indice", "1.2");
    const r = esquemaOrden.safeParse(leerFormularioOrden(fd));
    expect(r.success).toBe(false);
    expect(erroresOrden(r.error!,fd).luna_indice).toBeDefined();
    expect(valoresOrden(fd).luna_tratamientos).toBe("antirreflejo,uv");
  });
  it("sigue leyendo las especificaciones anteriores por ojo sin unificarlas", () => {
    const fd = formulario(); fd.set("configuracion_lentes","por_ojo");
    fd.set("od_material","CR-39"); fd.set("oi_material","Trivex");
    const d = esquemaOrden.parse(leerFormularioOrden(fd));
    expect(d.od.material).toBe("CR-39"); expect(d.oi.material).toBe("Trivex");
  });
});
