import type { reservasDeOrden } from "@/lib/datos/inventario";
import type { OrdenDetalle, OrdenOjo } from "@/lib/datos/ordenes";
import { fecha, graduacion, valor } from "@/lib/formato";
import { textoMedida } from "@/lib/inventario/medidas";
import { DISENOS, ORIGENES_MONTURA, SUBESTADO, TIPOS_TRABAJO, TRATAMIENTOS, numeroOrden } from "@/lib/ordenes/estados";
import { descripcionLente } from "@/lib/ordenes/mensaje-laboratorio";
import { Bloque, Filas, Linea, Pie, fechaHora } from "./partes";

const NOMBRE_OJO = { OD: "Ojo derecho", OI: "Ojo izquierdo" } as const;
/** Campo que la orden no indica (distinto de "—", que es "no aplica"). */
const SIN_DATO = "Sin indicar";

type Props = {
  orden: OrdenDetalle;
  reservas: Awaited<ReturnType<typeof reservasDeOrden>>;
  optica: { nombre: string; telefono: string | null };
};

/**
 * Ticket para fabricar y controlar el trabajo en el laboratorio. Sin importes ni datos de
 * contacto del paciente. Los valores se imprimen tal como están en la orden.
 */
export function TicketLaboratorio({ orden: o, reservas, optica }: Props) {
  const conMedidas = o.ojos.some((j) => j.dnp != null || j.altura != null || j.prisma != null);
  const conPrisma = o.ojos.some((j) => j.prisma != null);
  // Si los dos ojos llevan el mismo lente, se describe una sola vez.
  const mismoLente = o.ojos.length === 2 && descripcionLente(o.ojos[0]) === descripcionLente(o.ojos[1]);
  const gruposLente = mismoLente ? [{ titulo: "OD y OI (iguales)", ojo: o.ojos[0] }] : o.ojos.map((j) => ({ titulo: `${j.ojo} · ${NOMBRE_OJO[j.ojo]}`, ojo: j }));
  const notasOjo = o.ojos.filter((j) => j.observaciones?.trim());
  const telefonoSede = o.sede.telefono ?? optica.telefono;

  return (
    <>
      <Bloque>
        <div className="text-center">
          <p className="text-[13px] font-bold uppercase">{o.laboratorio.nombre}</p>
          <p className="mt-1 font-bold tracking-wide">ORDEN DE TRABAJO</p>
          <p className="text-[24px] leading-tight font-bold">{numeroOrden(o.numero)}</p>
          {o.prioridad === "urgente" && <p className="mt-0.5 border-2 border-black py-0.5 font-bold">*** URGENTE ***</p>}
          {o.estado === "anulada" && <p className="mt-0.5 border-2 border-black py-0.5 font-bold">*** ORDEN ANULADA ***</p>}
        </div>
      </Bloque>
      <Linea />

      <Bloque>
        <Filas
          filas={[
            ["Óptica", optica.nombre, true],
            ["Sede", `${o.sede.nombre}${telefonoSede ? ` · Tel. ${telefonoSede}` : ""}`],
            ["Registro", fechaHora(o.creado_en)],
            ["Entrega", o.fecha_entrega_prometida ? fecha(o.fecha_entrega_prometida) : "Por confirmar", true],
            ["Paciente", `${o.paciente.apellidos}, ${o.paciente.nombres}`, true],
            ["Trabajo", TIPOS_TRABAJO[o.tipo_trabajo]],
            ["Estado", SUBESTADO[o.estado]],
          ]}
        />
      </Bloque>
      <Linea />

      <Bloque titulo="Graduación">
        <table className="w-full table-fixed border-collapse text-center tabular-nums">
          <colgroup>
            <col className="w-[9mm]" />
            <col />
            <col />
            <col className="w-[11mm]" />
            <col />
          </colgroup>
          <thead className="text-[10px]">
            <tr className="border-b border-black">
              <th className="text-left">OJO</th>
              <th>ESFERA</th>
              <th>CILINDRO</th>
              <th>EJE</th>
              <th>ADD</th>
            </tr>
          </thead>
          <tbody className="text-[12px]">
            {o.ojos.map((j) => (
              <tr key={j.ojo} className="border-b border-black">
                <th className="py-0.5 text-left text-[13px]">{j.ojo}</th>
                <td>{graduacion(j.esfera)}</td>
                <td>{j.cilindro ? graduacion(j.cilindro) : "—"}</td>
                <td>{j.cilindro ? `${valor(j.eje)}°` : "—"}</td>
                <td>{j.adicion ? graduacion(j.adicion) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-0.5 text-[10px]">OD: ojo derecho · OI: ojo izquierdo</p>
        <p className="text-[10px]">—: no aplica</p>
      </Bloque>

      {conMedidas && (
        <Bloque>
          <table className="mt-1.5 w-full table-fixed border-collapse text-center tabular-nums">
            <colgroup>
              <col className="w-[9mm]" />
              <col />
              <col />
              {conPrisma && <col className="w-[22mm]" />}
            </colgroup>
            <thead className="text-[10px]">
              <tr className="border-b border-black">
                <th className="text-left">OJO</th>
                <th>DNP (mm)</th>
                <th>ALTURA (mm)</th>
                {conPrisma && <th>PRISMA</th>}
              </tr>
            </thead>
            <tbody className="text-[12px]">
              {o.ojos.map((j) => (
                <tr key={j.ojo} className="border-b border-black">
                  <th className="py-0.5 text-left text-[13px]">{j.ojo}</th>
                  <td>{valor(j.dnp)}</td>
                  <td>{valor(j.altura)}</td>
                  {conPrisma && <td>{j.prisma != null ? `${j.prisma} Δ ${j.base_prisma ?? ""}`.trim() : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Bloque>
      )}
      <Linea />

      <div className="flex flex-col gap-1.5">
        {gruposLente.map((g) => (
          <Bloque key={g.titulo} titulo={`Lente ${g.titulo}`}>
            <DatosLente ojo={g.ojo} />
          </Bloque>
        ))}
      </div>

      {reservas.length > 0 && (
        <>
          <Linea />
          <Bloque titulo="Lunas de stock">
            {reservas.map((r) => (
              <p key={r.id}>
                {r.ojo}: {r.variante.producto} {textoMedida(r.variante)}
              </p>
            ))}
          </Bloque>
        </>
      )}
      <Linea />

      <Bloque titulo="Montura">
        {o.montura_origen || o.montura_descripcion ? (
          <Filas
            filas={[
              ["Origen", o.montura_origen ? ORIGENES_MONTURA[o.montura_origen] : SIN_DATO],
              ["Detalle", o.montura_descripcion ?? SIN_DATO],
            ]}
          />
        ) : (
          <p>Sin montura registrada.</p>
        )}
      </Bloque>

      {(notasOjo.length > 0 || o.observaciones.length > 0) && (
        <>
          <Linea />
          <Bloque titulo="Observaciones (fabricación / biselado)">
            {notasOjo.map((j) => (
              <p key={j.ojo} className="whitespace-pre-line">
                <span className="font-bold">{j.ojo}:</span> {j.observaciones}
              </p>
            ))}
            {[...o.observaciones].reverse().map((ob) => (
              <p key={ob.id} className="whitespace-pre-line">
                - {ob.texto}
              </p>
            ))}
          </Bloque>
        </>
      )}
      <Linea />

      <Bloque titulo="Control de calidad">
        <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
          {[...o.ojos.map(j => `Graduación ${j.ojo}`), "Centrado / DNP", "Altura", "Tratamientos", "Biselado / montaje"].map((t) => (
            <li key={t} className="flex items-center gap-1">
              <span aria-hidden className="inline-block size-[3mm] shrink-0 border border-black" />
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-2.5">Revisó: ______________________</p>
        <p className="mt-2.5">Fecha: ____/____/______</p>
      </Bloque>

      <Pie />
    </>
  );
}

/** Especificación del lente de un ojo; marca lo que la orden no indica. */
function DatosLente({ ojo: j }: { ojo: OrdenOjo }) {
  return (
    <Filas
      filas={[
        ["Tipo", j.diseno ? (DISENOS[j.diseno as keyof typeof DISENOS] ?? j.diseno) : SIN_DATO],
        ["Material", j.material ?? SIN_DATO],
        ["Índice", j.indice ? Number(j.indice).toFixed(2) : SIN_DATO],
        ["Diámetro", j.diametro_mm ? `${j.diametro_mm} mm` : SIN_DATO],
        ["Tratam.", j.tratamientos.length ? j.tratamientos.map((t) => TRATAMIENTOS[t as keyof typeof TRATAMIENTOS] ?? t).join(", ") : "Ninguno"],
        ["Tinte", j.tinte],
      ]}
    />
  );
}
