import type { Metadata } from "next";
import { Suspense } from "react";
import { Boton, Cargando, Encabezado, EnlaceBoton, Etiqueta, Tarjeta } from "@/components/ui";
import { listarRecetas, obtenerPaciente, type Receta } from "@/lib/datos/pacientes";
import { edad, fecha, graduacion, valor } from "@/lib/formato";
import { cambiarArchivo } from "../acciones";
import { AnularReceta } from "./anular-receta";

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
  const [p, recetas] = await Promise.all([obtenerPaciente(id), listarRecetas(id)]);
  const archivado = Boolean(p.archivado_en);
  const anios = edad(p.fecha_nacimiento);

  // Una receta está reemplazada si otra receta válida la corrige.
  const reemplazadas = new Set(recetas.filter((r) => !r.anulada_en && r.reemplaza_a).map((r) => r.reemplaza_a));
  const vigente = recetas.find((r) => !r.anulada_en && !reemplazadas.has(r.id));

  return (
    <>
      <Encabezado
        titulo={`${p.apellidos}, ${p.nombres}`}
        subtitulo={[
          p.numero_documento ? `${p.tipo_documento} ${p.numero_documento}` : null,
          anios != null ? `${anios} años` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        volver={{ href: "/panel/pacientes", texto: "Pacientes" }}
      >
        {!archivado && (
          <EnlaceBoton href={`/panel/pacientes/${id}/recetas/nueva`} variante="primario">
            Nueva receta
          </EnlaceBoton>
        )}
        <EnlaceBoton href={`/panel/pacientes/${id}/editar`}>Editar</EnlaceBoton>
        <form action={cambiarArchivo.bind(null, id, !archivado)}>
          <Boton type="submit">{archivado ? "Restaurar" : "Archivar"}</Boton>
        </form>
      </Encabezado>

      {archivado && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Paciente archivado el {fecha(p.archivado_en)}. Restáuralo para registrar nuevas recetas.
        </p>
      )}

      <Tarjeta className="mb-8">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Dato titulo="Nacimiento" texto={fecha(p.fecha_nacimiento)} />
          <Dato titulo="Teléfono" texto={p.telefono ?? "—"} />
          <Dato titulo="Correo" texto={p.email ?? "—"} />
          {p.notas && (
            <div className="sm:col-span-3">
              <dt className="text-zinc-500">Notas</dt>
              <dd className="whitespace-pre-line">{p.notas}</dd>
            </div>
          )}
        </dl>
      </Tarjeta>

      <h2 className="mb-3 text-lg font-semibold">Recetas</h2>
      {recetas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Este paciente aún no tiene recetas.
        </p>
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
    </>
  );
}

function Dato({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{titulo}</dt>
      <dd>{texto}</dd>
    </div>
  );
}

const ESTADOS = {
  vigente: { color: "verde", texto: "Vigente" },
  anterior: { color: "gris", texto: "Anterior" },
  reemplazada: { color: "ambar", texto: "Reemplazada" },
  anulada: { color: "rojo", texto: "Anulada" },
} as const;

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
    <Tarjeta className={activa ? "" : "opacity-75"}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-medium">Examen del {fecha(r.fecha_examen)}</h3>
        <Etiqueta color={ESTADOS[estado].color}>{ESTADOS[estado].texto}</Etiqueta>
        {r.profesional && <span className="text-sm text-zinc-500">· {r.profesional}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-center text-sm tabular-nums">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-1 text-left font-medium">Ojo</th>
              <th className="font-medium">Esfera</th>
              <th className="font-medium">Cilindro</th>
              <th className="font-medium">Eje</th>
              <th className="font-medium">Adición</th>
              <th className="font-medium">DNP</th>
              <th className="font-medium">Altura</th>
              <th className="font-medium">Prisma</th>
            </tr>
          </thead>
          <tbody>
            {(["od", "oi"] as const).map((o) => (
              <tr key={o} className="border-t border-zinc-100 dark:border-zinc-800">
                <th className="py-1.5 text-left font-medium">{o.toUpperCase()}</th>
                <td>{graduacion(r[`${o}_esfera`])}</td>
                <td>{graduacion(r[`${o}_cilindro`])}</td>
                <td>{valor(r[`${o}_eje`], "°")}</td>
                <td>{graduacion(r[`${o}_adicion`])}</td>
                <td>{valor(r[`${o}_dnp`])}</td>
                <td>{valor(r[`${o}_altura`])}</td>
                <td>
                  {r[`${o}_prisma`] ? `${r[`${o}_prisma`]} ${r[`${o}_base_prisma`] ?? ""}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {r.observaciones && <p className="mt-3 whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-300">{r.observaciones}</p>}
      {r.anulada_en && (
        <p className="mt-3 text-sm text-red-700 dark:text-red-400">
          Anulada el {fecha(r.anulada_en)}: {r.motivo_anulacion}
        </p>
      )}

      {activa && editable && (
        <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <EnlaceBoton href={`/panel/pacientes/${pacienteId}/recetas/nueva?reemplaza=${r.id}`}>Corregir</EnlaceBoton>
          <AnularReceta recetaId={r.id} pacienteId={pacienteId} />
        </div>
      )}
    </Tarjeta>
  );
}
