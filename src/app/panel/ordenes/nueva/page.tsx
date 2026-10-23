import { FileText, FlaskConical, MapPin, Plus, Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, claseBoton, claseControl, Encabezado, EnlaceBoton, EstadoVacio, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { listarLaboratorios } from "@/lib/datos/laboratorios";
import { recetasUtilizables } from "@/lib/datos/ordenes";
import { listarPacientes, obtenerPaciente } from "@/lib/datos/pacientes";
import { fecha, graduacion } from "@/lib/formato";
import { sedeParaRegistrar } from "@/lib/sesion";
import { hoyISO } from "@/lib/validacion/comun";
import { listarMonturas } from "@/lib/datos/monturas";
import { tarifasParaPedidos } from "@/lib/datos/precios-ordenes";
import { crearOrden } from "../acciones";
import { FormularioOrden } from "../formulario-orden";

export const metadata: Metadata = { title: "Nueva orden" };

type Props = PageProps<"/panel/ordenes/nueva">;

export default function PaginaNuevaOrden({ searchParams }: Props) {
  return (
    <>
      <Encabezado titulo="Registrar pedido" descripcion="Elige al paciente y completa los datos. Podrás cobrar e imprimir después de guardar." volver={{ href: "/panel/ordenes", texto: "Pedidos" }} />
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Contenido({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  if (typeof sp.paciente === "string") return <Formulario pacienteId={sp.paciente} />;
  return <ElegirPaciente q={typeof sp.q === "string" ? sp.q.slice(0, 100) : ""} />;
}

/** Paso 1: elegir paciente. */
async function ElegirPaciente({ q }: { q: string }) {
  const { pacientes } = await listarPacientes({ q });
  return (
    <Tarjeta titulo="¿Para quién es el pedido?" descripcion="La orden usará una de sus recetas vigentes.">
      <form role="search" className="mb-4 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input type="search" name="q" defaultValue={q} placeholder="Nombre, apellido o documento" aria-label="Buscar paciente" className={`${claseControl} h-10 pl-9`} />
        </div>
        <button className={claseBoton("secundario")}>Buscar</button>
      </form>
      {pacientes.length === 0 ? (
        <EstadoVacio icono={Users} titulo={q ? "Sin coincidencias" : "Aún no hay pacientes"}>
          <EnlaceBoton href="/panel/pacientes/nuevo" icono={Plus}>
            Registrar paciente
          </EnlaceBoton>
        </EstadoVacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Paciente</Th>
              <Th className="hidden sm:table-cell">Documento</Th>
              <Th>
                <span className="sr-only">Acción</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {pacientes.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <Td className="font-medium text-slate-900">
                  {p.apellidos}, {p.nombres}
                </Td>
                <Td className="hidden sm:table-cell">{p.numero_documento ? `${p.tipo_documento} ${p.numero_documento}` : "—"}</Td>
                <Td className="text-right">
                  <Link href={`/panel/ordenes/nueva?paciente=${p.id}`} className={claseBoton("secundario", "sm")}>
                    Elegir
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </Tarjeta>
  );
}

/** Resumen de una receta para el selector: fecha y graduación. */
function textoReceta(r: Awaited<ReturnType<typeof recetasUtilizables>>[number]) {
  const ojo = (e: number | null, c: number | null, x: number | null, a: number | null) =>
    e == null && c == null ? "—" : `${graduacion(e ?? 0)}${c ? ` ${graduacion(c)} × ${x}°` : ""}${a ? ` Ad ${graduacion(a)}` : ""}`;
  return `${fecha(r.fecha_examen)} · OD ${ojo(r.od_esfera, r.od_cilindro, r.od_eje, r.od_adicion)} · OI ${ojo(r.oi_esfera, r.oi_cilindro, r.oi_eje, r.oi_adicion)}`;
}

/** Paso 2: datos de la orden. */
async function Formulario({ pacienteId }: { pacienteId: string }) {
  const [paciente, recetas, labs, destino, tarifas] = await Promise.all([
    obtenerPaciente(pacienteId),
    recetasUtilizables(pacienteId),
    listarLaboratorios({ soloActivos: true }),
    sedeParaRegistrar(),
    tarifasParaPedidos(),
  ]);
  const nombre = `${paciente.apellidos}, ${paciente.nombres}`;

  if (paciente.archivado_en) {
    return <EstadoVacio icono={Users} titulo="Paciente archivado" descripcion={`Restaura a ${nombre} para crearle órdenes.`} />;
  }
  if (!destino.sede) {
    return <EstadoVacio icono={MapPin} titulo="Elige la sede de la venta" descripcion={destino.error} />;
  }
  if (recetas.length === 0) {
    return (
      <EstadoVacio icono={FileText} titulo="Sin recetas vigentes" descripcion={`${nombre} necesita una receta vigente para crear una orden.`}>
        <EnlaceBoton href={`/panel/pacientes/${pacienteId}/recetas/nueva`} variante="primario" icono={Plus}>
          Registrar receta
        </EnlaceBoton>
      </EstadoVacio>
    );
  }
  if (labs.length === 0) {
    return (
      <EstadoVacio icono={FlaskConical} titulo="No hay laboratorios activos" descripcion="Registra o activa un laboratorio para crear órdenes.">
        <EnlaceBoton href="/panel/laboratorios/nuevo" variante="primario" icono={Plus}>
          Nuevo laboratorio
        </EnlaceBoton>
      </EstadoVacio>
    );
  }

  const monturas = await listarMonturas(true,destino.sede.id);

  // Ojos con graduación en alguna de las recetas (la base solo crea los que tiene la receta elegida).
  const ojos = (["od", "oi"] as const).filter((o) => recetas.some((r) => r[`${o}_esfera`] != null || r[`${o}_cilindro`] != null));

  return (
    <Tarjeta
      titulo={nombre}
      descripcion={`Se registrará en la sede ${destino.sede.nombre}: ahí se recogerán los lentes.`}
      acciones={
        <Link href="/panel/ordenes/nueva" className="text-sm font-medium text-marca-700 hover:underline">
          Cambiar paciente
        </Link>
      }
    >
      <FormularioOrden
        accion={crearOrden.bind(null, pacienteId, destino.sede.id)}
        recetas={recetas.map((r) => ({ valor: r.id, texto: textoReceta(r), rx: r, ojos: (["od", "oi"] as const).filter(o => r[`${o}_esfera`] != null || r[`${o}_cilindro`] != null) }))}
        laboratorios={labs.map((l) => ({ valor: l.id, texto: l.nombre }))}
        monturas={monturas}
        tarifas={tarifas}
        ojos={ojos}
        hoy={hoyISO()}
        cancelar="/panel/ordenes"
      />
    </Tarjeta>
  );
}
