import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Rutas que exigen sesión iniciada. */
const PRIVADAS = ["/panel", "/nueva-optica"];
/** Rutas que no tienen sentido con sesión iniciada (se envía al panel). */
const SOLO_VISITANTES = ["/", "/ingresar", "/registro"];

const coincide = (ruta: string, base: string) => ruta === base || ruta.startsWith(`${base}/`);

/**
 * Renueva la sesión de Supabase en cada petición (las cookies del token caducan)
 * y hace la primera barrera de navegación. La autorización real está en la base
 * de datos (RLS) y en cada página/acción, que vuelven a comprobar el usuario.
 */
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(porGuardar, cabeceras) {
          porGuardar.forEach(({ name, value }) => request.cookies.set(name, value));
          respuesta = NextResponse.next({ request });
          porGuardar.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
          Object.entries(cabeceras ?? {}).forEach(([clave, valor]) => respuesta.headers.set(clave, valor));
        },
      },
    },
  );

  // getClaims() valida la firma del token; no confiar en getSession() en el servidor.
  const { data } = await supabase.auth.getClaims();
  const autenticado = Boolean(data?.claims);
  const ruta = request.nextUrl.pathname;

  const redirigir = (destino: string) => {
    const url = request.nextUrl.clone();
    url.pathname = destino;
    url.search = "";
    const r = NextResponse.redirect(url);
    // Conservar las cookies de sesión renovadas en la redirección.
    respuesta.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!autenticado && PRIVADAS.some((p) => coincide(ruta, p))) return redirigir("/ingresar");
  if (autenticado && SOLO_VISITANTES.includes(ruta)) return redirigir("/panel");

  return respuesta;
}

export const config = {
  matcher: [
    // Todo excepto archivos estáticos e imágenes.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
