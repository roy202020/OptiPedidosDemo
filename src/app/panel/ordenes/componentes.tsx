import { AlarmClock, Wallet, Zap } from "lucide-react";
import Link from "next/link";
import { Insignia, Tabla, Td, Th } from "@/components/ui";
import type { OrdenResumen } from "@/lib/datos/ordenes";
import { fecha, soles } from "@/lib/formato";
import { COMERCIAL, COMERCIAL_DE, SUBESTADO, TIPOS_TRABAJO, estaAtrasada, numeroOrden, type EstadoInterno } from "@/lib/ordenes/estados";

/** Estado comercial con el subestado de laboratorio como texto de ayuda. */
export function InsigniaEstado({ estado, detalle = false }: { estado: EstadoInterno; detalle?: boolean }) {
  const c = COMERCIAL[COMERCIAL_DE[estado]];
  const mostrarSub = detalle && COMERCIAL_DE[estado] === "en_laboratorio";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Insignia tono={c.tono}>{c.texto}</Insignia>
      {mostrarSub && <span className="text-xs text-slate-500">{SUBESTADO[estado]}</span>}
    </span>
  );
}

export function MarcasOrden({
  orden,
  hoy,
}: {
  orden: Pick<OrdenResumen, "estado" | "prioridad" | "fecha_entrega_prometida" | "saldo">;
  hoy: string;
}) {
  const atrasada = estaAtrasada(orden.estado, orden.fecha_entrega_prometida, hoy);
  // El saldo solo llega en el listado y el tablero; en una orden anulada no se cobra.
  const saldo = orden.estado === "anulada" ? 0 : Number(orden.saldo ?? 0);
  if (!atrasada && orden.prioridad !== "urgente" && saldo <= 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {atrasada && (
        <Insignia tono="rojo" icono={AlarmClock}>
          Atrasada
        </Insignia>
      )}
      {orden.prioridad === "urgente" && (
        <Insignia tono="ambar" icono={Zap}>
          Urgente
        </Insignia>
      )}
      {saldo > 0 && (
        <Insignia tono="ambar" icono={Wallet}>
          Saldo {soles(saldo)}
        </Insignia>
      )}
    </span>
  );
}

export function TablaOrdenes({
  ordenes,
  hoy,
  pie,
  sinLaboratorio,
  sinPaciente,
}: {
  ordenes: OrdenResumen[];
  hoy: string;
  pie?: React.ReactNode;
  sinLaboratorio?: boolean;
  sinPaciente?: boolean;
}) {
  return (
    <>
    <div className="space-y-3 sm:hidden">
      {ordenes.map(o => <Link key={o.id} href={"/panel/ordenes/"+o.id} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-tarjeta">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-marca-800">{numeroOrden(o.numero)}</strong><InsigniaEstado estado={o.estado}/></div>
        {!sinPaciente && <p className="mt-2 font-semibold text-slate-900">{o.paciente.apellidos}, {o.paciente.nombres}</p>}
        {!sinLaboratorio && <p className="mt-1 text-sm text-slate-500">{o.laboratorio?.nombre ?? "Sin laboratorio"}</p>}
        <p className="mt-2 text-sm text-slate-600">Entrega: {fecha(o.fecha_entrega_prometida)}</p>
        <div className="mt-2"><MarcasOrden orden={o} hoy={hoy}/></div>
        <span className="mt-3 block text-xs font-medium text-marca-700">Ver pedido →</span>
      </Link>)}
      {pie && <div className="py-3">{pie}</div>}
    </div>
    <div className="hidden sm:block"><Tabla pie={pie}>
      <thead>
        <tr>
          <Th>Orden</Th>
          {!sinPaciente && <Th>Paciente</Th>}
          {!sinLaboratorio && <Th className="hidden md:table-cell">Laboratorio</Th>}
          <Th>Estado</Th>
          <Th className="hidden sm:table-cell">Entrega prometida</Th>
          <Th className="hidden lg:table-cell">Creada</Th>
        </tr>
      </thead>
      <tbody>
        {ordenes.map((o) => (
          <tr key={o.id} className="hover:bg-slate-50">
            <Td>
              <Link href={`/panel/ordenes/${o.id}`} className="font-semibold text-marca-800 tabular-nums hover:underline">
                {numeroOrden(o.numero)}
              </Link>
              <p className="text-xs text-slate-500">
                {TIPOS_TRABAJO[o.tipo_trabajo]}
                {o.sede && ` · ${o.sede.nombre}`}
              </p>
            </Td>
            {!sinPaciente && (
              <Td>
                <p className="font-medium text-slate-900">
                  {o.paciente.apellidos}, {o.paciente.nombres}
                </p>
                {o.paciente.telefono && <p className="text-xs text-slate-500 tabular-nums">{o.paciente.telefono}</p>}
              </Td>
            )}
            {!sinLaboratorio && <Td className="hidden md:table-cell">{o.laboratorio?.nombre ?? "—"}</Td>}
            <Td>
              <div className="flex flex-col items-start gap-1">
                <InsigniaEstado estado={o.estado} />
                <MarcasOrden orden={o} hoy={hoy} />
              </div>
            </Td>
            <Td className="hidden tabular-nums sm:table-cell">{fecha(o.fecha_entrega_prometida)}</Td>
            <Td className="hidden tabular-nums lg:table-cell">{fecha(o.creado_en)}</Td>
          </tr>
        ))}
      </tbody>
    </Tabla></div>
    </>
  );
}

/** Etapas comerciales: no cambia las transiciones ni el historial del pedido. */
export function ProgresoPedido({estado}: {estado: EstadoInterno}) {
  if (estado === "anulada") return null;
  const etapas = ["venta_iniciada", "en_laboratorio", "listo_entrega", "entregado"] as const;
  const actual = etapas.indexOf(COMERCIAL_DE[estado] as typeof etapas[number]);
  const ayuda = ["Completa los datos y envía el trabajo al laboratorio.", "Revisa el avance y la fecha prometida con el laboratorio.", "Avisa al paciente, revisa el saldo y registra la entrega.", "El paciente ya recibió su pedido. Puedes consultar sus comprobantes."];
  return <section aria-label="Progreso del pedido" className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">{etapas.map((etapa,i)=><li key={etapa} aria-current={i===actual?"step":undefined} className={"flex items-center gap-2 rounded-xl p-2 text-xs sm:text-sm " + (i===actual?"bg-marca-50 font-semibold text-marca-800":i<actual?"text-emerald-700":"text-slate-500")}><span aria-hidden className={"flex size-7 shrink-0 items-center justify-center rounded-full border " + (i<=actual?"border-current":"border-slate-200")}>{i<actual?"✓":i+1}</span>{COMERCIAL[etapa].texto}</li>)}</ol><p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">{ayuda[actual]}</p></section>;
}
