import { SearchX } from "lucide-react";
import { EnlaceBoton, EstadoVacio } from "@/components/ui";

export default function NoEncontradoPanel() {
  return (
    <EstadoVacio icono={SearchX} titulo="No encontramos lo que buscas" descripcion="El registro no existe o pertenece a otra óptica.">
      <EnlaceBoton href="/panel">Ir al panel</EnlaceBoton>
    </EstadoVacio>
  );
}
