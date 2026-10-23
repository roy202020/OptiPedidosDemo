import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({rpc:vi.fn(), maybeSingle:vi.fn(), tarifas:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn((url:string)=>{throw new Error("REDIRECT:"+url)})}));
vi.mock("next/server",()=>({after:vi.fn()}));
vi.mock("@/lib/notificaciones",()=>({procesarAviso:vi.fn()}));
vi.mock("@/lib/sesion",()=>({exigirOptica:vi.fn(async()=>({id:"demo",rol:"administrador"})),exigirPermiso:vi.fn()}));
vi.mock("@/lib/datos/precios-ordenes",()=>({tarifasParaPedidos:mocks.tarifas}));
vi.mock("@/lib/supabase/servidor",()=>({crearClienteServidor:vi.fn(async()=>({rpc:mocks.rpc,from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:mocks.maybeSingle};return q}}))}));
import { crearOrden, actualizarOrden } from "@/app/panel/ordenes/acciones";
const id="0704ad05-82b9-47b2-b246-e8b1bc46c581";
const receta={od_esfera:-1,od_cilindro:0,od_eje:null,od_adicion:null,oi_esfera:-2,oi_cilindro:0,oi_eje:null,oi_adicion:null};
const tarifa={id:"tarifa",nombre:"PC",material:"Policarbonato",indice:1.59,tratamiento:null,color:null,vision:"monofocal",unidad:"por_luna",precio:150,esfera_min:-6,esfera_max:6,cilindro_min:-2,cilindro_max:0,adicion_min:null,adicion_max:null};
function formulario(precio="300",ojo="ambos"){const f=new FormData();for(const [k,v] of Object.entries({receta_id:id,laboratorio_id:id,tipo_trabajo:"solo_lunas",prioridad:"normal",fecha_entrega_prometida:"2999-01-01",precio,descuento:"0",ojos_pedido:ojo,configuracion_lentes:"compartida",luna_material:"Policarbonato",luna_indice:"1.59",modo_precio:"automatico"}))f.set(k,v);return f;}
beforeEach(()=>{vi.clearAllMocks();mocks.maybeSingle.mockResolvedValue({data:receta,error:null});mocks.tarifas.mockResolvedValue([tarifa]);mocks.rpc.mockResolvedValue({data:id,error:null})});
describe("comprobación del precio al guardar",()=>{
 it("rechaza un precio automático manipulado sin crear la orden",async()=>{const r=await crearOrden(id,id,{},formulario("1"));expect(r.error).toContain("tarifa cambió");expect(mocks.rpc).not.toHaveBeenCalled()});
 it("consulta de nuevo el catálogo y rechaza una tarifa que cambió",async()=>{mocks.tarifas.mockResolvedValue([{...tarifa,precio:175}]);expect((await crearOrden(id,id,{},formulario())).error).toContain("tarifa cambió");expect(mocks.rpc).not.toHaveBeenCalled()});
 it("no guarda si no existe tarifa para los tratamientos",async()=>{const f=formulario();f.append("luna_tratamientos","antirreflejo");expect((await crearOrden(id,id,{},f)).error).toContain("Sin tarifa");expect(mocks.rpc).not.toHaveBeenCalled()});
 it("envía al RPC el importe comprobado de un solo lente",async()=>{await expect(crearOrden(id,id,{},formulario("150","oi"))).rejects.toThrow("REDIRECT:");expect(mocks.rpc).toHaveBeenCalledWith("crear_orden",expect.objectContaining({p_precio:150,p_ojos:expect.objectContaining({_ojos:["OI"]})}))});
 it("conserva el flujo de precios acordados",async()=>{const f=formulario("250");f.set("modo_precio","manual");await expect(crearOrden(id,id,{},f)).rejects.toThrow("REDIRECT:");expect(mocks.tarifas).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledWith("crear_orden",expect.objectContaining({p_precio:250}))});
 it("guarda lunas más montura y transmite su desglose atómicamente",async()=>{const f=formulario("380");f.set("precio_montura","80");f.set("descuento","50");await expect(crearOrden(id,id,{},f)).rejects.toThrow("REDIRECT:");expect(mocks.rpc).toHaveBeenCalledWith("crear_orden",expect.objectContaining({p_precio:380,p_descuento:50,p_ojos:expect.objectContaining({_precio_montura:80})}))});
 it("rechaza un total que omite el precio de montura",async()=>{const f=formulario("300");f.set("precio_montura","80");expect((await crearOrden(id,id,{},f)).error).toContain("tarifa cambió");expect(mocks.rpc).not.toHaveBeenCalled()});
 it("rechaza precios de montura negativos o con más de dos decimales",async()=>{for(const precio of ["-1","1.001","texto"]){const f=formulario();f.set("precio_montura",precio);expect((await crearOrden(id,id,{},f)).campos?.precio_montura).toBeDefined()}expect(mocks.rpc).not.toHaveBeenCalled()});
 it("edición no acepta cambiar la receta para obtener una tarifa diferente",async()=>{mocks.maybeSingle.mockResolvedValue({data:{receta_id:"otra",orden_ojos:[]}});expect((await actualizarOrden(id,{},formulario())).error).toContain("receta del pedido");expect(mocks.rpc).not.toHaveBeenCalled()});
 it("edición comprueba con la graduación guardada y detecta precio alterado",async()=>{mocks.maybeSingle.mockResolvedValue({data:{receta_id:id,orden_ojos:[{ojo:"OI",esfera:-2,cilindro:0,eje:null,adicion:null}]}});expect((await actualizarOrden(id,{},formulario("1","oi"))).error).toContain("tarifa cambió");expect(mocks.rpc).not.toHaveBeenCalled()});
});
