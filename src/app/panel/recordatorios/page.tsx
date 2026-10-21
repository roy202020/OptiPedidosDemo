import { BellRing, CalendarClock, MessageCircle, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BarraProgreso, Cargando, Encabezado, EstadoVacio, Indicador, Insignia, Pestanas, SoloProfesional, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { configuracionRecordatorios, pacientesPorRecordar } from "@/lib/datos/recordatorios";
import { fecha, mes } from "@/lib/formato";
import { tienePermiso } from "@/lib/permisos";
import { enlaceRecordatorio, estadoRecordatorio } from "@/lib/recordatorios";
import { obtenerSedeActual } from "@/lib/sesion";
import { BotonWhatsAppRecordatorio, FormularioConfiguracion } from "./componentes";

export const metadata: Metadata = { title: "Recordatorios de control" };

type Props = PageProps<"/panel/recordatorios">;

export default function PaginaRecordatorios({ searchParams }: Props) {
  return (
    <>
      <Encabezado
        titulo="Pacientes por recordar este mes"
        descripcion="Control visual según su última evaluación. Solo pacientes que aceptaron recordatorios pueden recibirlos."
      />
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Contenido({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const { optica, sedes, actual } = await obtenerSedeActual();
  // Filtro de la página; sin él, la sede elegida en el selector general.
  const sedeElegida = sedes.find((s) => s.id === sp.sede)?.id ?? (sp.sede === "todas" ? null : (actual?.id ?? null));
  const sedesUso = sedes.filter((s) => s.activa && (sedeElegida === null || s.id === sedeElegida));
  const [filas, config] = await Promise.all([pacientesPorRecordar(sedeElegida), configuracionRecordatorios(sedesUso)]);

  const conEstado = filas.map((f) => ({ f, e: estadoRecordatorio(f) }));
  const porEnviar = conEstado.filter((x) => x.e.puedeEnviar).length;
  const enviados = filas.filter((f) => f.envio_estado === "enviado" || f.envio_estado === "entregado").length;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador titulo="Por recordar" valor={porEnviar} detalle="Con consentimiento y celular" icono={BellRing} tono="ambar" />
        <Indicador titulo="Ya recordados" valor={enviados} detalle={`En ${mes(`${hoy.slice(0, 7)}-01`)}`} icono={Send} tono="verde" />
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-tarjeta">
          <p className="text-sm font-medium text-slate-500">WhatsApp automáticos este mes</p>
          {!config.incluye_whatsapp_api ? (
            <div className="mt-2 flex flex-col gap-2">
              <SoloProfesional compacto />
              <p className="text-xs text-slate-500">En el plan Básico los avisos y recordatorios se envían a mano con el botón de WhatsApp.</p>
            </div>
          ) : (
            <>
              <ul className="mt-2 flex flex-col gap-3">
                {config.uso.map((u) => (
                  <li key={u.sede_id}>
                    <p className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-slate-700">{u.sede}</span>
                      <span className="tabular-nums text-slate-900">
                        {u.usados} <span className="text-slate-500">de {config.whatsapp_mensual}</span>
                      </span>
                    </p>
                    <BarraProgreso
                      valor={config.whatsapp_mensual ? (u.usados / config.whatsapp_mensual) * 100 : 100}
                      tono={u.usados >= config.whatsapp_mensual ? "ambar" : "azul"}
                      etiqueta={`Uso del tope mensual de WhatsApp de ${u.sede}`}
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">Tope por sede: avisos de lentes listos y recordatorios automáticos. Los manuales no cuentan.</p>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label="Lista de pacientes">
          {sedes.length > 1 && (
            <div className="mb-4">
              <Pestanas
                etiqueta="Filtrar por sede"
                items={[
                  { href: "/panel/recordatorios?sede=todas", texto: "Todas mis sedes", activo: sedeElegida === null },
                  ...sedes.map((s) => ({ href: `/panel/recordatorios?sede=${s.id}`, texto: s.nombre, activo: sedeElegida === s.id })),
                ]}
              />
            </div>
          )}
          {filas.length === 0 ? (
            <EstadoVacio
              icono={CalendarClock}
              titulo="Nadie por recordar este mes"
              descripcion={`Aparecen aquí los pacientes cuya última evaluación cumple ${config.recordatorio_meses} meses este mes.`}
            />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Paciente</Th>
                  <Th className="hidden sm:table-cell">Última evaluación</Th>
                  <Th>Control</Th>
                  {sedes.length > 1 && <Th className="hidden md:table-cell">Sede</Th>}
                  <Th>Estado</Th>
                  <Th>
                    <span className="sr-only">Acción</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {conEstado.map(({ f, e }) => (
                  <tr key={f.paciente_id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/panel/pacientes/${f.paciente_id}`} className="font-medium text-marca-800 hover:underline">
                        {f.apellidos}, {f.nombres}
                      </Link>
                      <p className="text-xs text-slate-500 tabular-nums">{f.telefono ?? "Sin teléfono"}</p>
                    </Td>
                    <Td className="hidden tabular-nums sm:table-cell">{fecha(f.fecha_examen)}</Td>
                    <Td className="tabular-nums">
                      {fecha(f.vence_en)}
                      {f.vence_en < hoy && !f.envio_estado && <p className="text-xs text-amber-700">Vencido</p>}
                    </Td>
                    {sedes.length > 1 && <Td className="hidden md:table-cell">{f.sede}</Td>}
                    <Td>
                      <Insignia tono={e.tono}>{e.texto}</Insignia>
                      {e.motivo && <p className="mt-0.5 text-xs text-slate-500">{e.motivo}</p>}
                    </Td>
                    <Td className="text-right">
                      {e.puedeEnviar && f.celular && (
                        <BotonWhatsAppRecordatorio
                          pacienteId={f.paciente_id}
                          url={enlaceRecordatorio(f, f.sede === "Sede principal" ? optica.nombre : `${optica.nombre} (${f.sede})`)}
                        />
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
            <MessageCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            El botón WhatsApp abre el chat con el mensaje escrito desde tu teléfono y marca al paciente como recordado en este ciclo.
          </p>
        </section>

        <Tarjeta titulo="Configuración" descripcion={`Plan ${config.plan === "profesional" ? "Profesional" : "Básico"}`}>
          {tienePermiso(optica.rol, "configurarRecordatorios") ? (
            <FormularioConfiguracion
              meses={config.recordatorio_meses}
              automaticos={config.recordatorios_automaticos}
              puedeActivar={tienePermiso(optica.rol, "activarRecordatoriosAutomaticos")}
              esProfesional={config.incluye_recordatorios}
            />
          ) : (
            <p className="text-sm text-slate-600">
              Recordatorio a los {config.recordatorio_meses} meses · envío automático {config.recordatorios_automaticos ? "activo" : "inactivo"}.
            </p>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
