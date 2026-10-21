import { ClipboardList, Pencil, Power, PowerOff, Receipt, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Alerta, Confirmacion } from "@/components/formulario";
import { Cargando, Datos, Encabezado, EnlaceBoton, EstadoVacio, Insignia, Paginacion, Pestanas, Tarjeta } from "@/components/ui";
import { obtenerLaboratorio } from "@/lib/datos/laboratorios";
import { listarOrdenes, ORDENES_POR_PAGINA } from "@/lib/datos/ordenes";
import { COMERCIAL, ESTADOS_COMERCIALES, type EstadoComercial } from "@/lib/ordenes/estados";
import { tienePermiso } from "@/lib/permisos";
import { exigirOptica, obtenerSedes } from "@/lib/sesion";
import { hoyISO } from "@/lib/validacion/comun";
import { TablaOrdenes } from "../../ordenes/componentes";
import { cambiarActivo } from "../acciones";
import { EstadoCuenta } from "./estado-cuenta";

export const metadata: Metadata = { title: "Laboratorio" };

type Props = PageProps<"/panel/laboratorios/[id]">;

export default function PaginaLaboratorio({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Cargando alto="h-96" />}>
      <Detalle params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Detalle({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const estado = ESTADOS_COMERCIALES.includes(sp.estado as EstadoComercial) ? (sp.estado as EstadoComercial) : undefined;
  const atrasadas = sp.atrasadas === "1";
  const pagina = Math.max(1, Number.parseInt(String(sp.pagina ?? "1"), 10) || 1);

  const vista = sp.vista === "cuenta" ? "cuenta" : "ordenes";
  const [l, { ordenes, total }, optica, sedes] = await Promise.all([
    obtenerLaboratorio(id),
    listarOrdenes({ laboratorio: id, estado, atrasadas, pagina }),
    exigirOptica(),
    obtenerSedes(),
  ]);
  const gestiona = tienePermiso(optica.rol, "gestionarCuentasLaboratorio");
  const texto = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const sedeFiltro = sedes.find((s) => s.id === sp.sede)?.id ?? null;

  const base = `/panel/laboratorios/${id}`;
  const href = (p: Record<string, string | undefined>) => {
    const s = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => Boolean(e[1]))).toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <>
      <Encabezado
        titulo={l.nombre}
        descripcion={l.activo ? "Laboratorio activo" : <Insignia>Inactivo: no se ofrece en órdenes nuevas</Insignia>}
        volver={{ href: "/panel/laboratorios", texto: "Laboratorios" }}
      >
        <EnlaceBoton href={`/panel/laboratorios/tickets/nuevo?laboratorio=${id}`} icono={Receipt}>
          Registrar ticket
        </EnlaceBoton>
        {gestiona && (
          <EnlaceBoton href={`/panel/laboratorios/pagos/nuevo?laboratorio=${id}`} icono={Wallet}>
            Registrar pago
          </EnlaceBoton>
        )}
        <EnlaceBoton href={`${base}/editar`} icono={Pencil}>
          Editar
        </EnlaceBoton>
        <Confirmacion
          accion={cambiarActivo.bind(null, id, !l.activo)}
          titulo={l.activo ? "Desactivar laboratorio" : "Activar laboratorio"}
          descripcion={
            l.activo
              ? "No aparecerá al crear órdenes nuevas. Las órdenes que ya tiene asignadas no cambian."
              : "Volverá a estar disponible al crear órdenes."
          }
          textoBoton={l.activo ? "Desactivar" : "Activar"}
          iconoBoton={l.activo ? <PowerOff /> : <Power />}
          textoConfirmar={l.activo ? "Desactivar" : "Activar"}
          variante={l.activo ? "peligro" : "primario"}
        />
      </Encabezado>

      <Tarjeta className="mb-6">
        <Datos
          items={[
            { titulo: "Contacto", valor: l.contacto ?? "—" },
            { titulo: "Teléfono", valor: l.telefono ? <a href={`tel:${l.telefono.replace(/\s/g, "")}`} className="text-marca-700 hover:underline">{l.telefono}</a> : "—" },
            { titulo: "Crédito", valor: l.dias_credito === 0 ? "Contado" : `${l.dias_credito} días` },
            { titulo: "Correo", valor: l.email ? <a href={`mailto:${l.email}`} className="break-all text-marca-700 hover:underline">{l.email}</a> : "—" },
          ]}
        />
      </Tarjeta>

      <div className="mb-6">
        <Pestanas
          etiqueta="Secciones del laboratorio"
          items={[
            { href: base, texto: "Órdenes asignadas", activo: vista === "ordenes" },
            { href: `${base}?vista=cuenta`, texto: gestiona ? "Estado de cuenta" : "Tickets", activo: vista === "cuenta" },
          ]}
        />
      </div>

      {vista === "cuenta" ? (
        <>
          {sp.pagado === "1" && (
            <div className="mb-6">
              <Alerta tipo="exito">Pago registrado.</Alerta>
            </div>
          )}
          <EstadoCuenta
            laboratorio={id}
            sedes={sedes}
            gestiona={gestiona}
            filtros={{ sede: sedeFiltro, desde: texto(sp.desde), hasta: texto(sp.hasta) }}
          />
        </>
      ) : (
      <>
      <h2 className="mb-3 text-base font-semibold text-slate-900">Órdenes asignadas</h2>
      <div className="mb-4">
        <Pestanas
          etiqueta="Filtrar órdenes por estado"
          items={[
            { href: href({}), texto: "Todas", activo: !estado && !atrasadas },
            { href: href({ atrasadas: "1" }), texto: "Atrasadas", activo: atrasadas },
            ...ESTADOS_COMERCIALES.map((e) => ({ href: href({ estado: e }), texto: COMERCIAL[e].texto, activo: estado === e && !atrasadas })),
          ]}
        />
      </div>
      {ordenes.length === 0 ? (
        <EstadoVacio icono={ClipboardList} titulo="Sin órdenes" descripcion="No hay órdenes de este laboratorio con el filtro elegido." />
      ) : (
        <TablaOrdenes
          ordenes={ordenes}
          hoy={hoyISO()}
          sinLaboratorio
          pie={
            <Paginacion
              pagina={pagina}
              total={total}
              porPagina={ORDENES_POR_PAGINA}
              href={(p) => href({ estado, atrasadas: atrasadas ? "1" : undefined, pagina: p > 1 ? String(p) : undefined })}
            />
          }
        />
      )}
      </>
      )}
    </>
  );
}
