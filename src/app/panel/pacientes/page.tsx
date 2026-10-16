import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, Encabezado, EnlaceBoton, Etiqueta } from "@/components/ui";
import { listarPacientes } from "@/lib/datos/pacientes";
import { edad } from "@/lib/formato";

export const metadata: Metadata = { title: "Pacientes" };

export default function PaginaPacientes({ searchParams }: PageProps<"/panel/pacientes">) {
  return (
    <>
      <Encabezado titulo="Pacientes">
        <EnlaceBoton href="/panel/pacientes/nuevo" variante="primario">
          Nuevo paciente
        </EnlaceBoton>
      </Encabezado>
      <Suspense fallback={<Cargando alto="h-64" />}>
        <Listado searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Listado({ searchParams }: Pick<PageProps<"/panel/pacientes">, "searchParams">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const archivados = params.archivados === "1";
  const pacientes = await listarPacientes({ q, archivados });

  return (
    <>
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, apellido o documento"
          aria-label="Buscar pacientes"
          className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {archivados && <input type="hidden" name="archivados" value="1" />}
        <button className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
          Buscar
        </button>
      </form>

      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        {archivados ? "Mostrando pacientes archivados. " : ""}
        <Link
          href={archivados ? "/panel/pacientes" : "/panel/pacientes?archivados=1"}
          className="text-sky-700 hover:underline dark:text-sky-400"
        >
          {archivados ? "Ver pacientes activos" : "Ver archivados"}
        </Link>
      </p>

      {pacientes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {q ? `No hay pacientes que coincidan con “${q}”.` : archivados ? "No hay pacientes archivados." : "Aún no registras pacientes."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3 font-medium">Paciente</th>
                <th className="px-4 py-3 font-medium">Documento</th>
                <th className="px-4 py-3 font-medium">Edad</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
              </tr>
            </thead>
            <tbody>
              {pacientes.map((p) => (
                <tr key={p.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
                  <td className="px-4 py-3">
                    <Link href={`/panel/pacientes/${p.id}`} className="font-medium text-sky-800 hover:underline dark:text-sky-300">
                      {p.apellidos}, {p.nombres}
                    </Link>
                    {p.archivado_en && (
                      <span className="ml-2">
                        <Etiqueta>Archivado</Etiqueta>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {p.numero_documento ? `${p.tipo_documento} ${p.numero_documento}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{edad(p.fecha_nacimiento) ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{p.telefono ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pacientes.length === 100 && (
            <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800">
              Se muestran los primeros 100. Usa la búsqueda para encontrar a otros.
            </p>
          )}
        </div>
      )}
    </>
  );
}
