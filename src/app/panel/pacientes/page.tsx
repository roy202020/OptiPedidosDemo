import { Archive, Plus, Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, Encabezado, EnlaceBoton, EstadoVacio, Insignia, Paginacion, Tabla, Td, Th, claseBoton, claseControl } from "@/components/ui";
import { listarPacientes, PACIENTES_POR_PAGINA } from "@/lib/datos/pacientes";
import { edad } from "@/lib/formato";

export const metadata: Metadata = { title: "Pacientes" };

type Props = PageProps<"/panel/pacientes">;

export default function PaginaPacientes({ searchParams }: Props) {
  return (
    <>
      <Encabezado titulo="Pacientes" descripcion="Datos de contacto, documentos y recetas de cada paciente.">
        <EnlaceBoton href="/panel/pacientes/nuevo" variante="primario" icono={Plus}>
          Nuevo paciente
        </EnlaceBoton>
      </Encabezado>
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Listado searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Listado({ searchParams }: Pick<Props, "searchParams">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const archivados = params.archivados === "1";
  const pagina = Math.max(1, Number.parseInt(String(params.pagina ?? "1"), 10) || 1);
  const { pacientes, total } = await listarPacientes({ q, archivados, pagina });

  const href = (extra: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    const todo = { q: q || undefined, archivados: archivados ? "1" : undefined, ...extra };
    for (const [k, v] of Object.entries(todo)) if (v !== undefined && v !== "") sp.set(k, String(v));
    const s = sp.toString();
    return `/panel/pacientes${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <form role="search" className="flex min-w-0 flex-1 gap-2">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre, apellido o documento"
              aria-label="Buscar pacientes"
              className={`${claseControl} h-10 pl-9`}
            />
          </div>
          {archivados && <input type="hidden" name="archivados" value="1" />}
          <button className={claseBoton("secundario")}>Buscar</button>
        </form>
        <div role="group" aria-label="Filtro de estado" className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm">
          {[
            { texto: "Activos", valor: false },
            { texto: "Archivados", valor: true },
          ].map((f) => (
            <Link
              key={f.texto}
              href={href({ archivados: f.valor ? "1" : undefined, pagina: undefined })}
              aria-current={archivados === f.valor ? "true" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                archivados === f.valor ? "bg-marca-700 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f.texto}
            </Link>
          ))}
        </div>
      </div>

      {pacientes.length === 0 ? (
        q ? (
          <EstadoVacio icono={Search} titulo="Sin coincidencias" descripcion={`No hay pacientes que coincidan con “${q}”.`}>
            <EnlaceBoton href={href({ q: undefined, pagina: undefined })}>Limpiar búsqueda</EnlaceBoton>
          </EstadoVacio>
        ) : archivados ? (
          <EstadoVacio icono={Archive} titulo="No hay pacientes archivados" />
        ) : (
          <EstadoVacio icono={Users} titulo="Aún no registras pacientes" descripcion="Registra al primero para empezar a guardar sus recetas.">
            <EnlaceBoton href="/panel/pacientes/nuevo" variante="primario" icono={Plus}>
              Nuevo paciente
            </EnlaceBoton>
          </EstadoVacio>
        )
      ) : (
        <Tabla
          pie={
            <Paginacion pagina={pagina} total={total} porPagina={PACIENTES_POR_PAGINA} href={(p) => href({ pagina: p > 1 ? p : undefined })} />
          }
        >
          <thead>
            <tr>
              <Th>Paciente</Th>
              <Th className="hidden sm:table-cell">Documento</Th>
              <Th className="hidden md:table-cell">Edad</Th>
              <Th>Teléfono</Th>
            </tr>
          </thead>
          <tbody>
            {pacientes.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/panel/pacientes/${p.id}`} className="font-medium text-marca-800 hover:underline">
                    {p.apellidos}, {p.nombres}
                  </Link>
                  {p.archivado_en && (
                    <span className="ml-2">
                      <Insignia>Archivado</Insignia>
                    </span>
                  )}
                </Td>
                <Td className="hidden sm:table-cell">{p.numero_documento ? `${p.tipo_documento} ${p.numero_documento}` : "—"}</Td>
                <Td className="hidden md:table-cell tabular-nums">{edad(p.fecha_nacimiento) ?? "—"}</Td>
                <Td className="tabular-nums">{p.telefono ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
