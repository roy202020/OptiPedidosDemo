import { CircleCheck, CircleX, PackageCheck, PackageX, Search, Undo2 } from "lucide-react";
import Link from "next/link";
import { liberarLuna, reservarLuna } from "@/app/panel/inventario/acciones";
import { Confirmacion } from "@/components/formulario";
import { claseBoton, claseControl, Insignia, Tarjeta } from "@/components/ui";
import { buscarMedidaExacta, listarProductos, reservasDeOrden, sugerencias, type Existencia, type OjoOrden } from "@/lib/datos/inventario";
import type { OrdenDetalle } from "@/lib/datos/ordenes";
import { enPares, textoMedida } from "@/lib/inventario/medidas";

type Busqueda = { OD?: string; OI?: string };

/**
 * Lunas del inventario para cada ojo de la orden. Busca solo la medida exacta de la receta
 * (o su transposición a cilindro negativo, que es la misma luna). Nunca elige otra:
 * las alternativas se muestran como sugerencias que el usuario puede aceptar.
 */
export async function LunasInventario({ orden, busqueda }: { orden: OrdenDetalle; busqueda: Busqueda }) {
  const [reservas, productos] = await Promise.all([reservasDeOrden(orden.id), listarProductos({ incluirInactivos: false })]);
  const editable = orden.estado === "borrador";
  if (!editable && reservas.length === 0) return null;

  return (
    <Tarjeta
      titulo="Lunas del inventario"
      descripcion={
        editable
          ? "Reserva lunas de tu stock para esta orden. Se descuentan al enviarla al laboratorio."
          : "Lunas de tu stock asignadas a esta orden."
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        {orden.ojos.map((j) => (
          <Ojo
            key={j.ojo}
            orden={orden}
            ojo={{ ojo: j.ojo, esfera: j.esfera, cilindro: j.cilindro, eje: j.eje, adicion: j.adicion }}
            reserva={reservas.find((r) => r.ojo === j.ojo)}
            productos={productos}
            productoElegido={busqueda[j.ojo]}
            busqueda={busqueda}
            editable={editable}
          />
        ))}
      </div>
      {editable && productos.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          No hay productos en el inventario.{" "}
          <Link href="/panel/inventario/productos/nuevo" className="text-marca-700 hover:underline">
            Crea uno
          </Link>{" "}
          para reservar lunas de tu stock.
        </p>
      )}
    </Tarjeta>
  );
}

async function Ojo({
  orden,
  ojo,
  reserva,
  productos,
  productoElegido,
  busqueda,
  editable,
}: {
  orden: OrdenDetalle;
  ojo: OjoOrden;
  reserva?: Awaited<ReturnType<typeof reservasDeOrden>>[number];
  productos: Awaited<ReturnType<typeof listarProductos>>;
  productoElegido?: string;
  busqueda: Busqueda;
  editable: boolean;
}) {
  const titulo = (
    <h3 className="mb-2 text-sm font-semibold text-slate-900">
      {ojo.ojo} <span className="font-normal text-slate-500">· receta {textoMedida({ esfera: Number(ojo.esfera ?? 0), cilindro: Number(ojo.cilindro ?? 0), eje: ojo.cilindro ? ojo.eje : null, adicion: ojo.adicion })}</span>
    </h3>
  );

  // Ya asignada
  if (reserva) {
    const v = reserva.variante;
    return (
      <div>
        {titulo}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-emerald-900">
            <PackageCheck aria-hidden className="size-4" />
            {v.producto} · <span className="tabular-nums">{textoMedida(v)}</span>
          </p>
          <p className="mt-1 text-emerald-800">
            {reserva.estado === "activa" ? "Reservada: se descontará al enviar la orden al laboratorio." : "Descontada del stock al enviar la orden."}
          </p>
          {editable && reserva.estado === "activa" && (
            <div className="mt-2">
              <Confirmacion
                accion={liberarLuna.bind(null, orden.id, ojo.ojo)}
                titulo={`Quitar la luna del ${ojo.ojo}`}
                descripcion="La reserva se libera y la luna vuelve a estar disponible."
                textoBoton="Quitar"
                iconoBoton={<Undo2 />}
                tamanoBoton="sm"
                textoConfirmar="Quitar reserva"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!editable) {
    return (
      <div>
        {titulo}
        <p className="text-sm text-slate-500">Sin lunas del inventario asignadas.</p>
      </div>
    );
  }

  const producto = productos.find((p) => p.id === productoElegido);
  const otro = ojo.ojo === "OD" ? "OI" : "OD";

  return (
    <div>
      {titulo}
      <form className="flex gap-2">
        {busqueda[otro] && <input type="hidden" name={`lunas_${otro}`} value={busqueda[otro]} />}
        <select name={`lunas_${ojo.ojo}`} aria-label={`Producto para el ${ojo.ojo}`} defaultValue={productoElegido ?? ""} className={`${claseControl} h-9 min-w-0 flex-1`}>
          <option value="">Elige el producto de luna</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <button className={claseBoton("secundario")}>
          <Search aria-hidden className="size-4" />
          <span className="sr-only sm:not-sr-only">Buscar</span>
        </button>
      </form>
      {producto && <Resultado orden={orden} ojo={ojo} producto={producto} />}
    </div>
  );
}

async function Resultado({
  orden,
  ojo,
  producto,
}: {
  orden: OrdenDetalle;
  ojo: OjoOrden;
  producto: Awaited<ReturnType<typeof listarProductos>>[number];
}) {
  const { medida, adicion, variante } = await buscarMedidaExacta(producto.id, ojo, producto);
  const exacta = { ...medida, adicion, lado: producto.por_lado ? ojo.ojo : null };
  const disponible = variante && variante.disponible > 0;
  const sug = disponible ? null : await sugerencias(producto.id, medida, adicion, ojo.ojo);

  return (
    <div className="mt-3 space-y-3 text-sm">
      <p className="text-slate-600">
        Medida exacta: <strong className="tabular-nums">{textoMedida(exacta)}</strong>
        {medida.transpuesta && <span className="block text-xs text-slate-500">Equivalente por transposición a cilindro negativo (es la misma luna).</span>}
      </p>

      {disponible ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <span className="flex items-center gap-1.5 text-emerald-900">
            <CircleCheck aria-hidden className="size-4" />
            Disponible: <strong>{variante.disponible}</strong> ({enPares(variante.disponible)})
            {variante.ubicacion && <span className="text-emerald-800">· {variante.ubicacion}</span>}
          </span>
          <Confirmacion
            accion={reservarLuna.bind(null, orden.id, ojo.ojo, variante.id)}
            titulo={`Reservar luna para el ${ojo.ojo}`}
            descripcion={`${producto.nombre} ${textoMedida(variante)}. Se descontará del stock al enviar la orden al laboratorio.`}
            textoBoton="Reservar"
            iconoBoton={<PackageCheck />}
            varianteBoton="primario"
            tamanoBoton="sm"
            textoConfirmar="Reservar"
            variante="primario"
          />
        </div>
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
          <p className="flex items-center gap-1.5 font-medium">
            {variante ? <PackageX aria-hidden className="size-4" /> : <CircleX aria-hidden className="size-4" />}
            {variante
              ? `Sin stock disponible (stock ${variante.stock}, reservadas ${variante.reservado}).`
              : "Esta medida no está registrada en este producto."}
          </p>
          <p className="mt-1 text-red-800">Solicítala al proveedor{producto.proveedor ? ` (${producto.proveedor})` : ""} o elige una sugerencia.</p>
        </div>
      )}

      {sug && (sug.vecinas.length > 0 || sug.otrosProductos.length > 0) && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Sugerencias · no son la medida exacta de la receta
          </p>
          <ul className="space-y-1.5">
            {[...sug.otrosProductos.map((v) => ({ v, nota: "misma medida, otro producto" })), ...sug.vecinas.map((v) => ({ v, nota: "medida cercana" }))].map(({ v, nota }) => (
              <Sugerencia key={v.id} orden={orden} ojo={ojo.ojo} v={v} nota={nota} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Sugerencia({ orden, ojo, v, nota }: { orden: OrdenDetalle; ojo: "OD" | "OI"; v: Existencia; nota: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <span>
        <span className="font-medium text-slate-900">{v.producto}</span> <span className="tabular-nums">{textoMedida(v)}</span>{" "}
        <Insignia tono="ambar">{nota}</Insignia>
        <span className="block text-xs text-slate-600">Disponible: {v.disponible}</span>
      </span>
      <Confirmacion
        accion={reservarLuna.bind(null, orden.id, ojo, v.id)}
        titulo="Usar una luna distinta a la receta"
        descripcion={`Vas a reservar ${v.producto} ${textoMedida(v)} para el ${ojo}. No es la medida exacta de la receta: confírmalo solo si el profesional lo aprueba.`}
        textoBoton="Usar esta"
        tamanoBoton="sm"
        textoConfirmar="Sí, usar esta luna"
        variante="peligro"
      />
    </li>
  );
}
