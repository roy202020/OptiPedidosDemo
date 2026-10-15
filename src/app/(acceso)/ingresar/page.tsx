import type { Metadata } from "next";
import Link from "next/link";
import { FormularioIngreso } from "./formulario-ingreso";

export const metadata: Metadata = { title: "Ingresar" };

export default function PaginaIngresar() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Ingresar</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">Accede a los pedidos de tu óptica.</p>
      <FormularioIngreso />
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="font-medium text-sky-700 hover:underline dark:text-sky-400">
          Crear cuenta
        </Link>
      </p>
    </>
  );
}
