import { Archive, ArchiveRestore, Ban, ClipboardList, FileText, Mail, Pencil, Phone, Plus } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Alerta, Campo, Confirmacion } from "@/components/formulario";
import { Cargando, Datos, Encabezado, EnlaceBoton, EstadoVacio, Insignia, Tarjeta, type Tono } from "@/components/ui";
import { listarOrdenes } from "@/lib/datos/ordenes";
import { listarRecetas, obtenerPaciente, type Receta } from "@/lib/datos/pacientes";
import { edad, fecha, graduacion, valor } from "@/lib/formato";
import { hoyISO } from "@/lib/validacion/comun";
import { TablaOrdenes } from "../../ordenes/componentes";
import { anularReceta, cambiarArchivo } from "../acciones";

export const metadata: Metadata = { title: "Paciente" };

export default function PaginaPaciente({ params }: PageProps<"/panel/pacientes/[id]">) {
  return (
    <Suspense fallback={<Cargando alto="h-96" />}>
      <Detalle params={params} />
    </Suspense>
  );
}

async function Detalle({ params }: Pick<PageProps<"/panel/pacientes/[id]">, "params">) {
  const { id } = await params;
  const [p, recetas, { ordenes, total: totalOrdenes }] = await Promise.all([
    obtenerPaciente(id),
    listarRecetas(id),
    listarOrdenes({ paciente: id }),
  ]);
  const archivado = Boolean(p.archivado_en);
  const anios = edad(p.fecha_nacimiento);

  // Una receta está reemplazada si otra receta válida la corrige.
  const reemplazadas = new Set(recetas.filter((r) => !r.anulada_en && r.reemplaza_a).map((r) => r.reemplaza_a));
  const vigente = recetas.find((r) => !r.anulada_en && !reemplazadas.has(r.id));

  return (
    <>
      <Encabezado
        titulo={`${p.apellidos}, ${p.nombres}`}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            {p.numero_documento && <span>{`${p.tipo_documento} ${p.numero_documento}`}</span>}
            {anios != null && <span>· {anios} años</span>}
            {archivado && <Insignia tono="ambar">Archivado</Insignia>}
          </span>
        }
        volver={{ href: "/panel/pacientes", texto: "Pacientes" }}
      >
        <EnlaceBoton href={`/panel/pacientes/${id}/editar`} icono={Pencil}>
          Editar
        </EnlaceBoton>
        <Confirmacion
          accion={cambiarArchivo.bind(null, id, !archivado)}
          titulo={archivado ? "Restaurar paciente" : "Archivar paciente"}
          descripcion={
            archivado
              ? "El paciente volverá a aparecer en el listado y podrás registrarle recetas."
              : "El paciente dejará de aparecer en el listado principal. Su historial y recetas se conservan."
          }
          textoBoton={archivado ? "Restaurar" : "Archivar"}
          iconoBoton={archivado ? <ArchiveRestore /> : <Archive />}
          textoConfirmar={archivado ? "Restaurar" : "Archivar"}
          variante={archivado ? "primario" : "peligro"}
        />
        {!archivado && (
          <EnlaceBoton href={`/panel/pacientes/${id}/recetas/nueva`} icono={Plus}>
            Nueva receta
          </EnlaceBoton>
        )}
        {!archivado && vigente && (
          <>
            <EnlaceBoton href={`/panel/ordenes/nueva?paciente=${id}`} icono={ClipboardList}>
              Nueva orden
            </EnlaceBoton>
            <EnlaceBoton href={`/panel/cotizaciones/nueva?paciente=${id}&receta=${vigente.id}`} variante="primario" icono={FileText}>
              Cotizar lentes
            </EnlaceBoton>
          </>
        )}
      </Encabezado>

      {archivado && (
        <div className="mb-6">
          <Alerta tipo="aviso">Paciente archivado el {fecha(p.archivado_en)}. Restáuralo para registrar nuevas recetas.</Alerta>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="order-2 flex flex-col gap-8 lg:order-1">
        {ordenes.length > 0 && (
          <section aria-labelledby="titulo-ordenes">
            <h2 id="titulo-ordenes" className="mb-3 text-base font-semibold text-slate-900">
              Órdenes{totalOrdenes > ordenes.length ? ` (últimas ${ordenes.length} de ${totalOrdenes})` : ""}
            </h2>
            <TablaOrdenes ordenes={ordenes} hoy={hoyISO()} sinPaciente />
          </section>
        )}
        <section aria-labelledby="titulo-recetas">
          <h2 id="titulo-recetas" className="mb-3 text-base font-semibold text-slate-900">
            Recetas
          </h2>
          {recetas.length === 0 ? (
            <EstadoVacio icono={FileText} titulo="Sin recetas" descripcion="Este paciente aún no tiene recetas registradas.">
              {!archivado && (
                <EnlaceBoton href={`/panel/pacientes/${id}/recetas/nueva`} variante="primario" icono={Plus}>
                  Nueva receta
                </EnlaceBoton>
              )}
            </EstadoVacio>
          ) : (
            <div className="flex flex-col gap-4">
              {recetas.map((r) => (
                <TarjetaReceta
                  key={r.id}
                  receta={r}
                  pacienteId={id}
                  estado={r.anulada_en ? "anulada" : reemplazadas.has(r.id) ? "reemplazada" : r.id === vigente?.id ? "vigente" : "anterior"}
                  editable={!archivado}
                />
              ))}
            </div>
          )}
        </section>
        </div>

        <aside className="order-1 lg:order-2">
          <Tarjeta titulo="Datos del paciente">
            <Datos
              columnas={2}
              items={[
                { titulo: "Nacimiento", valor: fecha(p.fecha_nacimiento) },
                { titulo: "Edad", valor: anios != null ? `${anios} años` : "—" },
                {
                  titulo: "Teléfono",
                  valor: p.telefono ? (
                    <a href={`tel:${p.telefono.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-marca-700 hover:underline">
                      <Phone aria-hidden className="size-3.5" />
                      {p.telefono}
                    </a>
                  ) : (
                    "—"
                  ),
                },
                {
                  titulo: "Recordatorio de control",
                  valor: p.acepta_recordatorios
                    ? `Autorizado el ${fecha(p.fecha_consentimiento)}`
                    : p.fecha_baja
                      ? `De baja desde el ${fecha(p.fecha_baja)}`
                      : "No autorizado",
                },
                {
                  titulo: "Avisos por WhatsApp",
                  valor: p.acepta_whatsapp ? `Autorizados el ${fecha(p.whatsapp_consentimiento_en)}` : "No autorizados",
                },
                {
                  titulo: "Correo",
                  valor: p.email ? (
                    <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 break-all text-marca-700 hover:underline">
                      <Mail aria-hidden className="size-3.5 shrink-0" />
                      {p.email}
                    </a>
                  ) : (
                    "—"
                  ),
                },
              ]}
            />
            {p.notas && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Notas</p>
                <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{p.notas}</p>
              </div>
            )}
          </Tarjeta>
        </aside>
      </div>
    </>
  );
}

const ESTADOS: Record<"vigente" | "anterior" | "reemplazada" | "anulada", { tono: Tono; texto: string }> = {
  vigente: { tono: "verde", texto: "Vigente" },
  anterior: { tono: "neutro", texto: "Anterior" },
  reemplazada: { tono: "ambar", texto: "Reemplazada" },
  anulada: { tono: "rojo", texto: "Anulada" },
};

function TarjetaReceta({
  receta: r,
  pacienteId,
  estado,
  editable,
}: {
  receta: Receta;
  pacienteId: string;
  estado: keyof typeof ESTADOS;
  editable: boolean;
}) {
  const activa = estado === "vigente" || estado === "anterior";
  return (
    <article className={`rounded-xl border border-slate-200 bg-white shadow-tarjeta ${activa ? "" : "opacity-80"}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-5 py-3">
        <h3 className="font-medium text-slate-900">Examen del {fecha(r.fecha_examen)}</h3>
        <Insignia tono={ESTADOS[estado].tono}>{ESTADOS[estado].texto}</Insignia>
        {r.profesional && <span className="text-sm text-slate-500">{r.profesional}</span>}
        {activa && editable && (
          <div className="ml-auto flex gap-2">
            <EnlaceBoton href={`/panel/pacientes/${pacienteId}/recetas/nueva?reemplaza=${r.id}`} tamano="sm" icono={Pencil}>
              Corregir
            </EnlaceBoton>
            <Confirmacion
              accion={anularReceta.bind(null, r.id, pacienteId)}
              titulo="Anular receta"
              descripcion="La receta seguirá visible en el historial, marcada como anulada. No podrá usarse en nuevas órdenes."
              textoBoton="Anular"
              iconoBoton={<Ban />}
              tamanoBoton="sm"
              textoConfirmar="Anular receta"
              pendiente="Anulando…"
            >
              <Campo nombre="motivo" etiqueta="Motivo de la anulación" required maxLength={300} />
            </Confirmacion>
          </div>
        )}
      </header>

      <div className="overflow-x-auto px-5 py-3">
        <table className="w-full min-w-[560px] text-center text-sm tabular-nums">
          <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="py-1.5 text-left">Ojo</th>
              <th scope="col">Esfera</th>
              <th scope="col">Cilindro</th>
              <th scope="col">Eje</th>
              <th scope="col">Adición</th>
              <th scope="col">DNP</th>
              <th scope="col">Altura</th>
              <th scope="col">Prisma</th>
            </tr>
          </thead>
          <tbody>
            {(["od", "oi"] as const).map((o) => (
              <tr key={o} className="border-t border-slate-100">
                <th scope="row" className="py-2 text-left font-semibold text-slate-700">
                  {o.toUpperCase()}
                </th>
                <td>{graduacion(r[`${o}_esfera`])}</td>
                <td>{graduacion(r[`${o}_cilindro`])}</td>
                <td>{valor(r[`${o}_eje`], "°")}</td>
                <td>{graduacion(r[`${o}_adicion`])}</td>
                <td>{valor(r[`${o}_dnp`])}</td>
                <td>{valor(r[`${o}_altura`])}</td>
                <td>{r[`${o}_prisma`] ? `${r[`${o}_prisma`]} ${r[`${o}_base_prisma`] ?? ""}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(r.observaciones || r.anulada_en) && (
        <footer className="space-y-1 border-t border-slate-100 px-5 py-3 text-sm">
          {r.observaciones && <p className="whitespace-pre-line text-slate-600">{r.observaciones}</p>}
          {r.anulada_en && (
            <p className="text-red-700">
              Anulada el {fecha(r.anulada_en)}: {r.motivo_anulacion}
            </p>
          )}
        </footer>
      )}
    </article>
  );
}
