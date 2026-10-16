"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Boton, EnlaceBoton } from "@/components/ui";

/** Error inesperado dentro del panel: se muestra sin perder el menú. */
export default function ErrorPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-tarjeta">
      <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-red-50 text-red-600">
        <TriangleAlert aria-hidden className="size-5" />
      </span>
      <h1 className="text-lg font-semibold text-slate-900">No se pudo cargar esta sección</h1>
      <p className="mt-1 text-sm text-slate-500">
        Puede ser un problema de conexión. Vuelve a intentarlo; si continúa, avisa al administrador
        {error.digest ? ` indicando el código ${error.digest}` : ""}.
      </p>
      <div className="mt-5 flex gap-2">
        <Boton variante="primario" icono={RotateCw} onClick={reset}>
          Reintentar
        </Boton>
        <EnlaceBoton href="/panel">Ir al panel</EnlaceBoton>
      </div>
    </div>
  );
}
