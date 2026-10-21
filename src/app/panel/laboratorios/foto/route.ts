import { NextResponse, type NextRequest } from "next/server";
import { enlaceFoto } from "@/lib/datos/archivos-laboratorio";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/**
 * Abre la foto de un ticket o comprobante: pide a Storage un enlace firmado de 5 minutos con la sesión del
 * usuario (las políticas del bucket deciden si puede verla) y redirige a él. El enlace no se guarda en ningún lado.
 */
export async function GET(request: NextRequest) {
  const ruta = request.nextUrl.searchParams.get("ruta") ?? "";
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/ingresar", request.url));
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/(tickets|pagos|egresos)\/[0-9a-f-]{36}\.\w{3,4}$/.test(ruta)) {
    return new NextResponse("Foto no encontrada", { status: 404 });
  }
  const url = await enlaceFoto(ruta);
  if (!url) return new NextResponse("Foto no encontrada o sin permiso", { status: 404 });
  return NextResponse.redirect(url);
}
