import { describe, expect, it } from "vitest";
import { indiceAlCambiarMaterial, indiceCompatible, indicesParaMaterial } from "@/lib/ordenes/materiales";
import { erroresOrden, esquemaOrden, leerFormularioOrden } from "@/lib/validacion/orden";

describe("índices compatibles con material", () => {
  it.each([["CR-39","1.50"],["Policarbonato","1.59"],["Trivex","1.53"]])("%s selecciona automáticamente %s", (material, indice) => {
    expect(indicesParaMaterial(material)).toEqual([indice]);
    expect(indiceAlCambiarMaterial(material,"1.74")).toBe(indice);
  });
  it("vacía un índice incompatible cuando hay varias opciones", () => {
    expect(indiceAlCambiarMaterial("Resina de alto índice","1.59")).toBe("");
  });
  it("conserva una elección compatible en otro material", () => {
    expect(indiceAlCambiarMaterial("Cristal mineral","1.70")).toBe("1.70");
  });
  it("al quitar el material elimina su selección de índice", () => {
    expect(indicesParaMaterial("")).toEqual([]);
    expect(indiceAlCambiarMaterial("","1.59")).toBe("");
  });
  it("mantiene compatibles los valores históricos de materiales no catalogados", () => {
    expect(indicesParaMaterial("Material de laboratorio antiguo")).toBeUndefined();
    expect(indiceCompatible("Material de laboratorio antiguo",1.52)).toBe(true);
  });
  it("compara índices numéricos y nombres sin distinguir mayúsculas", () => {
    expect(indiceCompatible(" cr-39 ",1.5)).toBe(true);
    expect(indiceCompatible("Policarbonato",1.67)).toBe(false);
  });
  it("el servidor rechaza una combinación manipulada y apunta al campo compartido", () => {
    const fd = new FormData();
    for (const [k,v] of Object.entries({receta_id:"0704ad05-82b9-47b2-b246-e8b1bc46c581",laboratorio_id:"0704ad05-82b9-47b2-b246-e8b1bc46c581",tipo_trabajo:"solo_lunas",prioridad:"normal",fecha_entrega_prometida:"2999-01-01",precio:"100",configuracion_lentes:"compartida",luna_material:"Policarbonato",luna_indice:"1.67"})) fd.set(k,v);
    const r = esquemaOrden.safeParse(leerFormularioOrden(fd));
    expect(r.success).toBe(false);
    expect(erroresOrden(r.error!,fd).luna_indice).toContain("El índice no es compatible con el material seleccionado");
  });
});
