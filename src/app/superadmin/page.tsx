import { Ban, Building2, Clock, Gem } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, Encabezado, EstadoVacio, Indicador, Insignia, Pestanas, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { listarOpticasPlataforma } from "@/lib/datos/plataforma";
import { fecha, soles } from "@/lib/formato";
import { exigirSuperadmin } from "@/lib/sesion";
import { coincideFiltro, limite, NOMBRE_ESTADO, NOMBRE_PLAN, sumarDias, TONO_ESTADO, type FiltroOpticas } from "@/lib/suscripcion";
import { hoyLimaISO } from "@/lib/validacion/comun";
import { FormularioNuevaOptica } from "./formularios";

export const metadata: Metadata = { title: "Ópticas" };

const FILTROS: { valor: FiltroOpticas; texto: string }[] = [
  { valor: "todas", texto: "Todas" },
  { valor: "por-vencer", texto: "Por vencer (5 días)" },
  { valor: "gracia", texto: "En gracia" },
  { valor: "suspendidas", texto: "Suspendidas" },
];

export default function PaginaSuperadmin({ searchParams }: PageProps<"/superadmin">) {
  return (
    <>
      <Encabezado
        titulo="Ópticas"
        descripcion="Planes, vencimientos y pagos. Desde aquí no se ven pacientes, recetas ni pedidos."
      />
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Contenido({ searchParams }: Pick<PageProps<"/superadmin">, "searchParams">) {
  await exigirSuperadmin();
  const [sp, opticas] = await Promise.all([searchParams, listarOpticasPlataforma()]);
  const filtro = FILTROS.find((f) => f.valor === sp.filtro)?.valor ?? "todas";
  const lista = opticas.filter((o) => coincideFiltro(o, filtro));
  const cuenta = (f: FiltroOpticas) => opticas.filter((o) => coincideFiltro(o, f)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Ópticas" valor={String(opticas.length)} icono={Building2} />
        <Indicador titulo="Profesional" valor={String(opticas.filter((o) => o.plan === "profesional").length)} icono={Gem} tono="violeta" />
        <Indicador titulo="Por vencer o en gracia" valor={String(cuenta("por-vencer") + cuenta("gracia"))} icono={Clock} tono="ambar" />
        <Indicador titulo="Suspendidas" valor={String(cuenta("suspendidas"))} icono={Ban} tono="rojo" />
      </div>

      <div className="flex flex-col gap-3">
        <Pestanas
          etiqueta="Filtrar ópticas"
          items={FILTROS.map((f) => ({
            href: f.valor === "todas" ? "/superadmin" : `/superadmin?filtro=${f.valor}`,
            texto: `${f.texto} (${cuenta(f.valor)})`,
            activo: f.valor === filtro,
          }))}
        />
        {lista.length === 0 ? (
          <EstadoVacio icono={Building2} titulo="No hay ópticas en este filtro" />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Óptica</Th>
                <Th>Plan</Th>
                <Th>Estado</Th>
                <Th>Vence</Th>
                <Th className="hidden md:table-cell">Usuarios</Th>
                <Th className="hidden md:table-cell">Sedes</Th>
                <Th className="hidden lg:table-cell">Último pago</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.id}>
                  <Td>
                    <Link href={`/superadmin/opticas/${o.id}`} className="font-medium text-marca-700 hover:underline">
                      {o.nombre}
                    </Link>
                    <p className="text-xs break-all text-slate-500">{o.propietario ?? "Sin propietario activo"}</p>
                  </Td>
                  <Td>{NOMBRE_PLAN[o.plan]}</Td>
                  <Td>
                    <Insignia tono={TONO_ESTADO[o.estado]}>{NOMBRE_ESTADO[o.estado]}</Insignia>
                  </Td>
                  <Td className="tabular-nums">
                    {fecha(o.vence_el)}
                    {o.dias_para_vencer != null && (
                      <p className="text-xs text-slate-500">
                        {o.dias_para_vencer >= 0 ? `en ${o.dias_para_vencer} d` : `hace ${-o.dias_para_vencer} d`}
                      </p>
                    )}
                  </Td>
                  <Td className="hidden tabular-nums md:table-cell">
                    {o.usuarios_activos} / {limite(o.max_usuarios, "∞")}
                  </Td>
                  <Td className="hidden tabular-nums md:table-cell">
                    {o.sedes_activas} / {limite(o.max_sedes, "∞")}
                  </Td>
                  <Td className="hidden tabular-nums lg:table-cell">
                    {o.ultimo_pago ? `${fecha(o.ultimo_pago)} · ${soles(o.ultimo_monto)}` : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </div>

      <Tarjeta
        titulo="Nueva óptica"
        descripcion="El propietario debe tener ya su cuenta. Las ópticas que se registran solas empiezan en Básico con 14 días de prueba."
        className="max-w-4xl"
      >
        <FormularioNuevaOptica venceSugerido={sumarDias(hoyLimaISO(), 30)} />
      </Tarjeta>
    </div>
  );
}
