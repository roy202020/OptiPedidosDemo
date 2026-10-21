"use server";

import { redirect } from "next/navigation";
import { normalizarCodigo } from "@/lib/ordenes/consulta-publica";

/** Formulario de /estado: lleva al enlace directo del código escrito. */
export async function buscarPedido(datos: FormData) {
  const codigo = normalizarCodigo(String(datos.get("codigo") ?? "")).slice(0, 32);
  redirect(codigo ? `/estado/${codigo}` : "/estado");
}
