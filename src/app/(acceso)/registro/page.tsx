import type { Metadata } from "next";
import Link from "next/link";
import { FormularioRegistro } from "./formulario-registro";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function PaginaRegistro() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Crear cuenta</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Después registrarás tu óptica y quedarás como propietario.
      </p>
      <FormularioRegistro />
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        ¿Ya tienes cuenta?{" "}
        <Link href="/ingresar" className="font-medium text-sky-700 hover:underline dark:text-sky-400">
          Ingresar
        </Link>
      </p>
    </>
  );
}
