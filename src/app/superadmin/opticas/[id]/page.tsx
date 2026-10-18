import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cargando, Datos, Encabezado, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { listarPagosSuscripcion } from "@/lib/datos/suscripcion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { listarEventosSuscripcion, listarOpticasPlataforma, type EventoSuscripcion } from "@/lib/datos/plataforma";
import { fecha, fechaLima, soles } from "@/lib/formato";
import { exigirSuperadmin } from "@/lib/sesion";
import { NOMBRE_ESTADO, NOMBRE_MEDIO, NOMBRE_PLAN, sumarDias, TONO_ESTADO, type Plan } from "@/lib/suscripcion";
import { hoyLimaISO } from "@/lib/validacion/comun";
import { cambiarPlan, extenderVencimiento, registrarPagoSuscripcion } from "../../acciones";
import { FormularioExtension, FormularioPago, FormularioPlan } from "../../formularios";

export const metadata: Metadata = { title: "Suscripción de la óptica" };

type Props = PageProps<"/superadmin/opticas/[id]">;

export default function PaginaOpticaPlataforma({ params }: Props) {
  return (
    <Suspense fallback={<Cargando alto="h-96" />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: Pick<Props, "params">) {
  await exigirSuperadmin();
  const { id } = await params;
  const o = (await listarOpticasPlataforma()).find((x) => x.id === id);
  if (!o) notFound();
  const supabase = await crearClienteServidor();
  const [pagos, eventos, plan] = await Promise.all([
    listarPagosSuscripcion(o.id),
    listarEventosSuscripcion(o.id),
    supabase.from("planes").select("max_usuarios, max_sedes, whatsapp_mensual").eq("codigo", o.plan).single(),
  ]);
  if (plan.error) throw new Error(`No se pudo leer el plan: ${plan.error.message}`);
  // Solo se precargan los límites propios del contrato: vacío = lo del plan (así, al cambiar de plan, se toman los nuevos).
  const propio = (valor: number | null, delPlan: number | null) => (valor === delPlan || valor == null ? "" : String(valor));

  // Periodo sugerido: desde el día siguiente al vencimiento (o hoy, si ya pasó) por 30 días.
  const hoy = hoyLimaISO();
  const desde = o.vence_el && o.vence_el >= hoy ? sumarDias(o.vence_el, 1) : hoy;

  return (
    <>
      <Encabezado
        titulo={o.nombre}
        descripcion={o.propietario ? `Propietario: ${o.propietario}` : "Sin propietario activo"}
        volver={{ href: "/superadmin", texto: "Ópticas" }}
      >
        <Insignia tono={TONO_ESTADO[o.estado]}>{NOMBRE_ESTADO[o.estado]}</Insignia>
      </Encabezado>

      <div className="flex flex-col gap-6">
        <Tarjeta>
          <Datos
            columnas={4}
            items={[
              { titulo: "Plan", valor: NOMBRE_PLAN[o.plan] },
              { titulo: "Vence", valor: fecha(o.vence_el) },
              { titulo: "Usuarios activos", valor: o.max_usuarios == null ? `${o.usuarios_activos} (sin límite)` : `${o.usuarios_activos} de ${o.max_usuarios}` },
              { titulo: "Sedes activas", valor: o.max_sedes == null ? `${o.sedes_activas} (sin límite)` : `${o.sedes_activas} de ${o.max_sedes}` },
              { titulo: "WhatsApp automáticos", valor: o.whatsapp_mensual ? `${o.whatsapp_mensual} por sede al mes` : "Solo manual (wa.me)" },
              { titulo: "RUC", valor: o.ruc ?? "—" },
              { titulo: "Teléfono", valor: o.telefono ?? "—" },
              { titulo: "Alta", valor: fechaLima(o.creada_en) },
            ]}
          />
        </Tarjeta>

        <div className="grid gap-6 lg:grid-cols-2">
          <Tarjeta titulo="Plan y límites" descripcion="Vacío = el valor del plan elegido. Llena solo lo que el contrato cambie (por ejemplo, 3 sedes).">
            <FormularioPlan
              accion={cambiarPlan.bind(null, o.id)}
              inicial={{
                plan: o.plan,
                max_usuarios: propio(o.max_usuarios, plan.data.max_usuarios),
                max_sedes: propio(o.max_sedes, plan.data.max_sedes),
                whatsapp_mensual: propio(o.whatsapp_mensual, plan.data.whatsapp_mensual),
              }}
            />
          </Tarjeta>
          <Tarjeta titulo="Vencimiento" descripcion="Aviso 5 días antes, 7 días de gracia y luego solo lectura. Nunca se borran datos.">
            <FormularioExtension accion={extenderVencimiento.bind(null, o.id)} venceActual={o.vence_el ?? hoy} />
          </Tarjeta>
        </div>

        <Tarjeta titulo="Registrar pago" descripcion="Yape o transferencia, con el periodo que cubre.">
          <FormularioPago accion={registrarPagoSuscripcion.bind(null, o.id)} sugerido={{ fecha: hoy, desde, hasta: sumarDias(desde, 29) }} />
        </Tarjeta>

        <Tarjeta titulo="Pagos" sinRelleno>
          {pagos.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Todavía no hay pagos registrados.</p>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Monto</Th>
                  <Th>Medio</Th>
                  <Th>Periodo</Th>
                  <Th className="hidden sm:table-cell">Nota</Th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id}>
                    <Td className="tabular-nums">{fecha(p.fecha)}</Td>
                    <Td className="tabular-nums">{soles(p.monto)}</Td>
                    <Td>{NOMBRE_MEDIO[p.medio]}</Td>
                    <Td className="tabular-nums">
                      {fecha(p.periodo_desde)} – {fecha(p.periodo_hasta)}
                    </Td>
                    <Td className="hidden sm:table-cell">{p.nota ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>

        <Tarjeta titulo="Historial" descripcion="Altas, cambios de plan, vencimientos y pagos. No se puede editar ni borrar." sinRelleno>
          {eventos.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Sin movimientos.</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {eventos.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 px-5 py-3 text-sm sm:flex-row sm:gap-4">
                  <span className="w-28 shrink-0 text-slate-500 tabular-nums">{fechaLima(e.creado_en)}</span>
                  <div>
                    <p className="text-slate-900">{describirEvento(e)}</p>
                    {e.nota && <p className="text-xs text-slate-500">{e.nota}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Tarjeta>
      </div>
    </>
  );
}

const texto = (v: unknown) => (v == null ? "sin límite" : String(v));

function describirEvento(e: EventoSuscripcion): string {
  const d = e.despues ?? {};
  const a = e.antes ?? {};
  switch (e.tipo) {
    case "alta":
      return `Alta en plan ${NOMBRE_PLAN[d.plan as Plan] ?? d.plan}, vence el ${fecha(d.vence_el as string)}`;
    case "cambio_plan":
      return (
        `Plan ${NOMBRE_PLAN[a.plan as Plan] ?? a.plan} → ${NOMBRE_PLAN[d.plan as Plan] ?? d.plan} · ` +
        `usuarios ${texto(d.max_usuarios)}, sedes ${texto(d.max_sedes)}, WhatsApp ${texto(d.whatsapp_mensual)}/sede/mes`
      );
    case "vencimiento":
      return `Vencimiento ${fecha(a.vence_el as string)} → ${fecha(d.vence_el as string)}`;
    case "pago":
      return `Pago de ${soles(d.monto as number)} por ${NOMBRE_MEDIO[d.medio as "yape"] ?? d.medio} (${fecha(d.periodo_desde as string)} – ${fecha(d.periodo_hasta as string)})`;
  }
}
