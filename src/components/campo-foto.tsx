"use client";

import { claseBoton } from "./ui";
import { Camera, FileCheck2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const LADO_MAXIMO = 1600;
const CALIDAD = 0.8;

/** Reduce una foto a JPEG de hasta 1600 px por lado (un ticket se sigue leyendo bien y pesa ~300 KB). */
async function comprimir(archivo: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return archivo; // HEIC y PDF se suben tal cual
  try {
    const imagen = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext("2d")?.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", CALIDAD));
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], archivo.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return archivo;
  }
}

/**
 * Foto de un ticket o comprobante. En el celular abre la cámara trasera; también acepta galería o PDF.
 * `previa` conserva la foto ya subida en un intento anterior del mismo formulario.
 */
export function CampoFoto({
  etiqueta,
  ayuda,
  previa,
  nombre = "foto",
}: {
  etiqueta: string;
  ayuda?: string;
  previa?: string;
  nombre?: string;
}) {
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(previa ? "Foto ya cargada" : null);

  useEffect(() => () => {
    if (vista) URL.revokeObjectURL(vista);
  }, [vista]);

  // Al limpiar el formulario (form.reset()), también se quita la vista previa.
  useEffect(() => {
    const formulario = entrada.current?.form;
    if (!formulario) return;
    const alLimpiar = () => {
      setVista(null);
      setInfo(null);
    };
    formulario.addEventListener("reset", alLimpiar);
    return () => formulario.removeEventListener("reset", alLimpiar);
  }, []);

  const alElegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.currentTarget.files?.[0];
    if (!original) return;
    const archivo = await comprimir(original);
    if (archivo !== original && entrada.current) {
      const dt = new DataTransfer();
      dt.items.add(archivo);
      entrada.current.files = dt.files;
    }
    setVista(archivo.type.startsWith("image/") && archivo.type !== "image/heic" ? URL.createObjectURL(archivo) : null);
    setInfo(`${archivo.name} · ${Math.max(1, Math.round(archivo.size / 1024))} KB`);
  };

  const quitar = () => {
    if (entrada.current) entrada.current.value = "";
    setVista(null);
    setInfo(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">{etiqueta}</span>
      {previa && <input type="hidden" name="foto_path" value={previa} />}
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={id}
          className={`${claseBoton("secundario")} focus-within:ring-2 focus-within:ring-marca-500`}
        >
          <Camera aria-hidden className="size-4" />
          {info ? "Cambiar foto" : "Tomar o elegir foto"}
          <input
            ref={entrada}
            id={id}
            name={nombre}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={alElegir}
            className="sr-only"
          />
        </label>
        {info && (
          <span className="flex items-center gap-2 text-xs text-slate-600">
            {vista ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no pasa por next/image
              <img src={vista} alt="Vista previa de la foto" className="size-12 rounded border border-slate-200 object-cover" />
            ) : (
              <FileCheck2 aria-hidden className="size-4 text-emerald-600" />
            )}
            {info}
            <button type="button" onClick={quitar} aria-label="Quitar foto" className="ui-icono-boton text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X aria-hidden className="size-3.5" />
            </button>
          </span>
        )}
      </div>
      {ayuda && <p className="text-xs text-slate-500">{ayuda}</p>}
    </div>
  );
}
