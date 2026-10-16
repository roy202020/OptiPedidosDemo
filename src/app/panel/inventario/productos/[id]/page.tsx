import { ClipboardCheck, PackagePlus, Pencil, Power, PowerOff, Ruler } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Alerta, Confirmacion } from "@/components/formulario";
import { Cargando, Datos, Encabezado, EnlaceBoton, EstadoVacio, Indicador, Insignia, Tarjeta } from "@/components/ui";
import { existenciasDeProducto, obtenerProducto } from "@/lib/datos/inventario";
import { soles } from "@/lib/formato";
import { enPares, SUPERFICIES, TIPOS_LUNA, VISIONES } from "@/lib/inventario/medidas";
import { tienePermiso } from "@/lib/permisos";
import { exigirOptica } from "@/lib/sesion";
import { cambiarProductoActivo } from "../../acciones";
import { MatrizStock } from "../../matriz-stock";

export const metadata: Metadata = { title: "Producto de inventario" };

type Props = PageProps<"/panel/inventario/productos/[id]">;

export default function PaginaProducto({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Cargando alto="h-96" />}>
      <Detalle params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Detalle({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [p, existencias, optica] = await Promise.all([obtenerProducto(id), existenciasDeProducto(id), exigirOptica()]);
  const jefe = tienePermiso(optica.rol, "administrarOptica");
  const total = existencias.reduce((s, e) => s + e.stock, 0);
  const disponible = existencias.reduce((s, e) => s + e.disponible, 0);
  const alertas = existencias.filter((e) => e.stock_minimo > 0 && e.estado_stock !== "ok").length;

  return (
    <>
      <Encabezado
        titulo={p.nombre}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            {[TIPOS_LUNA[p.tipo as keyof typeof TIPOS_LUNA], VISIONES[p.vision], p.indice ? `índice ${p.indice.toFixed(2)}` : null, p.tratamiento, p.color_tratamiento]
              .filter(Boolean)
              .join(" · ")}
            {!p.activo && <Insignia>Inactivo</Insignia>}
          </span>
        }
        volver={{ href: "/panel/inventario?vista=productos", texto: "Inventario" }}
      >
        <EnlaceBoton href={`/panel/inventario/productos/${id}/editar`} icono={Pencil}>
          Editar
        </EnlaceBoton>
        <Confirmacion
          accion={cambiarProductoActivo.bind(null, id, !p.activo)}
          titulo={p.activo ? "Desactivar producto" : "Activar producto"}
          descripcion={
            p.activo
              ? "No se ofrecerá en compras ni en órdenes. Su stock y su historial se conservan."
              : "Volverá a ofrecerse en compras y órdenes."
          }
          textoBoton={p.activo ? "Desactivar" : "Activar"}
          iconoBoton={p.activo ? <PowerOff /> : <Power />}
          textoConfirmar={p.activo ? "Desactivar" : "Activar"}
          variante={p.activo ? "peligro" : "primario"}
        />
        {jefe && existencias.length > 0 && (
          <EnlaceBoton href={`/panel/inventario/productos/${id}/conteo`} icono={ClipboardCheck}>
            Inventario físico
          </EnlaceBoton>
        )}
        {p.activo && (
          <EnlaceBoton href={`/panel/inventario/compras/nueva?producto=${id}`} variante="primario" icono={PackagePlus}>
            Registrar compra
          </EnlaceBoton>
        )}
      </Encabezado>

      {sp.conteo === "ok" && (
        <div className="mb-6">
          <Alerta tipo="exito">Inventario físico registrado. Las diferencias quedaron como ajustes con tu usuario.</Alerta>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Indicador titulo="Medidas registradas" valor={existencias.length} icono={Ruler} />
        <Indicador titulo="Lunas disponibles" valor={disponible} detalle={`${enPares(disponible)} · ${total} en stock`} icono={PackagePlus} tono="verde" />
        <Indicador
          titulo="Medidas por reponer"
          valor={alertas}
          detalle="Con mínimo configurado"
          icono={ClipboardCheck}
          tono={alertas ? "ambar" : "neutro"}
          href={`/panel/inventario?vista=reponer&producto=${id}`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Tarjeta titulo="Existencias por medida" descripcion="Haz clic en una celda para ver su historial o registrar movimientos.">
          {existencias.length === 0 ? (
            <EstadoVacio icono={Ruler} titulo="Sin medidas todavía" descripcion="Las medidas se crean al registrar la primera compra.">
              {p.activo && (
                <EnlaceBoton href={`/panel/inventario/compras/nueva?producto=${id}`} variante="primario" icono={PackagePlus}>
                  Registrar compra
                </EnlaceBoton>
              )}
            </EstadoVacio>
          ) : (
            <MatrizStock existencias={existencias} multifocal={p.vision !== "monofocal"} />
          )}
        </Tarjeta>
        <Tarjeta titulo="Ficha">
          <Datos
            columnas={2}
            items={[
              { titulo: "Material", valor: p.material ?? "—" },
              { titulo: "Superficie", valor: p.superficie ? SUPERFICIES[p.superficie as keyof typeof SUPERFICIES] : "—" },
              { titulo: "Control por lado", valor: p.por_lado ? "OD y OI por separado" : "No" },
              { titulo: "Mínimo por defecto", valor: `${p.stock_minimo_defecto} lunas` },
              { titulo: "Proveedor", valor: p.proveedor ?? "—" },
              { titulo: "Costo por luna", valor: p.costo_referencial != null ? soles(p.costo_referencial) : "—" },
            ]}
          />
        </Tarjeta>
      </div>
    </>
  );
}
