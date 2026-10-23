import { describe, expect, it } from "vitest";
import { sumarPreciosPedido, calcularPrecioLunas, type TarifaLuna, type RecetaPrecio, type SeleccionPrecio } from "@/lib/ordenes/precio";
const receta: RecetaPrecio = {od_esfera:-1,od_cilindro:-0.5,od_eje:90,od_adicion:null,oi_esfera:-1.5,oi_cilindro:0,oi_eje:null,oi_adicion:null};
const lente = { material:"Policarbonato",indice:"1.59",tratamientos:["antirreflejo"],diseno:"monofocal",tinte:"" };
const datos: SeleccionPrecio = {ojos_pedido:"ambos",od:lente,oi:lente};
const tarifa: TarifaLuna = { id:"1",nombre:"Policarbonato AR", material:"Policarbonato",indice:1.59,tratamiento:"Antirreflejo",color:null,vision:"monofocal",unidad:"por_luna",precio:150,esfera_min:-6,esfera_max:6,cilindro_min:-2,cilindro_max:0,adicion_min:null,adicion_max:null };
describe("precio automático del pedido",()=>{
 it("cobra dos lunas por unidad y una sola en reposición",()=>{expect(calcularPrecioLunas(datos,receta,[tarifa]).total).toBe(300);expect(calcularPrecioLunas({...datos,ojos_pedido:"oi"},receta,[tarifa]).total).toBe(150)});
 it("respeta el precio por par y divide por dos en reposición",()=>{const t={...tarifa,unidad:"por_par" as const,precio:299.99};expect(calcularPrecioLunas(datos,receta,[t]).total).toBe(299.99);expect(calcularPrecioLunas({...datos,ojos_pedido:"od"},receta,[t]).total).toBe(150)});
 it("exige que coincida el conjunto completo de tratamientos sin depender del orden",()=>{const d={...datos,od:{...lente,tratamientos:["filtro_azul","antirreflejo"]},oi:{...lente,tratamientos:["antirreflejo","filtro_azul"]}};expect(calcularPrecioLunas(d,receta,[tarifa]).error).toContain("Sin tarifa");expect(calcularPrecioLunas(d,receta,[{...tarifa,tratamiento:"AR + Filtro de luz azul",precio:200}]).total).toBe(400)});
 it("no usa la tarifa base cuando se añade un tratamiento sin precio",()=>{expect(calcularPrecioLunas({...datos,od:{...lente,tratamientos:["fotocromatico"]}},receta,[tarifa]).error).toContain("Sin tarifa")});
 it("no cotiza un índice o tinte diferente",()=>{expect(calcularPrecioLunas({...datos,od:{...lente,indice:1.67}},receta,[tarifa]).error).toBeTruthy();expect(calcularPrecioLunas({...datos,od:{...lente,tinte:"gris"}},receta,[tarifa]).error).toBeTruthy()});
 it("comprueba el rango solo en el ojo solicitado",()=>{const r={...receta,oi_esfera:-12};expect(calcularPrecioLunas(datos,r,[tarifa]).error).toBeTruthy();expect(calcularPrecioLunas({...datos,ojos_pedido:"od"},r,[tarifa]).total).toBe(150)});
 it("normaliza cilindro positivo antes de comprobar rangos",()=>{expect(calcularPrecioLunas(datos,{...receta,od_esfera:-2,od_cilindro:0.5},[tarifa]).total).toBe(300)});
 it("suma los importes de ojos con especificaciones distintas",()=>{const t={...tarifa,id:"2",material:"CR-39",indice:1.5,precio:80};expect(calcularPrecioLunas({...datos,oi:{...lente,material:"CR-39",indice:1.5}},receta,[tarifa,t]).total).toBe(230)});
 it("advierte sobre precios ambiguos en vez de elegir una tarifa arbitraria",()=>{expect(calcularPrecioLunas(datos,receta,[tarifa,{...tarifa,id:"2",precio:160}]).error).toContain("varias tarifas")});
 it("no falla por tarifas equivalentes de par y unidad",()=>{expect(calcularPrecioLunas(datos,receta,[tarifa,{...tarifa,id:"2",unidad:"por_par",precio:300}]).total).toBe(300)});
 it("no confunde monofocal y progresivo ni inventa tarifas si el catálogo está vacío",()=>{expect(calcularPrecioLunas(datos,receta,[{...tarifa,vision:"progresivo"}]).error).toBeTruthy();expect(calcularPrecioLunas(datos,receta,[]).error).toBeTruthy()});
 it("identifica receta sin graduación en lugar de facturar un ojo ausente",()=>{expect(calcularPrecioLunas(datos,{...receta,oi_esfera:null,oi_cilindro:null},[tarifa]).error).toContain("no tiene graduación")});
});

describe("suma de montura",()=>{
 it("suma una sola montura al par de lunas",()=>{expect(sumarPreciosPedido(calcularPrecioLunas(datos,receta,[tarifa]).total!,80)).toBe(380)});
 it("suma una sola montura en reposición",()=>{expect(sumarPreciosPedido(calcularPrecioLunas({...datos,ojos_pedido:"oi"},receta,[tarifa]).total!,80)).toBe(230)});
 it("no añade importes cuando no hay montura",()=>{expect(sumarPreciosPedido(300,0)).toBe(300)});
 it("suma céntimos sin errores de coma flotante",()=>{expect(sumarPreciosPedido(0.1,0.2)).toBe(0.3)});
});
