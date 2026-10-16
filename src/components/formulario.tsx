"use client";

import { useFormStatus } from "react-dom";

type CampoProps = {
  nombre: string;
  etiqueta: string;
  tipo?: string;
  errores?: string[];
  ayuda?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "type">;

export function Campo({ nombre, etiqueta, tipo = "text", errores, ayuda, ...resto }: CampoProps) {
  const idError = `${nombre}-error`;
  const conError = Boolean(errores?.length);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={nombre} className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {etiqueta}
      </label>
      <input
        id={nombre}
        name={nombre}
        type={tipo}
        aria-invalid={conError || undefined}
        aria-describedby={conError ? idError : undefined}
        className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 aria-invalid:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        {...resto}
      />
      {ayuda && !conError && <p className="text-xs text-zinc-500">{ayuda}</p>}
      {conError && (
        <p id={idError} className="text-xs text-red-600 dark:text-red-400">
          {errores![0]}
        </p>
      )}
    </div>
  );
}

const claseControl =
  "rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 aria-invalid:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

type SelectorProps = {
  nombre: string;
  etiqueta: string;
  opciones: readonly (string | { valor: string; texto: string })[];
  errores?: string[];
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">;

export function Selector({ nombre, etiqueta, opciones, errores, ...resto }: SelectorProps) {
  const conError = Boolean(errores?.length);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={nombre} className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {etiqueta}
      </label>
      <select id={nombre} name={nombre} aria-invalid={conError || undefined} className={`h-10 ${claseControl}`} {...resto}>
        {opciones.map((o) => {
          const { valor, texto } = typeof o === "string" ? { valor: o, texto: o } : o;
          return (
            <option key={valor} value={valor}>
              {texto}
            </option>
          );
        })}
      </select>
      {conError && <p className="text-xs text-red-600 dark:text-red-400">{errores![0]}</p>}
    </div>
  );
}

type AreaTextoProps = {
  nombre: string;
  etiqueta: string;
  errores?: string[];
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name">;

export function AreaTexto({ nombre, etiqueta, errores, ...resto }: AreaTextoProps) {
  const conError = Boolean(errores?.length);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={nombre} className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {etiqueta}
      </label>
      <textarea id={nombre} name={nombre} rows={3} aria-invalid={conError || undefined} className={`py-2 ${claseControl}`} {...resto} />
      {conError && <p className="text-xs text-red-600 dark:text-red-400">{errores![0]}</p>}
    </div>
  );
}

export function BotonEnviar({ children, pendiente }: { children: React.ReactNode; pendiente: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-10 rounded-md bg-sky-700 px-4 text-sm font-medium text-white transition hover:bg-sky-800 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? pendiente : children}
    </button>
  );
}

export function Alerta({ tipo, children }: { tipo: "error" | "aviso"; children: React.ReactNode }) {
  const estilos =
    tipo === "error"
      ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  return (
    <p role={tipo === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${estilos}`}>
      {children}
    </p>
  );
}
