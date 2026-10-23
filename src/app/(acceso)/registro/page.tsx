import type { Metadata } from "next";
import Link from "next/link";
import { FormularioRegistro } from "./formulario-registro";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function PaginaRegistro() {
  return (
    <>
      <h1 className="text-xl font-semibold leading-tight sm:text-2xl tracking-tight text-slate-900">Crear cuenta</h1>
      <p className="mt-1 mb-8 text-sm text-slate-500">Después registrarás tu óptica y quedarás como propietario.</p>
      <FormularioRegistro />
      <p className="mt-8 text-center text-sm text-slate-500">
        ¿Ya tienes cuenta?{" "}
        <Link href="/ingresar" className="font-medium text-marca-700 hover:underline">
          Ingresar
        </Link>
      </p>
    </>
  );
}
