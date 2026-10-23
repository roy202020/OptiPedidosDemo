import { Suspense } from "react";
import Link from "next/link";
import { Cargando,Encabezado,Tarjeta } from "@/components/ui";
import { listarMonturas,movimientosMonturas } from "@/lib/datos/monturas";
import { obtenerSedeActual } from "@/lib/sesion";
import { tienePermiso } from "@/lib/permisos";
import { soles,fechaLima } from "@/lib/formato";
import { FormularioMontura } from "./formulario";
import { FormularioStock } from "./stock";
export const metadata={title:"Monturas y stock"};
export default function PaginaMonturas(){return <><Encabezado titulo="Monturas y stock" descripcion="Consulta existencias, registra entradas y elige modelos para tus pedidos."/><Suspense fallback={<Cargando alto="h-96"/>}><Contenido/></Suspense></>}
const tipos:Record<string,string>={entrada:"Entrada",conteo:"Ajuste por conteo",devolucion:"Devolución",reserva:"Reserva",liberacion:"Reserva liberada",venta:"Venta",reapertura:"Pedido devuelto a venta iniciada"};
async function Contenido(){
 const [{optica,actual},monturas,movimientos]=await Promise.all([obtenerSedeActual(),listarMonturas(),movimientosMonturas()]);
 const administrar=tienePermiso(optica.rol,"administrarOptica");
 return <div className="space-y-6"><p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{actual?`Stock de la sede ${actual.nombre}.`:"Stock consolidado de tus sedes visibles. Elige una sede en la cabecera para registrar movimientos."} Al guardar un pedido se reserva una unidad; al enviarlo al laboratorio se confirma la venta y se descuenta del stock.</p>
 {administrar&&<Tarjeta titulo="Agregar montura"><FormularioMontura/></Tarjeta>}
 <Tarjeta titulo="Monturas del catálogo" descripcion="Disponible = stock físico menos unidades reservadas en pedidos pendientes.">
 {!monturas.length&&<p className="text-sm text-slate-500">Aún no hay monturas registradas.</p>}
 <div className="divide-y divide-slate-100">{monturas.map(m=><div key={m.id} className="py-5 first:pt-0"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold text-slate-900">{m.nombre}</h3><p className="text-sm text-slate-500">{m.codigo??"Sin código"} · {m.activo?"Activa":"Inactiva"}</p></div><p className="font-semibold">{soles(m.precio)}</p></div>
 <dl className="my-4 grid grid-cols-3 gap-2 text-center text-sm"><div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">Stock físico</dt><dd className="mt-1 text-lg font-semibold">{m.stock}</dd></div><div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">Reservadas</dt><dd className="mt-1 text-lg font-semibold">{m.reservado}</dd></div><div className={`rounded-lg p-3 ${m.disponible>0?"bg-emerald-50 text-emerald-800":"bg-amber-50 text-amber-800"}`}><dt className="text-xs">Disponibles</dt><dd className="mt-1 text-lg font-semibold">{m.disponible}</dd></div></dl>
 {administrar&&actual?.activa&&<details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-marca-700">Registrar entrada o ajustar stock</summary><FormularioStock monturaId={m.id} sedeId={actual.id}/></details>}
 {administrar&&<details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-marca-700">Editar modelo y precio</summary><FormularioMontura montura={m}/></details>}</div>)}</div>
 </Tarjeta>
 <Tarjeta titulo="Últimos movimientos" descripcion="Entradas, reservas, ventas y ajustes con su motivo."><div className="divide-y divide-slate-100">{!movimientos.length&&<p className="text-sm text-slate-500">Aún no hay movimientos de stock.</p>}{movimientos.map(m=>{const modelo=m.monturas as unknown as {nombre:string};const sede=m.sedes as unknown as {nombre:string};return <div key={m.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{tipos[m.tipo]??m.tipo} · {modelo.nombre}</strong><span>{m.variacion_stock>0?"+":""}{m.variacion_stock} stock · {m.variacion_reservado>0?"+":""}{m.variacion_reservado} reservadas</span></div><p className="mt-1 text-slate-600">{m.motivo}</p><p className="mt-1 text-xs text-slate-500">{sede.nombre} · {fechaLima(m.creado_en)}</p>{m.orden_id&&<Link className="mt-1 inline-block py-2 text-marca-700 underline" href={`/panel/ordenes/${m.orden_id}`}>Ver pedido</Link>}</div>})}</div></Tarjeta>
 </div>;
}
