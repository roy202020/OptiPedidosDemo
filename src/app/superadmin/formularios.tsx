"use client";

import { CalendarPlus, Plus, Save, Wallet } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { AreaTexto, Alerta, BotonEnviar, Campo, Selector } from "@/components/formulario";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { MEDIOS_PAGO, NOMBRE_MEDIO, NOMBRE_PLAN, PLANES } from "@/lib/suscripcion";
import { crearOptica } from "./acciones";

type Accion = (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;

const OPCIONES_PLAN = PLANES.map((p) => ({ valor: p, texto: NOMBRE_PLAN[p] }));
const OPCIONES_MEDIO = MEDIOS_PAGO.map((m) => ({ valor: m, texto: NOMBRE_MEDIO[m] }));

function Mensajes({ estado }: { estado: EstadoFormulario }) {
  return (
    <>
      {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
      {estado.listo && estado.aviso && <Alerta tipo="exito">{estado.aviso}</Alerta>}
    </>
  );
}

/** Limpia el formulario cuando la acción termina bien. */
function useFormulario(accion: Accion) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.listo) ref.current?.reset();
  }, [estado]);
  return { estado, enviar, ref, v: estado.valores ?? {}, e: estado.campos ?? {} };
}

export function FormularioNuevaOptica({ venceSugerido }: { venceSugerido: string }) {
  const { estado, enviar, ref, v, e } = useFormulario(crearOptica);
  return (
    <form ref={ref} action={enviar} className="flex flex-col gap-4" noValidate>
      <Mensajes estado={estado} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo nombre="nombre" etiqueta="Nombre de la óptica" required maxLength={120} defaultValue={v.nombre} errores={e.nombre} />
        <Campo
          nombre="email"
          etiqueta="Correo del propietario"
          tipo="email"
          required
          defaultValue={v.email}
          errores={e.email}
          ayuda="Debe tener ya su cuenta en OptiPedidos."
        />
        <Selector nombre="plan" etiqueta="Plan" opciones={OPCIONES_PLAN} defaultValue={v.plan ?? "basico"} errores={e.plan} />
        <Campo nombre="vence_el" etiqueta="Vence el" tipo="date" required defaultValue={v.vence_el ?? venceSugerido} errores={e.vence_el} />
        <Campo
          nombre="max_sedes"
          etiqueta="Sedes por contrato"
          tipo="number"
          min={1}
          inputMode="numeric"
          defaultValue={v.max_sedes}
          errores={e.max_sedes}
          ayuda="Vacío: lo del plan (Básico 1; Profesional sin límite)."
        />
      </div>
      <div>
        <BotonEnviar pendiente="Creando…" icono={Plus}>
          Crear óptica
        </BotonEnviar>
      </div>
    </form>
  );
}

export function FormularioPlan({
  accion,
  inicial,
}: {
  accion: Accion;
  inicial: { plan: string; max_usuarios: string; max_sedes: string; whatsapp_mensual: string };
}) {
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const v: Record<string, string> = estado.valores ?? inicial;
  const e = estado.campos ?? {};
  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <Mensajes estado={estado} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Selector nombre="plan" etiqueta="Plan" opciones={OPCIONES_PLAN} defaultValue={v.plan} errores={e.plan} />
        <Campo
          nombre="max_usuarios"
          etiqueta="Usuarios activos"
          tipo="number"
          min={1}
          defaultValue={v.max_usuarios}
          errores={e.max_usuarios}
          ayuda="Vacío: lo del plan."
        />
        <Campo nombre="max_sedes" etiqueta="Sedes" tipo="number" min={1} defaultValue={v.max_sedes} errores={e.max_sedes} ayuda="Vacío: lo del plan." />
        <Campo
          nombre="whatsapp_mensual"
          etiqueta="WhatsApp automáticos por sede al mes"
          tipo="number"
          min={0}
          defaultValue={v.whatsapp_mensual}
          errores={e.whatsapp_mensual}
          ayuda="Vacío: lo del plan (Profesional 300)."
        />
      </div>
      <AreaTexto nombre="nota" etiqueta="Nota (queda en el historial)" maxLength={300} rows={2} defaultValue={v.nota} errores={e.nota} />
      <div>
        <BotonEnviar pendiente="Guardando…" icono={Save}>
          Guardar plan
        </BotonEnviar>
      </div>
    </form>
  );
}

export function FormularioExtension({ accion, venceActual }: { accion: Accion; venceActual: string }) {
  const { estado, enviar, ref, v, e } = useFormulario(accion);
  return (
    <form ref={ref} action={enviar} className="flex flex-col gap-4" noValidate>
      <Mensajes estado={estado} />
      <Campo nombre="vence_el" etiqueta="Nuevo vencimiento" tipo="date" required defaultValue={v.vence_el ?? venceActual} errores={e.vence_el} />
      <AreaTexto nombre="nota" etiqueta="Motivo" maxLength={300} rows={2} defaultValue={v.nota} errores={e.nota} />
      <div>
        <BotonEnviar pendiente="Guardando…" icono={CalendarPlus}>
          Cambiar vencimiento
        </BotonEnviar>
      </div>
    </form>
  );
}

export function FormularioPago({ accion, sugerido }: { accion: Accion; sugerido: { fecha: string; desde: string; hasta: string } }) {
  const { estado, enviar, ref, v, e } = useFormulario(accion);
  return (
    <form ref={ref} action={enviar} className="flex flex-col gap-4" noValidate>
      <Mensajes estado={estado} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo nombre="monto" etiqueta="Monto (S/)" inputMode="decimal" required defaultValue={v.monto} errores={e.monto} />
        <Campo nombre="fecha" etiqueta="Fecha del pago" tipo="date" required defaultValue={v.fecha ?? sugerido.fecha} errores={e.fecha} />
        <Selector nombre="medio" etiqueta="Medio" opciones={OPCIONES_MEDIO} defaultValue={v.medio ?? "yape"} errores={e.medio} />
        <Campo nombre="periodo_desde" etiqueta="Periodo desde" tipo="date" required defaultValue={v.periodo_desde ?? sugerido.desde} errores={e.periodo_desde} />
        <Campo nombre="periodo_hasta" etiqueta="Periodo hasta" tipo="date" required defaultValue={v.periodo_hasta ?? sugerido.hasta} errores={e.periodo_hasta} />
        <Campo nombre="nota" etiqueta="Nota" maxLength={300} defaultValue={v.nota} errores={e.nota} placeholder="N.º de operación" />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="extender" defaultChecked className="size-4 rounded border-slate-300" />
        Extender el vencimiento hasta el fin del periodo pagado
      </label>
      <div>
        <BotonEnviar pendiente="Registrando…" icono={Wallet}>
          Registrar pago
        </BotonEnviar>
      </div>
    </form>
  );
}
