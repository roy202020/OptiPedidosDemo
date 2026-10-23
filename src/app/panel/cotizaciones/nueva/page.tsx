import Link from "next/link";
import { FileText } from "lucide-react";
import { Suspense } from "react";
import { Cargando, claseBoton, claseControl, Encabezado, EnlaceBoton, EstadoVacio, Tarjeta } from "@/components/ui";
import { crearCotizacion } from "../acciones";
import { listarReglasCotizacion, variantesDisponiblesCotizacion } from "@/lib/datos/cotizaciones-lunas";
import { obtenerPaciente, listarRecetas } from "@/lib/datos/pacientes";
import { fecha, graduacion, soles } from "@/lib/formato";
import { listarPacientes } from "@/lib/datos/pacientes";
import { compatibleConRango, hayStockExactoParaPar } from "@/lib/cotizaciones/compatibilidad";
import { sedeParaRegistrar } from "@/lib/sesion";

export default function NuevaCotizacion({ searchParams }: PageProps<"/panel/cotizaciones/nueva">) {
  return <><Encabezado titulo="Cotizar lentes" descripcion="Elige paciente y receta, compara opciones y guarda la cotización." volver={{href:"/panel/cotizaciones",texto:"Cotizaciones"}}/><Suspense fallback={<Cargando alto="h-72"/>}><Contenido searchParams={searchParams}/></Suspense></>;
}

async function Contenido({searchParams}: Pick<PageProps<"/panel/cotizaciones/nueva">,"searchParams">) {
  const sp = await searchParams;
  if (typeof sp.paciente !== "string") {
    const {pacientes} = await listarPacientes({q:typeof sp.q === "string" ? sp.q.slice(0,80) : ""});
    return <Tarjeta titulo="Elige al paciente"><form className="mb-4 flex gap-2"><input className={`${claseControl} h-11`} aria-label="Buscar paciente por nombre o documento" name="q" placeholder="Buscar paciente" defaultValue={typeof sp.q === "string" ? sp.q : ""}/><button className={claseBoton("secundario")}>Buscar</button></form>{pacientes.length===0 && <EstadoVacio icono={FileText} titulo="No encontramos pacientes" descripcion="Prueba con otro nombre o registra al paciente."><EnlaceBoton href="/panel/pacientes/nuevo">Registrar paciente</EnlaceBoton></EstadoVacio>}<ul className="divide-y">{pacientes.map((p)=><li key={p.id} className="flex items-center justify-between gap-3 py-3"><span>{p.apellidos}, {p.nombres}</span><Link className={claseBoton("secundario")} href={`/panel/cotizaciones/nueva?paciente=${p.id}`}>Elegir</Link></li>)}</ul></Tarjeta>;
  }
  const [paciente, recetas, destino] = await Promise.all([obtenerPaciente(sp.paciente), listarRecetas(sp.paciente), sedeParaRegistrar()]);
  const reemplazadas = new Set(recetas.filter((r)=>!r.anulada_en&&r.reemplaza_a).map((r)=>r.reemplaza_a));
  const vigentes = recetas.filter((r)=>!r.anulada_en&&!reemplazadas.has(r.id));
  const elegido = typeof sp.receta === "string" ? vigentes.find((r)=>r.id===sp.receta) : vigentes[0];
  const reglas = (await listarReglasCotizacion()).filter((r)=>r.activo);
  if (paciente.archivado_en) return <EstadoVacio icono={FileText} titulo="Paciente archivado" descripcion="Restaura al paciente antes de cotizar."/>;
  if (!vigentes.length) return <EstadoVacio icono={FileText} titulo="No hay receta vigente" descripcion="Registra una receta actual para cotizar."/>;
  if (!reglas.length) return <EstadoVacio icono={FileText} titulo="Catálogo sin reglas activas" descripcion="El administrador debe configurar productos y rangos antes de cotizar."/>;
  const ojo=(s:number|null,c:number|null,e:number|null,a:number|null)=>s==null&&c==null?"—":`${graduacion(s??0)} ${graduacion(c??0)} × ${e??"—"}${a==null?"":` Ad ${graduacion(a)}`}`;
  const compatiblesRango=reglas.filter((r)=>{
    const p=r.lunas_productos as unknown as {vision:string};
    return elegido && compatibleConRango(
      {esfera:elegido.od_esfera,cilindro:elegido.od_cilindro,eje:elegido.od_eje,adicion:elegido.od_adicion},
      {esfera:elegido.oi_esfera,cilindro:elegido.oi_cilindro,eje:elegido.oi_eje,adicion:elegido.oi_adicion},p.vision,r);
  });
  const variantes=destino.sede?await variantesDisponiblesCotizacion(destino.sede.id,compatiblesRango.filter(r=>r.modalidad==="terminada").map(r=>r.producto_id)):[];
  const disponibles=compatiblesRango.map(r=>{const producto=r.lunas_productos as unknown as {por_lado:boolean};return {regla:r,stockExacto:r.modalidad!=="terminada"||Boolean(elegido&&destino.sede&&hayStockExactoParaPar(
    {esfera:elegido.od_esfera,cilindro:elegido.od_cilindro,eje:elegido.od_eje,adicion:elegido.od_adicion},
    {esfera:elegido.oi_esfera,cilindro:elegido.oi_cilindro,eje:elegido.oi_eje,adicion:elegido.oi_adicion},producto.por_lado,variantes.filter(v=>v.producto_id===r.producto_id)))}});
  return <div className="space-y-5">{typeof sp.error==="string"&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">No se guardó la cotización: {sp.error}</div>}<Tarjeta titulo={`${paciente.apellidos}, ${paciente.nombres}`} descripcion="Selecciona una receta vigente. Se requiere graduación en ambos ojos para cotizar un par."><div className="flex flex-wrap gap-2">{vigentes.map((r)=><Link key={r.id} href={`/panel/cotizaciones/nueva?paciente=${paciente.id}&receta=${r.id}`} className={`rounded-lg border p-3 text-sm ${r.id===elegido?.id?"border-marca-600 bg-marca-50":""}`}><span className="font-medium">{fecha(r.fecha_examen)}</span><span className="mt-1 block">OD {ojo(r.od_esfera,r.od_cilindro,r.od_eje,r.od_adicion)}</span><span className="block">OI {ojo(r.oi_esfera,r.oi_cilindro,r.oi_eje,r.oi_adicion)}</span></Link>)}</div></Tarjeta>
    {elegido && <Tarjeta titulo="Opciones para esta receta" descripcion="Compara el precio del par y su disponibilidad. Elige una opción para guardar la cotización.">{disponibles.length===0?<p className="text-sm text-slate-600">No hay reglas configuradas compatibles con los dos ojos de esta receta.</p>:<ul className="divide-y">{disponibles.map(({regla:r,stockExacto})=>{const p=r.lunas_productos as unknown as {nombre:string;tipo:string;material:string|null;indice:number|null;tratamiento:string|null;vision:string};const price=r.precio_venta==null?null:Number(r.precio_venta)*(r.unidad_precio==="por_luna"?2:1);return <li key={r.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{p.nombre}</p><p className="text-sm text-slate-600">{[p.vision,p.tipo,p.material,p.indice?`Índice ${p.indice}`:null,p.tratamiento].filter(Boolean).join(" · ")}</p><p className="text-xs text-slate-500">{r.modalidad.replaceAll("_"," ")} · esfera {r.esfera_min} a {r.esfera_max} · cilindro {r.cilindro_min} a {r.cilindro_max}</p>{!stockExacto&&<p className="text-xs font-medium text-amber-700">Sin stock exacto para ambos ojos en esta sede. Configura fabricación especial para ofrecerlo sin stock terminado.</p>}</div><div className="flex min-w-0 flex-col items-start gap-3"><strong className="text-xl text-marca-800">{price===null?"Precio manual":soles(price)}<span className="ml-2 text-xs font-normal text-slate-500">por par</span></strong><form action={crearCotizacion} className="flex flex-wrap items-end gap-3"><input type="hidden" name="paciente_id" value={paciente.id}/><input type="hidden" name="receta_id" value={elegido.id}/><input type="hidden" name="regla_id" value={r.id}/><label className="flex flex-col gap-1 text-xs">Vence (opcional)<input type="date" name="vence_el" className={`${claseControl} h-11`}/></label><button disabled={!stockExacto||!destino.sede} className={claseBoton("primario")}>Guardar cotización</button></form></div></li>})}</ul>}</Tarjeta>}</div>;
}
