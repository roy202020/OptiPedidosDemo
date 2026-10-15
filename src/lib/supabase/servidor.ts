import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Usa la sesión del usuario guardada en cookies, así que toda consulta pasa por RLS
 * con la identidad de quien hace la petición.
 */
export async function crearClienteServidor() {
  // El cliente usa Date.now() para revisar si el token venció: nunca debe correr al prerenderizar.
  await connection();
  const almacen = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return almacen.getAll();
        },
        setAll(porGuardar) {
          try {
            porGuardar.forEach(({ name, value, options }) => almacen.set(name, value, options));
          } catch {
            // Llamado desde un Server Component, donde no se pueden escribir cookies.
            // No pasa nada: el proxy ya renueva la sesión en cada petición.
          }
        },
      },
    },
  );
}
