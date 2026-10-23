import { CalendarDays, Check, Clock, MapPin, MessageCircle, SearchX, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alerta } from "@/components/formulario";
import { Cargando, EstadoVacio, Tarjeta } from "@/components/ui";
import { consultarEstadoPublico } from "@/lib/datos/consulta-publica";
import { fecha, fechaLima, soles } from "@/lib/formato";
import {
  ETAPAS,
  enlaceWhatsAppSede,
  etapaDe,
  nombreSede,
  normalizarCodigo,
  venceEnlace,
  type ConsultaPublica,
} from "@/lib/ordenes/consulta-publica";
import { numeroOrden } from "@/lib/ordenes/estados";
import { FormularioCodigo } from "../formulario-codigo";

export const metadata: Metadata = { title: { absolute: "Estado de tu pedido · OptiPedidos" } };

export default function PaginaEstadoPedido({ params }: PageProps<"/estado/[codigo]">) {
  return (
    <Suspense fallback={<Cargando alto="h-96" texto="Consultando tu pedido…" />}>
      <Resultado params={params} />
    </Suspense>
  );
}

async function Resultado({ params }: Pick<PageProps<"/estado/[codigo]">, "params">) {
  const { codigo } = await params;
  const r = await consultarEstadoPublico(normalizarCodigo(codigo));

  if (r.tipo === "limitada") {
    return (
      <div className="flex flex-1 flex-col justify-center gap-4">
        <Alerta tipo="aviso">Hiciste muchas consultas seguidas. Espera un minuto y vuelve a intentarlo.</Alerta>
      </div>
    );
  }
  if (r.tipo === "no_encontrada") {
    // Mismo mensaje si el código no existe, venció o la orden se anuló.
    return (
      <div className="flex flex-1 flex-col justify-center gap-6">
        <Tarjeta>
          <EstadoVacio
            compacto
            icono={SearchX}
            titulo="No encontramos un pedido activo con ese código"
            descripcion="Revisa el código de tu ticket. Si ya recogiste tus lentes hace tiempo, el enlace pudo haber vencido; consulta directamente con tu óptica."
          />
        </Tarjeta>
        <Tarjeta>
          <FormularioCodigo />
        </Tarjeta>
      </div>
    );
  }
  return <EstadoPedido d={r.datos} />;
}

function EstadoPedido({ d }: { d: ConsultaPublica }) {
  const actual = etapaDe(d.estado);
  const orden = numeroOrden(d.numero);
  return (
    <div className="flex flex-col gap-4">
      <header className="text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-marca-700">{d.optica}</p>
        <p className="text-sm text-slate-500">{nombreSede(d.sede)}</p>
        <h1 className="mt-3 text-xl font-semibold leading-tight sm:text-2xl tracking-tight text-slate-900">Hola, {d.paciente}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Pedido <span className="font-semibold tabular-nums">{orden}</span>
        </p>
      </header>

      <Tarjeta titulo={ETAPAS[actual]} descripcion={`Actualizado el ${fechaLima(d.actualizado_en)}`}>
        <ol className="flex flex-col">
          {ETAPAS.map((etapa, i) => {
            const hecho = i < actual || (i === actual && i === ETAPAS.length - 1);
            const enCurso = i === actual && !hecho;
            return (
              <li key={etapa} className="relative flex gap-3 pb-5 last:pb-0" aria-current={i === actual ? "step" : undefined}>
                {i < ETAPAS.length - 1 && (
                  <span aria-hidden className={`absolute top-7 left-3.5 h-[calc(100%-1.75rem)] w-0.5 ${i < actual ? "bg-marca-600" : "bg-slate-200"}`} />
                )}
                <span
                  className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    hecho ? "bg-marca-600 text-white" : enCurso ? "bg-white text-marca-700 ring-2 ring-marca-600" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {hecho ? <Check aria-hidden className="size-4" /> : i + 1}
                </span>
                <span className={`pt-1 text-sm ${i <= actual ? "font-medium text-slate-900" : "text-slate-400"}`}>
                  {etapa}
                  {enCurso && <span className="ml-2 text-xs font-normal text-marca-700">(estado actual)</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </Tarjeta>

      {d.saldo > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <Wallet aria-hidden className="size-5 shrink-0" />
          <p className="text-sm">
            Saldo pendiente: <span className="font-semibold tabular-nums">{soles(d.saldo)}</span>
            <span className="block text-xs">Lo pagas al recoger tus lentes.</span>
          </p>
        </div>
      )}

      <Tarjeta>
        <dl className="flex flex-col gap-4 text-sm">
          {d.fecha_prometida && d.estado !== "entregada" && (
            <Dato icono={CalendarDays} titulo="Fecha prometida">
              {fecha(d.fecha_prometida)}
            </Dato>
          )}
          <Dato icono={MapPin} titulo="Recógelo en">
            {nombreSede(d.sede)}
            {d.direccion && <span className="block text-slate-600">{d.direccion}</span>}
          </Dato>
          {d.horario && (
            <Dato icono={Clock} titulo="Horario">
              {d.horario}
            </Dato>
          )}
        </dl>
        {d.whatsapp && (
          <a
            href={enlaceWhatsAppSede(d.whatsapp, orden)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <MessageCircle aria-hidden className="size-4" />
            Escribir a la sede por WhatsApp
          </a>
        )}
      </Tarjeta>

      {d.entregada_en && (
        <p className="text-center text-xs text-slate-500">Este enlace funciona hasta el {fecha(venceEnlace(d.entregada_en))}.</p>
      )}
      <p className="text-center text-xs">
        <Link href="/estado" className="text-marca-700 hover:underline">
          Consultar otro código
        </Link>
      </p>
    </div>
  );
}

function Dato({ icono: Icono, titulo, children }: { icono: typeof MapPin; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icono aria-hidden className="mt-0.5 size-4 shrink-0 text-marca-600" />
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</dt>
        <dd className="mt-0.5 text-slate-900">{children}</dd>
      </div>
    </div>
  );
}
