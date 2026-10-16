import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { Marca } from "@/components/marca";

const PUNTOS = [
  "Órdenes de trabajo con seguimiento por estado",
  "Pacientes y recetas en un solo lugar",
  "Datos aislados y protegidos por óptica",
];

export default function LayoutAcceso({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-marca-900 p-10 text-white lg:flex">
        <Link href="/">
          <Marca invertida />
        </Link>
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Gestión de pedidos al laboratorio para tu óptica.
          </h2>
          <ul className="mt-8 space-y-3 text-marca-100">
            {PUNTOS.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <CircleCheck aria-hidden className="size-5 text-marca-300" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-marca-300">© OptiPedidos</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block lg:hidden">
            <Marca />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
