import { ArrowDownCircle, Ban, Image as IconoFoto, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alerta, Campo, Confirmacion } from "@/components/formulario";
import { Cargando, claseBoton, claseControl, Encabezado, EstadoVacio, Indicador, Insignia, Pestanas, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { rutaVerFoto } from "@/lib/datos/archivos-laboratorio";
import { nombresMiembros } from "@/lib/datos/cuentas-laboratorio";
import { listarEgresos } from "@/lib/datos/egresos";
import { CATEGORIA_CORTA, CATEGORIAS_EGRESO, MEDIOS_EGRESO, rangoMes, totalesEgresos, type CategoriaEgreso } from "@/lib/egresos";
import { fecha, mes as nombreMes, soles } from "@/lib/formato";
import { exigirPermiso, obtenerSedeActual, sedeParaRegistrar } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { hoyLimaISO } from "@/lib/validacion/comun";
import { anularEgreso } from "./acciones";
import { FormularioEgreso } from "./formulario-egreso";

export const metadata: Metadata = { title: "Egresos" };

type Props = PageProps<"/panel/egresos">;

export default function PaginaEgresos({ searchParams }: Props) {
  return (
    <>
      <Encabezado
        titulo="Egresos"
        descripcion="Gastos de la sede: servicios, alquiler, sueldos, movilidad y otros. Los pagos a laboratorios se registran en Laboratorios."
      />
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Contenido({ searchParams }: Pick<Props, "searchParams">) {
  await exigirPermiso("gestionarCobros");
  const [sp, { sedes, actual }, registro] = await Promise.all([searchParams, obtenerSedeActual(), sedeParaRegistrar()]);
  const hoy = hoyLimaISO();
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : hoy.slice(0, 7);
  const sede = sedes.find((s) => s.id === sp.sede)?.id ?? (sp.sede === "todas" ? null : (actual?.id ?? null));
  const categoria = typeof sp.categoria === "string" && sp.categoria in CATEGORIAS_EGRESO ? (sp.categoria as CategoriaEgreso) : undefined;

  const supabase = await crearClienteServidor();
  const [egresos, nombres, caja] = await Promise.all([
    listarEgresos({ sede, ...rangoMes(mes), categoria }),
    nombresMiembros(),
    registro.sede ? supabase.rpc("caja_abierta", { p_sede: registro.sede.id }) : Promise.resolve({ data: null }),
  ]);
  const { total, porCategoria } = totalesEgresos(egresos);
  const nombreSede = (id: string) => sedes.find((s) => s.id === id)?.nombre ?? "—";

  const href = (cambios: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const actualP: Record<string, string | undefined> = { mes, sede: sp.sede as string | undefined, categoria, ...cambios };
    for (const [k, val] of Object.entries(actualP)) if (val) p.set(k, val);
    const q = p.toString();
    return q ? `/panel/egresos?${q}` : "/panel/egresos";
  };

  return (
    <div className="flex flex-col gap-6">
      <Tarjeta titulo="Registrar egreso">
        {registro.sede ? (
          <FormularioEgreso hoy={hoy} hayCaja={Boolean(caja.data)} sede={registro.sede.nombre} />
        ) : (
          <Alerta tipo="aviso">{registro.error}</Alerta>
        )}
      </Tarjeta>

      <form className="flex flex-wrap items-end gap-3" aria-label="Filtrar egresos">
        {sp.sede && <input type="hidden" name="sede" value={String(sp.sede)} />}
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Mes
          <input type="month" name="mes" defaultValue={mes} max={hoy.slice(0, 7)} className={`${claseControl} h-10`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Categoría
          <select name="categoria" defaultValue={categoria ?? ""} className={`${claseControl} h-10`}>
            <option value="">Todas</option>
            {Object.entries(CATEGORIA_CORTA).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </label>
        <button className={claseBoton("secundario")}>Filtrar</button>
      </form>
      {sedes.length > 1 && (
        <Pestanas
          etiqueta="Filtrar por sede"
          items={[
            { href: href({ sede: "todas" }), texto: "Todas mis sedes", activo: sede === null },
            ...sedes.map((s) => ({ href: href({ sede: s.id }), texto: s.nombre, activo: sede === s.id })),
          ]}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo={`Egresos de ${nombreMes(`${mes}-01`)}`} valor={soles(total)} detalle={`${egresos.filter((x) => !x.anulado_en).length} registros`} icono={ArrowDownCircle} tono="ambar" />
        {porCategoria.slice(0, 3).map((c) => (
          <Indicador key={c.categoria} titulo={CATEGORIA_CORTA[c.categoria]} valor={soles(c.monto)} icono={ReceiptText} tono="neutro" />
        ))}
      </div>

      {egresos.length === 0 ? (
        <EstadoVacio icono={ReceiptText} titulo="Sin egresos en este periodo" descripcion="Registra aquí el pago de servicios, alquiler, sueldos y otros gastos." />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Concepto</Th>
              <Th className="hidden md:table-cell">Medio</Th>
              <Th className="text-right">Monto</Th>
              <Th className="hidden lg:table-cell">Registró</Th>
              <Th>
                <span className="sr-only">Acciones</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {egresos.map((x) => (
              <tr key={x.id} className={x.anulado_en ? "text-slate-400" : undefined}>
                <Td className="tabular-nums">
                  {fecha(x.fecha)}
                  {sedes.length > 1 && <p className="text-xs text-slate-500">{nombreSede(x.sede_id)}</p>}
                </Td>
                <Td>
                  <p className={x.anulado_en ? "line-through" : "font-medium text-slate-900"}>{x.concepto}</p>
                  <p className="text-xs text-slate-500">
                    {CATEGORIA_CORTA[x.categoria]}
                    {x.numero_comprobante ? ` · ${x.numero_comprobante}` : ""}
                  </p>
                  {x.anulado_en && (
                    <p className="mt-0.5 text-xs">
                      <Insignia>Anulado</Insignia> {x.motivo_anulacion}
                    </p>
                  )}
                </Td>
                <Td className="hidden md:table-cell">{MEDIOS_EGRESO[x.medio]}</Td>
                <Td className={`text-right tabular-nums ${x.anulado_en ? "line-through" : ""}`}>{soles(x.monto)}</Td>
                <Td className="hidden break-all lg:table-cell">{(x.registrado_por && nombres.get(x.registrado_por)) || "—"}</Td>
                <Td className="text-right">
                  <span className="inline-flex flex-wrap justify-end gap-2">
                    {x.foto_path && (
                      <Link href={rutaVerFoto(x.foto_path)} target="_blank" className={claseBoton("secundario", "sm")}>
                        <IconoFoto aria-hidden className="size-4" />
                        <span className="hidden sm:inline">Recibo</span>
                      </Link>
                    )}
                    {!x.anulado_en && (
                      <Confirmacion
                        accion={anularEgreso.bind(null, x.id)}
                        titulo={`Anular egreso de ${soles(x.monto)}`}
                        descripcion={
                          x.medio === "efectivo_caja"
                            ? "Deja de contar en los gastos y su salida de caja se anula. No se borra nada."
                            : "Deja de contar en los gastos. No se borra nada."
                        }
                        textoBoton="Anular"
                        iconoBoton={<Ban />}
                        tamanoBoton="sm"
                        textoConfirmar="Anular egreso"
                        pendiente="Anulando…"
                      >
                        <Campo nombre="motivo" etiqueta="Motivo" required maxLength={300} />
                      </Confirmacion>
                    )}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
