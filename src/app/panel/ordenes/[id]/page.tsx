import { Ban, Mail, MessageCircle, Pencil, Phone, Printer, RotateCw, Send, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alerta, Campo, Confirmacion } from "@/components/formulario";
import { Cargando, claseBoton, Datos, Encabezado, EnlaceBoton, Insignia, Tarjeta } from "@/components/ui";
import { obtenerOrden, transicionesDesde, type OrdenDetalle } from "@/lib/datos/ordenes";
import { fecha, graduacion, soles, valor } from "@/lib/formato";
import {
  ACCION_HACIA,
  DISENOS,
  ESTADOS_INTERNOS,
  ORIGENES_MONTURA,
  SUBESTADO,
  TIPOS_TRABAJO,
  TRATAMIENTOS,
  numeroOrden,
  type EstadoInterno,
} from "@/lib/ordenes/estados";
import { avisoDeOrden, type Aviso } from "@/lib/notificaciones";
import { enlaceWhatsAppLaboratorio } from "@/lib/ordenes/mensaje-laboratorio";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { hoyISO } from "@/lib/validacion/comun";
import { agregarObservacion, cambiarEstado, reintentarAviso } from "../acciones";
import { InsigniaEstado, MarcasOrden } from "../componentes";
import { LunasInventario } from "./lunas-inventario";
import { NuevaObservacion } from "./nueva-observacion";

export const metadata: Metadata = { title: "Orden" };

type Props = PageProps<"/panel/ordenes/[id]">;

export default function PaginaOrden({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Cargando alto="h-96" />}>
      <Detalle params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Lima" }).format(new Date(iso));

async function Detalle({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const busquedaLunas = {
    OD: typeof sp.lunas_OD === "string" ? sp.lunas_OD : undefined,
    OI: typeof sp.lunas_OI === "string" ? sp.lunas_OI : undefined,
  };
  const { orden: o, usuario } = await obtenerOrden(id);
  const [transiciones, aviso, optica] = await Promise.all([transicionesDesde(o.estado), avisoDeOrden(id), exigirOptica()]);
  const supabase = await crearClienteServidor();
  const { data: datosOptica } = await supabase.from("opticas").select("nombre, telefono").eq("id", optica.id).single();
  const whatsapp = enlaceWhatsAppLaboratorio(o, { nombre: datosOptica?.nombre ?? optica.nombre, telefono: datosOptica?.telefono });
  const hoy = hoyISO();

  // Primero los avances, luego "devolver" y al final "anular".
  const orden = (e: EstadoInterno) => (e === "anulada" ? 99 : e === "borrador" ? 98 : ESTADOS_INTERNOS.indexOf(e));
  const destinos = [...transiciones].sort((a, b) => orden(a) - orden(b));
  const principal = destinos.find((d) => d !== "anulada" && d !== "borrador");

  return (
    <>
      <Encabezado
        titulo={`Orden ${numeroOrden(o.numero)}`}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <InsigniaEstado estado={o.estado} detalle />
            <MarcasOrden orden={o} hoy={hoy} />
          </span>
        }
        volver={{ href: "/panel/ordenes", texto: "Órdenes" }}
      >
        <a href={`/imprimir/orden/${id}?auto=1`} target="_blank" rel="noopener" className={claseBoton("secundario")}>
          <Printer aria-hidden className="size-4" />
          Imprimir
        </a>
        {o.estado !== "anulada" && (
          <a
            href={whatsapp.url}
            target="_blank"
            rel="noopener noreferrer"
            title={whatsapp.conNumero ? `Abre WhatsApp con el chat de ${o.laboratorio.nombre}` : "El laboratorio no tiene un celular válido: elegirás el contacto en WhatsApp"}
            className={claseBoton("secundario")}
          >
            <Send aria-hidden className="size-4" />
            WhatsApp al laboratorio
          </a>
        )}
        {o.estado === "borrador" && (
          <EnlaceBoton href={`/panel/ordenes/${id}/editar`} icono={Pencil}>
            Editar
          </EnlaceBoton>
        )}
        {destinos.map((hasta) => (
          <BotonTransicion key={hasta} orden={o} hasta={hasta} principal={hasta === principal} />
        ))}
      </Encabezado>

      {o.estado === "anulada" && (
        <div className="mb-6">
          <Alerta tipo="error">
            Anulada el {fecha(o.anulada_en)}. Motivo: {o.motivo_anulacion}
          </Alerta>
        </div>
      )}
      {o.receta.anulada_en && o.estado !== "anulada" && (
        <div className="mb-6">
          <Alerta tipo="aviso">La receta de esta orden fue anulada después de crearla. La graduación de la orden no cambió.</Alerta>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Tarjeta titulo="Trabajo">
            <Datos
              items={[
                { titulo: "Tipo", valor: TIPOS_TRABAJO[o.tipo_trabajo] },
                { titulo: "Prioridad", valor: o.prioridad === "urgente" ? <Insignia tono="ambar">Urgente</Insignia> : "Normal" },
                { titulo: "Entrega prometida", valor: fecha(o.fecha_entrega_prometida) },
                { titulo: "Montura", valor: o.montura_origen ? ORIGENES_MONTURA[o.montura_origen] : "—" },
                { titulo: "Descripción de la montura", valor: o.montura_descripcion ?? "—" },
                {
                  titulo: "Receta",
                  valor: (
                    <Link href={`/panel/pacientes/${o.paciente.id}`} className="text-marca-700 hover:underline">
                      Examen del {fecha(o.receta.fecha_examen)}
                      {o.receta.profesional ? ` · ${o.receta.profesional}` : ""}
                    </Link>
                  ),
                },
              ]}
            />
          </Tarjeta>

          <Tarjeta titulo="Lentes" descripcion="Graduación copiada de la receta al crear la orden." sinRelleno>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left">Ojo</th>
                    <th scope="col" className="px-2 py-2">Esfera</th>
                    <th scope="col" className="px-2 py-2">Cilindro</th>
                    <th scope="col" className="px-2 py-2">Eje</th>
                    <th scope="col" className="px-2 py-2">Adición</th>
                    <th scope="col" className="px-2 py-2">DNP</th>
                    <th scope="col" className="px-2 py-2">Altura</th>
                    <th scope="col" className="px-4 py-2 text-left">Lente</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {o.ojos.map((j) => (
                    <tr key={j.ojo} className="border-t border-slate-100 align-top">
                      <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-700">{j.ojo}</th>
                      <td className="px-2 py-3 text-center">{graduacion(j.esfera)}</td>
                      <td className="px-2 py-3 text-center">{graduacion(j.cilindro)}</td>
                      <td className="px-2 py-3 text-center">{valor(j.eje, "°")}</td>
                      <td className="px-2 py-3 text-center">{graduacion(j.adicion)}</td>
                      <td className="px-2 py-3 text-center">{valor(j.dnp)}</td>
                      <td className="px-2 py-3 text-center">{valor(j.altura)}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <DescripcionLente ojo={j} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>

          <Suspense fallback={<Cargando alto="h-40" />}>
            <LunasInventario orden={o} busqueda={busquedaLunas} />
          </Suspense>

          <Tarjeta titulo="Observaciones">
            {o.estado !== "anulada" && <NuevaObservacion accion={agregarObservacion.bind(null, id)} />}
            {o.observaciones.length > 0 ? (
              <ul className="mt-5 space-y-4 border-t border-slate-100 pt-5">
                {o.observaciones.map((ob) => (
                  <li key={ob.id}>
                    <p className="text-sm whitespace-pre-line text-slate-800">{ob.texto}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {usuario(ob.creado_por)} · {fechaHora(ob.creado_en)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Sin observaciones.</p>
            )}
          </Tarjeta>
        </div>

        <aside className="flex flex-col gap-6">
          <Tarjeta titulo="Importe" descripcion="Soles, IGV incluido">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Precio</dt>
                <dd className="tabular-nums">{soles(o.precio)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Descuento</dt>
                <dd className="tabular-nums">{Number(o.descuento) ? `− ${soles(o.descuento)}` : soles(0)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold text-slate-900">
                <dt>Importe neto</dt>
                <dd className="tabular-nums">{soles(Number(o.precio) - Number(o.descuento))}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              {o.estado === "anulada"
                ? "Orden anulada: no cuenta como venta."
                : o.confirmada_en
                  ? `Venta confirmada el ${fechaHora(o.confirmada_en)}.`
                  : "Se contará como venta al enviarla al laboratorio."}
            </p>
          </Tarjeta>

          {aviso && <TarjetaAviso aviso={aviso} ordenId={id} />}

          <Tarjeta titulo="Paciente">
            <Link href={`/panel/pacientes/${o.paciente.id}`} className="font-medium text-marca-800 hover:underline">
              {o.paciente.apellidos}, {o.paciente.nombres}
            </Link>
            <div className="mt-2 space-y-1 text-sm">
              {o.paciente.telefono ? (
                <a href={`tel:${o.paciente.telefono.replace(/\s/g, "")}`} className="flex items-center gap-1.5 text-slate-700 hover:text-marca-700">
                  <Phone aria-hidden className="size-3.5" />
                  {o.paciente.telefono}
                </a>
              ) : (
                <p className="text-slate-500">Sin teléfono registrado</p>
              )}
              {o.paciente.email && (
                <a href={`mailto:${o.paciente.email}`} className="flex items-center gap-1.5 break-all text-slate-700 hover:text-marca-700">
                  <Mail aria-hidden className="size-3.5 shrink-0" />
                  {o.paciente.email}
                </a>
              )}
            </div>
          </Tarjeta>

          <Tarjeta titulo="Laboratorio">
            <Link href={`/panel/laboratorios/${o.laboratorio.id}`} className="font-medium text-marca-800 hover:underline">
              {o.laboratorio.nombre}
            </Link>
            {!o.laboratorio.activo && (
              <span className="ml-2">
                <Insignia>Inactivo</Insignia>
              </span>
            )}
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              {o.laboratorio.contacto && <p>{o.laboratorio.contacto}</p>}
              {o.laboratorio.telefono && (
                <a href={`tel:${o.laboratorio.telefono.replace(/\s/g, "")}`} className="flex items-center gap-1.5 hover:text-marca-700">
                  <Phone aria-hidden className="size-3.5" />
                  {o.laboratorio.telefono}
                </a>
              )}
            </div>
          </Tarjeta>

          <Tarjeta titulo="Historial">
            <ol className="relative space-y-4 border-l border-slate-200 pl-5">
              <EventoHistorial titulo="Orden creada (venta iniciada)" detalle={`${usuario(o.creado_por)} · ${fechaHora(o.creado_en)}`} />
              {o.historial.map((h) => (
                <EventoHistorial
                  key={h.id}
                  titulo={SUBESTADO[h.hasta]}
                  detalle={`${usuario(h.usuario_id)} · ${fechaHora(h.creado_en)}`}
                  tono={h.hasta === "anulada" ? "rojo" : h.hasta === "recibida_optica" || h.hasta === "entregada" ? "verde" : "azul"}
                />
              ))}
            </ol>
          </Tarjeta>
        </aside>
      </div>
    </>
  );
}

function EventoHistorial({ titulo, detalle, tono = "azul" }: { titulo: string; detalle: string; tono?: "azul" | "verde" | "rojo" }) {
  const color = { azul: "bg-marca-600", verde: "bg-emerald-500", rojo: "bg-red-500" }[tono];
  return (
    <li className="relative">
      <span aria-hidden className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-white ${color}`} />
      <p className="text-sm font-medium text-slate-900">{titulo}</p>
      <p className="text-xs text-slate-500">{detalle}</p>
    </li>
  );
}

function DescripcionLente({ ojo }: { ojo: OrdenDetalle["ojos"][number] }) {
  const partes = [
    ojo.material,
    ojo.indice ? `índice ${ojo.indice}` : null,
    ojo.diseno ? DISENOS[ojo.diseno as keyof typeof DISENOS] ?? ojo.diseno : null,
    ojo.diametro_mm ? `Ø ${ojo.diametro_mm} mm` : null,
    ojo.tinte ? `tinte ${ojo.tinte}` : null,
  ].filter(Boolean);
  return (
    <div className="space-y-1">
      <p>{partes.length ? partes.join(" · ") : <span className="text-slate-400">Sin especificar</span>}</p>
      {ojo.tratamientos.length > 0 && (
        <p className="flex flex-wrap gap-1">
          {ojo.tratamientos.map((t) => (
            <Insignia key={t}>{TRATAMIENTOS[t as keyof typeof TRATAMIENTOS] ?? t}</Insignia>
          ))}
        </p>
      )}
    </div>
  );
}

function BotonTransicion({ orden, hasta, principal }: { orden: OrdenDetalle; hasta: EstadoInterno; principal: boolean }) {
  const accion = cambiarEstado.bind(null, orden.id, orden.estado, hasta);
  const numero = numeroOrden(orden.numero);

  if (hasta === "anulada") {
    return (
      <Confirmacion
        accion={accion}
        titulo={`Anular orden ${numero}`}
        descripcion="La orden quedará anulada con su historial. Esta acción no se puede deshacer."
        textoBoton="Anular"
        iconoBoton={<Ban />}
        textoConfirmar="Anular orden"
        pendiente="Anulando…"
      >
        <Campo nombre="motivo" etiqueta="Motivo de la anulación" required maxLength={300} />
      </Confirmacion>
    );
  }

  const descripciones: Partial<Record<EstadoInterno, string>> = {
    enviada: "La orden ya no se podrá editar. Podrás devolverla a venta iniciada mientras el laboratorio no la reciba.",
    recibida_optica: "Los lentes llegaron a la óptica. Si el paciente autorizó avisos por WhatsApp, se le enviará un mensaje a su celular.",
    entregada: "Confirma que el paciente recibió sus lentes.",
  };

  return (
    <Confirmacion
      accion={accion}
      titulo={`${ACCION_HACIA[hasta]} · ${numero}`}
      descripcion={descripciones[hasta] ?? `La orden pasará a «${SUBESTADO[hasta]}».`}
      textoBoton={ACCION_HACIA[hasta]}
      iconoBoton={hasta === "borrador" ? <Undo2 /> : undefined}
      varianteBoton={principal ? "primario" : "secundario"}
      textoConfirmar="Confirmar"
      variante="primario"
    />
  );
}

const AVISO: Record<Aviso["estado"], { texto: string; tono: "neutro" | "azul" | "verde" | "rojo" | "ambar" }> = {
  pendiente: { texto: "Pendiente", tono: "azul" },
  enviando: { texto: "Enviando", tono: "azul" },
  enviada: { texto: "Enviado", tono: "verde" },
  fallida: { texto: "Falló", tono: "rojo" },
  omitida: { texto: "No enviado", tono: "ambar" },
};

/** Estado del aviso por WhatsApp de "lentes listos", con reintento si falló o se omitió. */
function TarjetaAviso({ aviso: a, ordenId }: { aviso: Aviso; ordenId: string }) {
  const telefono = a.telefono ? `+${a.telefono.slice(0, 2)} ${a.telefono.slice(2)}` : null;
  return (
    <Tarjeta titulo="Aviso por WhatsApp" acciones={<Insignia tono={AVISO[a.estado].tono} icono={MessageCircle}>{AVISO[a.estado].texto}</Insignia>}>
      <div className="space-y-1 text-sm text-slate-600">
        {telefono && <p className="tabular-nums">{telefono}</p>}
        {a.estado === "enviada" && a.enviado_en && <p>Enviado el {fechaHora(a.enviado_en)}.</p>}
        {(a.estado === "pendiente" || a.estado === "enviando") && <p>En cola desde {fechaHora(a.creado_en)}. Recarga en unos segundos.</p>}
        {a.ultimo_error && <p className={a.estado === "fallida" ? "text-red-700" : "text-amber-800"}>{a.ultimo_error}</p>}
        {a.intentos > 0 && <p className="text-xs text-slate-500">Intentos: {a.intentos}{a.ultimo_intento_en ? ` · último ${fechaHora(a.ultimo_intento_en)}` : ""}</p>}
      </div>
      {(a.estado === "fallida" || a.estado === "omitida") && (
        <div className="mt-3">
          <Confirmacion
            accion={reintentarAviso.bind(null, a.id, ordenId)}
            titulo="Reintentar aviso por WhatsApp"
            descripcion="Se volverán a revisar el teléfono y la autorización del paciente (por si los corregiste) y se intentará enviar de nuevo."
            textoBoton="Reintentar"
            iconoBoton={<RotateCw />}
            tamanoBoton="sm"
            textoConfirmar="Reintentar envío"
            variante="primario"
            pendiente="Enviando…"
          />
        </div>
      )}
    </Tarjeta>
  );
}
