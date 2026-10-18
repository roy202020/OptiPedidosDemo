"use client";

import type { LucideIcon } from "lucide-react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, X } from "lucide-react";
import { createContext, useActionState, useContext, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { Boton, claseBoton, claseControl, type VarianteBoton } from "./ui";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

function Etiqueta({ htmlFor, children, requerido }: { htmlFor: string; children: React.ReactNode; requerido?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
      {children}
      {requerido && (
        <span aria-hidden className="ml-0.5 text-red-600">
          *
        </span>
      )}
    </label>
  );
}

function Ayuda({ id, errores, ayuda }: { id: string; errores?: string[]; ayuda?: string }) {
  if (errores?.length) {
    return (
      <p id={id} className="flex items-center gap-1 text-xs text-red-600">
        <CircleAlert aria-hidden className="size-3.5" />
        {errores[0]}
      </p>
    );
  }
  return ayuda ? (
    <p id={id} className="text-xs text-slate-500">
      {ayuda}
    </p>
  ) : null;
}

type CampoProps = {
  nombre: string;
  etiqueta: string;
  tipo?: string;
  errores?: string[];
  ayuda?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "type">;

export function Campo({ nombre, etiqueta, tipo = "text", errores, ayuda, className, id, ...resto }: CampoProps) {
  const idCampo = id ?? nombre;
  const idAyuda = `${idCampo}-ayuda`;
  const conError = Boolean(errores?.length);
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <Etiqueta htmlFor={idCampo} requerido={resto.required}>
        {etiqueta}
      </Etiqueta>
      <input
        id={idCampo}
        name={nombre}
        type={tipo}
        aria-invalid={conError || undefined}
        aria-describedby={conError || ayuda ? idAyuda : undefined}
        className={cx(claseControl, "h-10")}
        {...resto}
      />
      <Ayuda id={idAyuda} errores={errores} ayuda={ayuda} />
    </div>
  );
}

type SelectorProps = {
  nombre: string;
  etiqueta: string;
  opciones: readonly (string | { valor: string; texto: string })[];
  errores?: string[];
  ayuda?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">;

export function Selector({ nombre, etiqueta, opciones, errores, ayuda, className, ...resto }: SelectorProps) {
  const idAyuda = `${nombre}-ayuda`;
  const conError = Boolean(errores?.length);
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <Etiqueta htmlFor={nombre} requerido={resto.required}>
        {etiqueta}
      </Etiqueta>
      <select
        id={nombre}
        name={nombre}
        aria-invalid={conError || undefined}
        aria-describedby={conError || ayuda ? idAyuda : undefined}
        className={cx(claseControl, "h-10")}
        {...resto}
      >
        {opciones.map((o) => {
          const { valor, texto } = typeof o === "string" ? { valor: o, texto: o } : o;
          return (
            <option key={valor} value={valor}>
              {texto}
            </option>
          );
        })}
      </select>
      <Ayuda id={idAyuda} errores={errores} ayuda={ayuda} />
    </div>
  );
}

type AreaTextoProps = {
  nombre: string;
  etiqueta: string;
  errores?: string[];
  ayuda?: string;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name">;

export function AreaTexto({ nombre, etiqueta, errores, ayuda, className, ...resto }: AreaTextoProps) {
  const idAyuda = `${nombre}-ayuda`;
  const conError = Boolean(errores?.length);
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <Etiqueta htmlFor={nombre} requerido={resto.required}>
        {etiqueta}
      </Etiqueta>
      <textarea
        id={nombre}
        name={nombre}
        rows={3}
        aria-invalid={conError || undefined}
        aria-describedby={conError || ayuda ? idAyuda : undefined}
        className={cx(claseControl, "py-2")}
        {...resto}
      />
      <Ayuda id={idAyuda} errores={errores} ayuda={ayuda} />
    </div>
  );
}

/** Grupo de campos con título, para formularios largos. */
export function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-x-8 gap-y-4 border-t border-slate-100 pt-6 first-of-type:border-t-0 first-of-type:pt-0 lg:grid-cols-[220px_1fr]">
      <legend className="sr-only">{titulo}</legend>
      <div aria-hidden>
        <p className="text-sm font-semibold text-slate-900">{titulo}</p>
        {descripcion && <p className="mt-1 text-xs text-slate-500">{descripcion}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

// ------------------------------------------------------------------ solo lectura

/**
 * Suscripción suspendida: los botones de guardar se desactivan. Es solo una ayuda visual;
 * la base rechaza igual cualquier registro (trigger t_00_suscripcion).
 */
const SoloLectura = createContext<{ activo: boolean; fijar: (v: boolean) => void }>({ activo: false, fijar: () => {} });

export const TEXTO_SOLO_LECTURA = "Suscripción suspendida: solo lectura";

export function ProveedorSoloLectura({ children }: { children: React.ReactNode }) {
  const [activo, fijar] = useState(false);
  return <SoloLectura.Provider value={{ activo, fijar }}>{children}</SoloLectura.Provider>;
}

/** Lo renderiza el servidor cuando ya sabe el estado de la suscripción. */
export function FijarSoloLectura({ activo }: { activo: boolean }) {
  const { fijar } = useContext(SoloLectura);
  useEffect(() => fijar(activo), [activo, fijar]);
  return null;
}

export const useSoloLectura = () => useContext(SoloLectura).activo;

export function BotonEnviar({
  children,
  pendiente,
  variante = "primario",
  icono: Icono,
  className,
}: {
  children: React.ReactNode;
  pendiente: string;
  variante?: VarianteBoton;
  icono?: LucideIcon;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const soloLectura = useSoloLectura();
  return (
    <button
      type="submit"
      disabled={pending || soloLectura}
      aria-busy={pending}
      title={soloLectura ? TEXTO_SOLO_LECTURA : undefined}
      className={cx(claseBoton(variante), className)}
    >
      {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : Icono && <Icono aria-hidden className="size-4" />}
      {pending ? pendiente : children}
    </button>
  );
}

const ALERTAS = {
  error: { clase: "border-red-200 bg-red-50 text-red-800", icono: CircleAlert, rol: "alert" },
  exito: { clase: "border-emerald-200 bg-emerald-50 text-emerald-800", icono: CircleCheck, rol: "status" },
  info: { clase: "border-marca-200 bg-marca-50 text-marca-800", icono: Info, rol: "status" },
  aviso: { clase: "border-amber-200 bg-amber-50 text-amber-900", icono: Info, rol: "status" },
} as const;

export function Alerta({ tipo, children }: { tipo: keyof typeof ALERTAS; children: React.ReactNode }) {
  const { clase, icono: Icono, rol } = ALERTAS[tipo];
  return (
    <div role={rol} className={cx("flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm", clase)}>
      <Icono aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

type Accion = (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;

/**
 * Botón que abre un diálogo modal de confirmación y ejecuta una Server Action.
 * `children` permite pedir datos adicionales (por ejemplo, un motivo).
 * Se cierra solo cuando la acción termina sin errores.
 */
export function Confirmacion({
  accion,
  titulo,
  descripcion,
  textoBoton,
  iconoBoton,
  varianteBoton = "secundario",
  tamanoBoton = "md",
  textoConfirmar,
  pendiente = "Procesando…",
  variante = "peligro",
  children,
}: {
  accion: Accion;
  titulo: string;
  descripcion?: React.ReactNode;
  textoBoton: string;
  /** Icono ya renderizado (p. ej. <Archive />): los componentes no pueden pasar del servidor al cliente. */
  iconoBoton?: React.ReactNode;
  varianteBoton?: VarianteBoton;
  tamanoBoton?: "sm" | "md";
  textoConfirmar: string;
  pendiente?: string;
  variante?: VarianteBoton;
  children?: React.ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const [estado, enviar] = useActionState(accion, {} as EstadoFormulario);
  const soloLectura = useSoloLectura();

  useEffect(() => {
    if (estado.listo) dialogo.current?.close();
  }, [estado]);

  return (
    <>
      <Boton
        variante={varianteBoton}
        tamano={tamanoBoton}
        disabled={soloLectura}
        title={soloLectura ? TEXTO_SOLO_LECTURA : undefined}
        onClick={() => dialogo.current?.showModal()}
      >
        {iconoBoton && <span aria-hidden className="[&>svg]:size-4">{iconoBoton}</span>}
        {textoBoton}
      </Boton>
      <dialog
        ref={dialogo}
        aria-labelledby={idTitulo}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-flotante"
      >
        <form action={enviar} className="flex flex-col gap-4 p-5" noValidate>
          <div className="flex items-start justify-between gap-4">
            <h2 id={idTitulo} className="text-base font-semibold">
              {titulo}
            </h2>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => dialogo.current?.close()}
              className="-m-1 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          {descripcion && <div className="text-sm text-slate-600">{descripcion}</div>}
          {estado.error && <Alerta tipo="error">{estado.error}</Alerta>}
          {children && <CamposConErrores errores={estado.campos}>{children}</CamposConErrores>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Boton onClick={() => dialogo.current?.close()}>Cancelar</Boton>
            <BotonEnviar variante={variante} pendiente={pendiente}>
              {textoConfirmar}
            </BotonEnviar>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Muestra debajo de los campos del diálogo los errores de validación devueltos. */
function CamposConErrores({ errores, children }: { errores?: Record<string, string[] | undefined>; children: React.ReactNode }) {
  const mensajes = Object.values(errores ?? {}).flatMap((m) => m ?? []);
  return (
    <div className="flex flex-col gap-3">
      {children}
      {mensajes.length > 0 && (
        <ul className="text-xs text-red-600">
          {mensajes.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
