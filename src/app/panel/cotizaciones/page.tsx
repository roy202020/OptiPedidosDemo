import { ClipboardList, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, Encabezado, EnlaceBoton, EstadoVacio, Insignia, Tabla, Td, Th } from "@/components/ui";
import { listarCotizaciones } from "@/lib/datos/cotizaciones-lunas";
import { exigirOptica } from "@/lib/sesion";
import { tienePermiso } from "@/lib/permisos";
import { fecha, soles } from "@/lib/formato";

export default function PaginaCotizaciones() {
  return <><Encabezado titulo="Cotizaciones" descripcion="Cotiza desde una receta vigente y convierte el precio aceptado en una orden." ><EnlaceBoton href="/panel/cotizaciones/nueva" variante="primario" icono={Plus}>Nueva cotización</EnlaceBoton><Suspense fallback={null}><AccesoCatalogo /></Suspense></Encabezado><Suspense fallback={<Cargando alto="h-64"/>}><Contenido/></Suspense></>;
}

async function AccesoCatalogo() {
  const optica = await exigirOptica();
  return tienePermiso(optica.rol, "administrarOptica") ? <EnlaceBoton href="/panel/cotizaciones/catalogo" icono={Settings2}>Catálogo</EnlaceBoton> : null;
}

async function Contenido() {
  const items = await listarCotizaciones();
  if (!items.length) return <EstadoVacio icono={ClipboardList} titulo="Sin cotizaciones" descripcion="Elige un paciente y compara las opciones disponibles para su receta."/>;
  return <><div className="space-y-3 sm:hidden">{items.map(q=>{const v=(q.cotizaciones_lunas_versiones as Array<{numero:number;total:number|null;cotizaciones_lunas_lineas:Array<{producto_nombre:string}>}>).find(v=>v.numero===q.version_actual);const p=q.pacientes as unknown as {nombres:string;apellidos:string};return <Link key={q.id} href={"/panel/cotizaciones/"+q.id} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-tarjeta"><div className="mb-2"><Insignia>{String(q.estado).replaceAll("_"," ")}</Insignia></div><p className="font-semibold">{p.apellidos}, {p.nombres}</p><p className="mt-1 text-sm text-slate-500">{v?.cotizaciones_lunas_lineas?.[0]?.producto_nombre ?? "Producto sin especificar"}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-slate-500">Vence: {fecha(q.vence_el)}</span><strong className="text-marca-800">{v?.total==null?"Precio pendiente":soles(v.total)}</strong></div><span className="mt-3 block text-xs font-medium text-marca-700">Ver cotización →</span></Link>})}</div><div className="hidden sm:block"><Tabla><thead><tr><Th>Paciente</Th><Th>Producto</Th><Th>Estado</Th><Th>Vence</Th><Th>Total</Th><Th><span className="sr-only">Acción</span></Th></tr></thead><tbody>{items.map((q) => {
    const version = (q.cotizaciones_lunas_versiones as Array<{numero:number;total:number|null;estado:string;cotizaciones_lunas_lineas:Array<{producto_nombre:string;modalidad:string}>}>).find((v) => v.numero === q.version_actual);
    const paciente = q.pacientes as unknown as {nombres:string;apellidos:string};
    const producto = version?.cotizaciones_lunas_lineas?.[0];
    return <tr key={q.id}><Td className="font-medium">{paciente.apellidos}, {paciente.nombres}</Td><Td>{producto?.producto_nombre ?? "—"}</Td><Td><Insignia tono={q.estado === "aceptada" || q.estado === "convertida" ? "verde" : q.estado === "pendiente_manual" ? "ambar" : "neutro"}>{String(q.estado).replaceAll("_", " ")}</Insignia></Td><Td>{fecha(q.vence_el)}</Td><Td>{version?.total == null ? "Pendiente" : soles(version.total)}</Td><Td className="text-right"><Link className="text-marca-700 hover:underline" href={`/panel/cotizaciones/${q.id}`}>Ver</Link></Td></tr>;
  })}</tbody></Tabla></div></>;
}
