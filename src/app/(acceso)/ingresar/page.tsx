import type { Metadata } from "next";
import Link from "next/link";
import { FormularioIngreso } from "./formulario-ingreso";

export const metadata: Metadata = { title: "Ingresar" };

export default function PaginaIngresar() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Ingresar</h1>
      <p className="mt-1 mb-8 text-sm text-slate-500">Accede a los pedidos de tu óptica.</p>
      <FormularioIngreso />
      <p className="mt-8 text-center text-sm text-slate-500">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="font-medium text-marca-700 hover:underline">
          Crear cuenta
        </Link>
      </p>
    </>
  );
}
