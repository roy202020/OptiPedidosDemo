import Link from "next/link";

export default function Inicio() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 text-center dark:bg-zinc-950">
      <h1 className="text-4xl font-semibold tracking-tight text-sky-800 dark:text-sky-400">OptiPedidos</h1>
      <p className="mt-3 max-w-md text-zinc-600 dark:text-zinc-400">
        Pedidos de lentes al laboratorio, ordenados y con seguimiento, para tu óptica.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/ingresar" className="rounded-md bg-sky-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-800">
          Ingresar
        </Link>
        <Link
          href="/registro"
          className="rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          Crear cuenta
        </Link>
      </div>
    </main>
  );
}
