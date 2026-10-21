import { CircleCheck, HandCoins, MessageCircle, PackageCheck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cargando, claseBoton, Encabezado, EstadoVacio, Indicador, Pestanas, Segmentado, Tabla, Td, Th } from "@/components/ui";
import { saldosPendientes } from "@/lib/datos/saldos";
import { fecha, soles } from "@/lib/formato";
import { numeroOrden } from "@/lib/ordenes/estados";
import { enlaceWhatsApp, mensajeRecordatorioSaldo } from "@/lib/ordenes/mensaje-paciente";
import { obtenerSedeActual } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { InsigniaEstado } from "../ordenes/componentes";

export const metadata: Metadata = { title: "Saldos pendientes" };

type Props = PageProps<"/panel/saldos">;

const ANTIGUEDADES = [
  { valor: "", texto: "Todos", dias: null },
  { valor: "7", texto: "Más de 7 días", dias: 7 },
  { valor: "30", texto: "Más de 30 días", dias: 30 },
  { valor: "60", texto: "Más de 60 días", dias: 60 },
] as const;

export default function PaginaSaldos({ searchParams }: Props) {
  return (
    <>
      <Encabezado
        titulo="Saldos pendientes"
        descripcion="Clientes que deben parte de su pedido, del más antiguo al más reciente. El saldo se calcula con los cobros vigentes."
      />
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Contenido({ searchParams }: Pick<Props, "searchParams">) {
  const [sp, { optica, sedes, actual }] = await Promise.all([searchParams, obtenerSedeActual()]);
  // Filtro de la página; sin él, la sede elegida en el selector general.
  const sede = sedes.find((s) => s.id === sp.sede)?.id ?? (sp.sede === "todas" ? null : (actual?.id ?? null));
  const antiguedad = ANTIGUEDADES.find((a) => a.valor === sp.dias) ?? ANTIGUEDADES[0];
  const supabase = await crearClienteServidor();
  const [filas, datosOptica] = await Promise.all([
    saldosPendientes(sede, antiguedad.dias),
    supabase.from("opticas").select("nombre").eq("id", optica.id).single(),
  ]);
  const nombreOptica = (datosOptica.data as { nombre: string } | null)?.nombre ?? optica.nombre;

  const total = filas.reduce((s, f) => s + f.saldo, 0);
  const listos = filas.filter((f) => f.estado === "recibida_optica");
  const totalListos = listos.reduce((s, f) => s + f.saldo, 0);

  const href = (cambios: { sede?: string; dias?: string }) => {
    const p = new URLSearchParams();
    const s = cambios.sede ?? (sp.sede as string | undefined);
    const d = cambios.dias ?? antiguedad.valor;
    if (s) p.set("sede", s);
    if (d) p.set("dias", d);
    const q = p.toString();
    return q ? `/panel/saldos?${q}` : "/panel/saldos";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador titulo="Por cobrar" valor={soles(total)} detalle={`${filas.length} ${filas.length === 1 ? "pedido" : "pedidos"}`} icono={Wallet} tono="ambar" />
        <Indicador
          titulo="En pedidos listos"
          valor={soles(totalListos)}
          detalle={`${listos.length} listos para entregar: debería entrar pronto`}
          icono={PackageCheck}
          tono="verde"
        />
        <Indicador
          titulo="Más antiguo"
          valor={filas.length ? `${filas[0].dias} días` : "—"}
          detalle={filas.length ? `${filas[0].paciente} · ${numeroOrden(filas[0].numero)}` : "Sin saldos"}
          icono={HandCoins}
        />
      </div>

      <div className="flex flex-col gap-3">
        {sedes.length > 1 && (
          <Pestanas
            etiqueta="Filtrar por sede"
            items={[
              { href: href({ sede: "todas" }), texto: "Todas mis sedes", activo: sede === null },
              ...sedes.map((s) => ({ href: href({ sede: s.id }), texto: s.nombre, activo: sede === s.id })),
            ]}
          />
        )}
        <Segmentado
          etiqueta="Antigüedad del pedido"
          items={ANTIGUEDADES.map((a) => ({ href: href({ dias: a.valor }), texto: a.texto, activo: a.valor === antiguedad.valor }))}
        />
      </div>

      {filas.length === 0 ? (
        <EstadoVacio
          icono={CircleCheck}
          titulo={antiguedad.dias ? "Sin saldos con esa antigüedad" : "Nadie debe en esta sede"}
          descripcion="Los pedidos aparecen aquí mientras tengan saldo pendiente, incluso si se entregaron con saldo autorizado."
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th className="hidden md:table-cell">Pedido</Th>
              <Th className="hidden lg:table-cell">Estado</Th>
              <Th className="hidden text-right sm:table-cell">Total</Th>
              <Th className="text-right">Saldo</Th>
              <Th className="text-right">Días</Th>
              <Th>
                <span className="sr-only">Recordar</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const remitente = sedes.length > 1 ? `${nombreOptica} (sede ${f.sede})` : nombreOptica;
              const whatsapp = enlaceWhatsApp(
                f.telefono,
                mensajeRecordatorioSaldo({ nombres: f.paciente.split(", ")[1] ?? f.paciente }, numeroOrden(f.numero), f.saldo, remitente, f.estado === "recibida_optica"),
              );
              return (
                <tr key={f.orden_id}>
                  <Td>
                    <Link href={`/panel/pacientes/${f.paciente_id}`} className="font-medium text-marca-700 hover:underline">
                      {f.paciente}
                    </Link>
                    <p className="text-xs text-slate-500 md:hidden">
                      <Link href={`/panel/ordenes/${f.orden_id}`} className="hover:underline">
                        {numeroOrden(f.numero)}
                      </Link>{" "}
                      · {fecha(f.creado_en)}
                    </p>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <Link href={`/panel/ordenes/${f.orden_id}`} className="font-medium text-marca-700 hover:underline">
                      {numeroOrden(f.numero)}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {fecha(f.creado_en)}
                      {sedes.length > 1 ? ` · ${f.sede}` : ""}
                    </p>
                  </Td>
                  <Td className="hidden lg:table-cell">
                    <InsigniaEstado estado={f.estado} />
                  </Td>
                  <Td className="hidden text-right tabular-nums sm:table-cell">
                    {soles(f.total)}
                    <p className="text-xs text-slate-500">pagó {soles(f.pagado)}</p>
                  </Td>
                  <Td className="text-right font-semibold tabular-nums text-amber-800">{soles(f.saldo)}</Td>
                  <Td className={`text-right tabular-nums ${f.dias > 30 ? "font-semibold text-red-700" : ""}`}>{f.dias}</Td>
                  <Td className="text-right">
                    {whatsapp ? (
                      <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={claseBoton("secundario", "sm")} title="Recordar el saldo por WhatsApp">
                        <MessageCircle aria-hidden className="size-4" />
                        <span className="hidden sm:inline">WhatsApp</span>
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">Sin celular</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
