import type { Metadata } from "next";
import { Tarjeta } from "@/components/ui";
import { FormularioCodigo } from "./formulario-codigo";

export const metadata: Metadata = { title: { absolute: "Estado de tu pedido · OptiPedidos" } };

export default function PaginaEstado() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold leading-tight sm:text-2xl tracking-tight text-slate-900">Estado de tu pedido</h1>
        <p className="mt-2 text-sm text-slate-600">Escribe el código de tu ticket para ver cómo va tu pedido de lentes.</p>
      </div>
      <Tarjeta>
        <FormularioCodigo />
      </Tarjeta>
    </div>
  );
}
