import { ClipboardList, FlaskConical, ShieldCheck } from "lucide-react";
import { Marca } from "@/components/marca";
import { EnlaceBoton } from "@/components/ui";

const FUNCIONES = [
  { icono: ClipboardList, titulo: "Órdenes con seguimiento", texto: "Cada pedido con su estado, historial y fecha prometida." },
  { icono: FlaskConical, titulo: "Laboratorios", texto: "Sabe qué trabajos tiene cada laboratorio y cuáles se atrasan." },
  { icono: ShieldCheck, titulo: "Datos protegidos", texto: "Cada óptica ve solo su información, con permisos por rol." },
];

export default function Inicio() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Marca />
        <EnlaceBoton href="/ingresar" variante="fantasma">
          Ingresar
        </EnlaceBoton>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-marca-950 sm:text-5xl">
          Pedidos de lentes al laboratorio, ordenados y a tiempo.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-slate-600">
          OptiPedidos centraliza pacientes, recetas y órdenes de trabajo de tu óptica.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <EnlaceBoton href="/registro" variante="primario">
            Crear cuenta
          </EnlaceBoton>
          <EnlaceBoton href="/ingresar">Ya tengo cuenta</EnlaceBoton>
        </div>
        <ul className="mt-16 grid gap-4 sm:grid-cols-3">
          {FUNCIONES.map(({ icono: Icono, titulo, texto }) => (
            <li key={titulo} className="rounded-xl border border-slate-200 bg-white p-5 shadow-tarjeta">
              <span className="flex size-9 items-center justify-center rounded-lg bg-marca-50 text-marca-700">
                <Icono aria-hidden className="size-5" />
              </span>
              <p className="mt-3 font-medium text-slate-900">{titulo}</p>
              <p className="mt-1 text-sm text-slate-500">{texto}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
