import { Marca } from "@/components/marca";
import { EnlaceBoton } from "@/components/ui";

export default function NoEncontrado() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Marca className="mb-8" />
      <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl text-slate-900">Página no encontrada</h1>
      <p className="mt-2 text-slate-500">La dirección no existe o cambió.</p>
      <div className="mt-6">
        <EnlaceBoton href="/" variante="primario">
          Ir al inicio
        </EnlaceBoton>
      </div>
    </main>
  );
}
