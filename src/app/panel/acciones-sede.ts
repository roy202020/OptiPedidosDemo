"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_SEDE, obtenerSedes, TODAS_LAS_SEDES } from "@/lib/sesion";

/**
 * Guarda la sede elegida en el selector. Solo acepta sedes que el usuario puede ver (o "todas"
 * si ve más de una); igualmente cada lectura y escritura la vuelve a validar la base con RLS.
 */
export async function elegirSede(datos: FormData) {
  const valor = String(datos.get("sede") ?? "");
  const sedes = await obtenerSedes();
  const valido = (valor === TODAS_LAS_SEDES && sedes.length > 1) || sedes.some((s) => s.id === valor);
  if (!valido) return;

  (await cookies()).set(COOKIE_SEDE, valor, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/panel", "layout");
}
