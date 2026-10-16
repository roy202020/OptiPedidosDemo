import { AlarmClock, Boxes, FileSpreadsheet, History, PackagePlus, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alerta } from "@/components/formulario";
import {
  Cargando,
  claseBoton,
  claseControl,
  Encabezado,
  EnlaceBoton,
  EstadoVacio,
  Insignia,
  Paginacion,
  Pestanas,
  Tabla,
  Td,
  Th,
} from "@/components/ui";
import {
  buscarExistencias,
  EXISTENCIAS_POR_PAGINA,
  listarProductos,
  movimientosRecientes,
  type Existencia,
  type FiltrosExistencias,
} from "@/lib/datos/inventario";
import { enPares, textoMedida, TIPOS_LUNA, TIPOS_MOVIMIENTO, VISIONES } from "@/lib/inventario/medidas";
import { leerNumero } from "@/lib/validacion/receta";

export const metadata: Metadata = { title: "Inventario de lunas" };

type Props = PageProps<"/panel/inventario">;
type Vista = "existencias" | "productos" | "reponer" | "movimientos";

export default function PaginaInventario({ searchParams }: Props) {
  return (
    <>
      <Encabezado titulo="Inventario de lunas" descripcion="Existencias por medida exacta, en lunas sueltas (2 lunas = 1 par).">
        <EnlaceBoton href="/panel/inventario/productos/nuevo" icono={Plus}>
          Nuevo producto
        </EnlaceBoton>
        <EnlaceBoton href="/panel/inventario/compras/nueva" variante="primario" icono={PackagePlus}>
          Registrar compra
        </EnlaceBoton>
      </Encabezado>
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 60) : undefined);
const medida = (v?: string) => {
  const n = leerNumero(v ?? "");
  return n == null || Number.isNaN(n) ? null : n;
};

async function Contenido({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const vista: Vista = (["productos", "reponer", "movimientos"] as const).find((v) => v === sp.vista) ?? "existencias";
  const pagina = Math.max(1, Number.parseInt(String(sp.pagina ?? "1"), 10) || 1);
  const pestanas = (
    <div className="mb-4">
      <Pestanas
        etiqueta="Secciones del inventario"
        items={[
          { href: "/panel/inventario", texto: "Existencias", activo: vista === "existencias" },
          { href: "/panel/inventario?vista=productos", texto: "Productos", activo: vista === "productos" },
          { href: "/panel/inventario?vista=reponer", texto: "Reposición", activo: vista === "reponer" },
          { href: "/panel/inventario?vista=movimientos", texto: "Movimientos", activo: vista === "movimientos" },
        ]}
      />
    </div>
  );

  if (vista === "productos") return <>{pestanas}<Productos /></>;
  if (vista === "movimientos") return <>{pestanas}<Movimientos pagina={pagina} compra={texto(sp.compra)} /></>;

  const filtros: FiltrosExistencias = {
    producto: texto(sp.producto),
    esfera: medida(texto(sp.esfera)),
    cilindro: medida(texto(sp.cilindro)),
    indice: medida(texto(sp.indice)),
    tratamiento: texto(sp.tratamiento),
    estado: vista === "reponer" ? "reponer" : (["disponible", "bajo", "agotado"] as const).find((e) => e === sp.estado),
    pagina,
  };
  return (
    <>
      {pestanas}
      <Existencias filtros={filtros} vista={vista} sp={sp} />
    </>
  );
}

async function Existencias({ filtros, vista, sp }: { filtros: FiltrosExistencias; vista: Vista; sp: Record<string, string | string[] | undefined> }) {
  const [productos, { existencias, total }] = await Promise.all([listarProductos(), buscarExistencias(filtros)]);
  const actuales: Record<string, string | undefined> = {
    vista: vista === "reponer" ? "reponer" : undefined,
    producto: texto(sp.producto),
    esfera: texto(sp.esfera),
    cilindro: texto(sp.cilindro),
    indice: texto(sp.indice),
    tratamiento: texto(sp.tratamiento),
    estado: vista === "reponer" ? undefined : texto(sp.estado),
  };
  const qs = (extra: Record<string, string | undefined>) =>
    new URLSearchParams(Object.entries({ ...actuales, ...extra }).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  const indices = [...new Set(productos.map((p) => p.indice).filter((i): i is number => i != null))].sort();

  if (productos.length === 0) {
    return (
      <EstadoVacio icono={Boxes} titulo="Aún no hay productos" descripcion="Crea un producto (por ejemplo, Resina blanca) y registra su primera compra.">
        <EnlaceBoton href="/panel/inventario/productos/nuevo" variante="primario" icono={Plus}>
          Nuevo producto
        </EnlaceBoton>
      </EstadoVacio>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {vista === "reponer" && (
        <Alerta tipo="info">Medidas con mínimo configurado que están en o bajo el mínimo, o agotadas. Ordénalas a tu proveedor.</Alerta>
      )}
      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-tarjeta sm:grid-cols-2 lg:grid-cols-7">
        {vista === "reponer" && <input type="hidden" name="vista" value="reponer" />}
        <select name="producto" aria-label="Producto" defaultValue={actuales.producto ?? ""} className={`${claseControl} h-10 lg:col-span-2`}>
          <option value="">Todos los productos</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <input name="esfera" aria-label="Esfera" placeholder="Esfera (−2.00)" inputMode="decimal" defaultValue={actuales.esfera} className={`${claseControl} h-10`} />
        <input name="cilindro" aria-label="Cilindro" placeholder="Cilindro (−0.50)" inputMode="decimal" defaultValue={actuales.cilindro} className={`${claseControl} h-10`} />
        <select name="indice" aria-label="Índice" defaultValue={actuales.indice ?? ""} className={`${claseControl} h-10`}>
          <option value="">Todo índice</option>
          {indices.map((i) => (
            <option key={i} value={i.toFixed(2)}>
              {i.toFixed(2)}
            </option>
          ))}
        </select>
        <input name="tratamiento" aria-label="Tratamiento" placeholder="Tratamiento o color" defaultValue={actuales.tratamiento} className={`${claseControl} h-10`} />
        {vista !== "reponer" && (
          <select name="estado" aria-label="Stock" defaultValue={actuales.estado ?? ""} className={`${claseControl} h-10`}>
            <option value="">Todo el stock</option>
            <option value="disponible">Con disponible</option>
            <option value="bajo">En o bajo el mínimo</option>
            <option value="agotado">Agotadas</option>
          </select>
        )}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-7 lg:justify-end">
          <Link href={vista === "reponer" ? "/panel/inventario?vista=reponer" : "/panel/inventario"} className={claseBoton("fantasma")}>
            Limpiar
          </Link>
          <a href={`/panel/inventario/exportar?${qs({})}`} className={claseBoton("secundario")}>
            <FileSpreadsheet aria-hidden className="size-4" />
            Exportar a Excel
          </a>
          <button className={claseBoton("primario")}>
            <Search aria-hidden className="size-4" />
            Buscar
          </button>
        </div>
      </form>

      {existencias.length === 0 ? (
        <EstadoVacio
          icono={vista === "reponer" ? AlarmClock : Search}
          titulo={vista === "reponer" ? "Nada por reponer" : "Sin resultados"}
          descripcion={
            vista === "reponer"
              ? "Ninguna medida con mínimo configurado está en o bajo su mínimo."
              : "No hay medidas con esos filtros. Si buscas una medida exacta, revisa que el cilindro esté en negativo."
          }
        />
      ) : (
        <TablaExistencias
          existencias={existencias}
          pie={<Paginacion pagina={filtros.pagina ?? 1} total={total} porPagina={EXISTENCIAS_POR_PAGINA} href={(p) => `/panel/inventario?${qs({ pagina: p > 1 ? String(p) : undefined })}`} />}
        />
      )}
    </div>
  );
}

const ESTADO = {
  ok: { tono: "verde", texto: "Disponible" },
  bajo: { tono: "ambar", texto: "Bajo mínimo" },
  agotado: { tono: "rojo", texto: "Agotada" },
} as const;

function TablaExistencias({ existencias, pie }: { existencias: Existencia[]; pie: React.ReactNode }) {
  return (
    <Tabla pie={pie}>
      <thead>
        <tr>
          <Th>Producto</Th>
          <Th>Medida</Th>
          <Th className="text-right">Disponible</Th>
          <Th className="hidden text-right sm:table-cell">Stock</Th>
          <Th className="hidden text-right md:table-cell">Reservadas</Th>
          <Th className="hidden text-right md:table-cell">Mínimo</Th>
          <Th>Estado</Th>
        </tr>
      </thead>
      <tbody>
        {existencias.map((e) => (
          <tr key={e.id} className="hover:bg-slate-50">
            <Td>
              <p className="font-medium text-slate-900">{e.producto}</p>
              <p className="text-xs text-slate-500">{[e.tratamiento, e.color_tratamiento, e.indice?.toFixed(2)].filter(Boolean).join(" · ")}</p>
            </Td>
            <Td>
              <Link href={`/panel/inventario/variantes/${e.id}`} className="font-semibold text-marca-800 tabular-nums hover:underline">
                {textoMedida(e)}
              </Link>
              {e.ubicacion && <p className="text-xs text-slate-500">{e.ubicacion}</p>}
            </Td>
            <Td className="text-right tabular-nums">
              <span className="font-semibold text-slate-900">{e.disponible}</span>
              <p className="text-xs text-slate-500">{enPares(e.disponible)}</p>
            </Td>
            <Td className="hidden text-right tabular-nums sm:table-cell">{e.stock}</Td>
            <Td className="hidden text-right tabular-nums md:table-cell">{e.reservado}</Td>
            <Td className="hidden text-right tabular-nums md:table-cell">{e.stock_minimo}</Td>
            <Td>
              <Insignia tono={ESTADO[e.estado_stock].tono}>{ESTADO[e.estado_stock].texto}</Insignia>
            </Td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

async function Productos() {
  const productos = await listarProductos();
  if (productos.length === 0) {
    return (
      <EstadoVacio icono={Boxes} titulo="Aún no hay productos" descripcion="Un producto es un tipo de luna sin medida, por ejemplo «Resina blanca».">
        <EnlaceBoton href="/panel/inventario/productos/nuevo" variante="primario" icono={Plus}>
          Nuevo producto
        </EnlaceBoton>
      </EstadoVacio>
    );
  }
  return (
    <Tabla>
      <thead>
        <tr>
          <Th>Producto</Th>
          <Th className="hidden md:table-cell">Características</Th>
          <Th className="text-right">Medidas</Th>
          <Th className="text-right">Disponible</Th>
          <Th className="text-right">Alertas</Th>
        </tr>
      </thead>
      <tbody>
        {productos.map((p) => (
          <tr key={p.id} className={`hover:bg-slate-50 ${p.activo ? "" : "opacity-60"}`}>
            <Td>
              <Link href={`/panel/inventario/productos/${p.id}`} className="font-medium text-marca-800 hover:underline">
                {p.nombre}
              </Link>
              {!p.activo && (
                <span className="ml-2">
                  <Insignia>Inactivo</Insignia>
                </span>
              )}
            </Td>
            <Td className="hidden text-slate-600 md:table-cell">
              {[TIPOS_LUNA[p.tipo as keyof typeof TIPOS_LUNA], VISIONES[p.vision], p.indice?.toFixed(2), p.tratamiento, p.color_tratamiento, p.por_lado ? "por lado" : null]
                .filter(Boolean)
                .join(" · ")}
            </Td>
            <Td className="text-right tabular-nums">{p.resumen.medidas}</Td>
            <Td className="text-right tabular-nums">
              {p.resumen.disponible} <span className="text-xs text-slate-500">({enPares(p.resumen.disponible)})</span>
            </Td>
            <Td className="text-right">{p.resumen.alertas ? <Insignia tono="ambar">{p.resumen.alertas}</Insignia> : "—"}</Td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Lima" }).format(new Date(iso));

async function Movimientos({ pagina, compra }: { pagina: number; compra?: string }) {
  const { movimientos, total, porPagina } = await movimientosRecientes(pagina);
  return (
    <div className="flex flex-col gap-4">
      {compra && <Alerta tipo="exito">Compra registrada. Sus entradas aparecen al inicio de la lista.</Alerta>}
      {movimientos.length === 0 ? (
        <EstadoVacio icono={History} titulo="Sin movimientos" descripcion="Las compras, salidas y ajustes aparecerán aquí." />
      ) : (
        <Tabla pie={<Paginacion pagina={pagina} total={total} porPagina={porPagina} href={(p) => `/panel/inventario?vista=movimientos${p > 1 ? `&pagina=${p}` : ""}`} />}>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Producto y medida</Th>
              <Th>Tipo</Th>
              <Th className="text-right">Cantidad</Th>
              <Th className="hidden text-right sm:table-cell">Stock después</Th>
              <Th className="hidden md:table-cell">Detalle</Th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <Td className="tabular-nums whitespace-nowrap">{fechaHora(m.creado_en)}</Td>
                <Td>
                  <Link href={`/panel/inventario/variantes/${m.variante.id}`} className="text-marca-800 hover:underline">
                    {m.variante.producto.nombre} · <span className="tabular-nums">{textoMedida({ ...m.variante, esfera: Number(m.variante.esfera), cilindro: Number(m.variante.cilindro), adicion: m.variante.adicion == null ? null : Number(m.variante.adicion) })}</span>
                  </Link>
                </Td>
                <Td>{TIPOS_MOVIMIENTO[m.tipo]}</Td>
                <Td className={`text-right font-semibold tabular-nums ${m.cantidad > 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                </Td>
                <Td className="hidden text-right tabular-nums sm:table-cell">{m.stock_resultante}</Td>
                <Td className="hidden text-slate-600 md:table-cell">
                  {m.orden ? (
                    <Link href={`/panel/ordenes/${m.orden.id}`} className="text-marca-700 hover:underline">
                      Orden #{String(m.orden.numero).padStart(4, "0")}
                    </Link>
                  ) : (
                    m.motivo ?? "—"
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
