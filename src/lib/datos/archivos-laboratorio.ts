import { crearClienteServidor } from "@/lib/supabase/servidor";

/*
 * Fotos de tickets y comprobantes (bucket privado "laboratorios"). Se suben y se leen con la sesión del
 * usuario: las políticas de Storage limitan cada carpeta a su óptica, su sede y su rol. Nunca hay URLs públicas.
 */

export const BUCKET_LABORATORIOS = "laboratorios";
export const MAX_FOTO = 5 * 1024 * 1024;
const TIPOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

/** Archivo elegido en el formulario, o null si no se eligió ninguno. */
export function archivoDe(datos: FormData, campo = "foto"): File | null {
  const f = datos.get(campo);
  return f instanceof File && f.size > 0 ? f : null;
}

/** Sube la foto a {optica}/{sede}/{tipo}/… y devuelve la ruta guardada. */
export async function subirFoto(
  archivo: File,
  destino: { opticaId: string; sedeId: string; tipo: "tickets" | "pagos" | "egresos" },
): Promise<{ ruta: string; error?: undefined } | { ruta?: undefined; error: string }> {
  const extension = TIPOS[archivo.type];
  if (!extension) return { error: "La foto debe ser una imagen (JPG, PNG, WEBP, HEIC) o un PDF." };
  if (archivo.size > MAX_FOTO) return { error: "La foto pesa más de 5 MB." };

  const ruta = `${destino.opticaId}/${destino.sedeId}/${destino.tipo}/${crypto.randomUUID()}.${extension}`;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.storage.from(BUCKET_LABORATORIOS).upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (error) return { error: "No se pudo subir la foto. Inténtalo de nuevo." };
  return { ruta };
}

/** Enlace firmado de pocos minutos (Storage comprueba el permiso del usuario). */
export async function enlaceFoto(ruta: string, segundos = 300): Promise<string | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.storage.from(BUCKET_LABORATORIOS).createSignedUrl(ruta, segundos);
  return error ? null : data.signedUrl;
}

/** Enlace de la app que abre la foto (verifica el permiso en cada apertura). */
export const rutaVerFoto = (ruta: string) => `/panel/laboratorios/foto?ruta=${encodeURIComponent(ruta)}`;
