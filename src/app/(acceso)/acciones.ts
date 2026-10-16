"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { crearClienteServidor } from "@/lib/supabase/servidor";


const correo = z.string().trim().toLowerCase().pipe(z.email("Escribe un correo válido"));

const esquemaIngreso = z.object({
  email: correo,
  password: z.string().min(1, "Escribe tu contraseña"),
});

const esquemaRegistro = z
  .object({
    email: correo,
    password: z.string().min(8, "Usa al menos 8 caracteres"),
    confirmacion: z.string(),
  })
  .refine((d) => d.password === d.confirmacion, {
    path: ["confirmacion"],
    message: "Las contraseñas no coinciden",
  });

/** Traduce los códigos de error de Supabase Auth a mensajes para el usuario. */
function mensajeAuth(codigo: string | undefined): string {
  switch (codigo) {
    case "invalid_credentials":
      return "Correo o contraseña incorrectos.";
    case "email_not_confirmed":
      return "Confirma tu correo antes de ingresar. Revisa tu bandeja de entrada.";
    case "user_already_exists":
    case "email_exists":
      return "Ya existe una cuenta con ese correo. Intenta ingresar.";
    case "weak_password":
      return "La contraseña es demasiado débil. Usa una más larga o variada.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
    default:
      return "No se pudo completar la operación. Inténtalo de nuevo.";
  }
}

export async function ingresar(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const valores = { email: String(datos.get("email") ?? "") };
  const r = esquemaIngreso.safeParse(Object.fromEntries(datos));
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword(r.data);
  if (error) return { error: mensajeAuth(error.code), valores };

  redirect("/panel");
}

export async function registrarse(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const valores = { email: String(datos.get("email") ?? "") };
  const r = esquemaRegistro.safeParse(Object.fromEntries(datos));
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const origen = (await headers()).get("origin") ?? "";
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signUp({
    email: r.data.email,
    password: r.data.password,
    options: { emailRedirectTo: `${origen}/auth/confirmar` },
  });
  if (error) return { error: mensajeAuth(error.code), valores };

  // Con confirmación de correo activada (producción) no hay sesión todavía.
  if (!data.session) {
    return { aviso: `Te enviamos un enlace a ${r.data.email}. Ábrelo para activar tu cuenta.` };
  }

  redirect("/nueva-optica");
}

export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/ingresar");
}
