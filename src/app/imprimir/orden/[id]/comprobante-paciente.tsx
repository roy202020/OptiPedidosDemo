import type { OrdenDetalle, OrdenOjo } from "@/lib/datos/ordenes";
import { fecha, fechaLima, soles } from "@/lib/formato";
import { codigoLegible } from "@/lib/ordenes/consulta-publica";
import { COMERCIAL, COMERCIAL_DE, DISENOS, ORIGENES_MONTURA, TIPOS_TRABAJO, TRATAMIENTOS, numeroOrden } from "@/lib/ordenes/estados";
import { resumenPagos } from "@/lib/ordenes/pagos";
import { Bloque, Filas, Linea, Pie, fechaHora } from "./partes";

type Props = {
  orden: OrdenDetalle;
  optica: { nombre: string; ruc: string | null; telefono: string | null; direccion: string | null };
  /** Enlace de la consulta pública y su QR (SVG generado en el servidor); null si no aplica. */
  consulta: { url: string; qr: string } | null;
};

/** Lente en palabras sencillas para el paciente: sin graduación, índice ni medidas. */
function lenteSencillo(j: OrdenOjo): string {
  return [
    j.diseno ? (DISENOS[j.diseno as keyof typeof DISENOS] ?? j.diseno) : null,
    j.material,
    ...j.tratamientos.map((t) => TRATAMIENTOS[t as keyof typeof TRATAMIENTOS] ?? t),
    j.tinte ? `tinte ${j.tinte}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Comprobante del pedido para el paciente: sin graduaciones, medidas de fabricación,
 * observaciones internas ni datos del laboratorio.
 */
export function ComprobantePaciente({ orden: o, optica, consulta }: Props) {
  const cobro = resumenPagos(o, o.pagos);
  const conImportes = cobro.neto > 0 || cobro.pagado > 0;
  const direccion = o.sede.direccion ?? optica.direccion;
  const telefono = o.sede.telefono ?? optica.telefono;
  const lentes = o.ojos.map((j) => ({ ojo: j.ojo, texto: lenteSencillo(j) })).filter((l) => l.texto);
  const mismoLente = lentes.length === 2 && lentes[0].texto === lentes[1].texto;
  const entregada = o.historial.findLast((h) => h.hasta === "entregada");

  return (
    <>
      <Bloque>
        <header className="text-center">
          <p className="text-[14px] font-bold uppercase">{optica.nombre}</p>
          {optica.ruc && <p>RUC {optica.ruc}</p>}
          <p>Sede: {o.sede.nombre}</p>
          {direccion && <p>{direccion}</p>}
          {telefono && <p>Tel. {telefono}</p>}
        </header>
      </Bloque>
      <Linea />

      <Bloque>
        <div className="text-center">
          <p className="font-bold tracking-wide">COMPROBANTE DE PEDIDO</p>
          <p className="text-[20px] leading-tight font-bold">Orden {numeroOrden(o.numero)}</p>
          {o.estado === "anulada" && <p className="mt-0.5 border-2 border-black py-0.5 font-bold">*** ORDEN ANULADA ***</p>}
        </div>
      </Bloque>
      <Linea />

      <Bloque>
        <Filas
          filas={[
            ["Fecha", fechaHora(o.creado_en)],
            ["Entrega", o.fecha_entrega_prometida ? `${fecha(o.fecha_entrega_prometida)} (estimada)` : "Por confirmar", true],
            ["Paciente", `${o.paciente.nombres} ${o.paciente.apellidos}`, true],
          ]}
        />
      </Bloque>
      <Linea />

      <Bloque titulo="Su pedido">
        <p>{TIPOS_TRABAJO[o.tipo_trabajo]}</p>
        {mismoLente ? (
          <p>Lentes: {lentes[0].texto}</p>
        ) : (
          lentes.map((l) => (
            <p key={l.ojo}>
              {l.ojo === "OD" ? "Ojo derecho" : "Ojo izquierdo"}: {l.texto}
            </p>
          ))
        )}
        {(o.montura_origen || o.montura_descripcion) && (
          <p>Montura: {[o.montura_origen ? ORIGENES_MONTURA[o.montura_origen].toLowerCase() : null, o.montura_descripcion].filter(Boolean).join(" · ")}</p>
        )}
      </Bloque>

      {conImportes && (
        <>
          <Linea />
          <Bloque>
            <dl className="grid grid-cols-[1fr_auto] gap-x-2 tabular-nums">
              {Number(o.descuento) > 0 && (
                <>
                  <dt>Precio</dt>
                  <dd className="text-right">{soles(o.precio)}</dd>
                  <dt>Descuento</dt>
                  <dd className="text-right">-{soles(o.descuento)}</dd>
                </>
              )}
              <dt className="font-bold">TOTAL</dt>
              <dd className="text-right font-bold">{soles(cobro.neto)}</dd>
              {cobro.pagado > 0 && (
                <>
                  <dt>A cuenta</dt>
                  <dd className="text-right">{soles(cobro.pagado)}</dd>
                </>
              )}
              <dt className="text-[13px] font-bold">{cobro.saldo > 0 ? "SALDO" : "Saldo"}</dt>
              <dd className="text-right text-[13px] font-bold">{cobro.saldo > 0 ? soles(cobro.saldo) : "CANCELADO"}</dd>
            </dl>
            <p className="mt-0.5 text-[10px]">Importes en soles, IGV incluido.</p>
          </Bloque>
        </>
      )}
      <Linea />

      <Bloque>
        <p>
          Estado: <span className="font-bold">{COMERCIAL[COMERCIAL_DE[o.estado]].texto}</span>
        </p>
        {o.estado === "entregada" ? (
          entregada && <p>Entregado el {fechaLima(entregada.creado_en)}.</p>
        ) : o.estado === "anulada" ? null : (
          <>
            <p>
              {o.estado === "recibida_optica"
                ? "Sus lentes están listos. Recójalos presentando este comprobante."
                : "Recoja sus lentes desde la fecha de entrega presentando este comprobante."}
            </p>
            <p>Lugar de recojo: {o.sede.nombre}</p>
            {cobro.saldo > 0 && <p>El saldo se paga al recoger.</p>}
          </>
        )}
      </Bloque>

      {consulta && (
        <>
          <Linea />
          <Bloque>
            <div className="text-center">
              <p className="font-bold">CONSULTA EL ESTADO DE TU PEDIDO</p>
              {/* SVG generado en el servidor por la librería qrcode a partir de nuestra propia URL. */}
              <div className="mx-auto my-1.5 size-[30mm] [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: consulta.qr }} />
              <p className="text-[10px] break-all">{consulta.url}</p>
              <p className="mt-0.5">
                Código: <span className="font-bold tracking-wider">{codigoLegible(o.codigo_consulta)}</span>
              </p>
            </div>
          </Bloque>
        </>
      )}

      <Pie nota="Documento interno, no es comprobante de pago SUNAT." />
    </>
  );
}
