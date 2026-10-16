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
    <Tabla pie={pie}>
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
    </Tabla>
  );
}
