import { History, PackageCheck, PackageSearch, Ruler } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, Encabezado, EstadoVacio, Indicador, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { obtenerVariante } from "@/lib/datos/inventario";
import { soles } from "@/lib/formato";
import { enPares, textoMedida, TIPOS_MOVIMIENTO } from "@/lib/inventario/medidas";
import { tienePermiso } from "@/lib/permisos";
import { exigirOptica } from "@/lib/sesion";
import { actualizarVariante, registrarMovimiento } from "../../acciones";
import { FormularioMovimiento, FormularioVariante } from "./formularios";

export const metadata: Metadata = { title: "Medida de inventario" };

type Props = PageProps<"/panel/inventario/variantes/[id]">;

export default function PaginaVariante({ params }: Props) {
  return (
    <Suspense fallback={<Cargando alto="h-96" />}>
      <Detalle params={params} />
    </Suspense>
  );
}

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Lima" }).format(new Date(iso));

const ESTADO = {
  ok: { tono: "verde", texto: "Disponible" },
  bajo: { tono: "ambar", texto: "Bajo mínimo" },
  agotado: { tono: "rojo", texto: "Agotada" },
} as const;

async function Detalle({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const [{ variante: v, movimientos, reservas, usuario }, optica] = await Promise.all([obtenerVariante(id), exigirOptica()]);
  const jefe = tienePermiso(optica.rol, "administrarOptica");

  return (
    <>
      <Encabezado
        titulo={<span className="tabular-nums">{textoMedida(v)}</span>}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/panel/inventario/productos/${v.producto_id}`} className="text-marca-700 hover:underline">
              {v.producto}
            </Link>
            <Insignia tono={ESTADO[v.estado_stock].tono}>{ESTADO[v.estado_stock].texto}</Insignia>
          </span>
        }
        volver={{ href: `/panel/inventario/productos/${v.producto_id}`, texto: v.producto }}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Indicador titulo="Disponible" valor={v.disponible} detalle={enPares(v.disponible)} icono={PackageCheck} tono={v.estado_stock === "ok" ? "verde" : v.estado_stock === "bajo" ? "ambar" : "rojo"} />
        <Indicador titulo="En stock" valor={v.stock} detalle={enPares(v.stock)} icono={Ruler} />
        <Indicador titulo="Reservadas para órdenes" valor={v.reservado} icono={PackageSearch} tono="violeta" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          {reservas.length > 0 && (
            <Tarjeta titulo="Reservas activas">
              <ul className="space-y-1 text-sm">
                {reservas.map((r) => (
                  <li key={r.id}>
                    <Link href={`/panel/ordenes/${r.orden.id}`} className="text-marca-700 hover:underline">
                      Orden #{String(r.orden.numero).padStart(4, "0")}
                    </Link>{" "}
                    · {r.ojo} · {r.cantidad} luna
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}

          <section aria-labelledby="historial">
            <h2 id="historial" className="mb-3 text-base font-semibold text-slate-900">
              Historial de movimientos
            </h2>
            {movimientos.length === 0 ? (
              <EstadoVacio icono={History} titulo="Sin movimientos" />
            ) : (
              <Tabla>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Tipo</Th>
                    <Th className="text-right">Cantidad</Th>
                    <Th className="text-right">Stock</Th>
                    <Th className="hidden md:table-cell">Detalle</Th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id}>
                      <Td className="whitespace-nowrap tabular-nums">
                        {fechaHora(m.creado_en)}
                        <p className="text-xs text-slate-500">{usuario(m.creado_por)}</p>
                      </Td>
                      <Td>
                        {TIPOS_MOVIMIENTO[m.tipo]}
                        {m.autoriza_negativo && m.tipo !== "consumo" && m.tipo !== "ajuste" && (
                          <p className="text-xs text-amber-700">Negativo autorizado</p>
                        )}
                      </Td>
                      <Td className={`text-right font-semibold tabular-nums ${m.cantidad > 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {m.stock_anterior} → <span className="font-semibold">{m.stock_resultante}</span>
                      </Td>
                      <Td className="hidden text-slate-600 md:table-cell">
                        {m.orden && m.orden_id ? (
                          <Link href={`/panel/ordenes/${m.orden_id}`} className="text-marca-700 hover:underline">
                            Orden #{String(m.orden.numero).padStart(4, "0")}
                          </Link>
                        ) : null}
                        {m.operacion?.proveedor && <span>{m.operacion.proveedor}</span>}
                        {m.operacion?.documento && <span> · {m.operacion.documento}</span>}
                        {m.lote && <span> · lote {m.lote}</span>}
                        {m.costo_unitario != null && <span> · {soles(m.costo_unitario)} c/u</span>}
                        {m.motivo && <p className="text-xs">{m.motivo}</p>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <Tarjeta titulo="Registrar movimiento">
            <FormularioMovimiento accion={registrarMovimiento.bind(null, id)} jefe={jefe} />
          </Tarjeta>
          <Tarjeta titulo="Mínimo y ubicación">
            <FormularioVariante
              accion={actualizarVariante.bind(null, id)}
              inicial={{ stock_minimo: String(v.stock_minimo), ubicacion: v.ubicacion ?? "" }}
            />
          </Tarjeta>
        </aside>
      </div>
    </>
  );
}
