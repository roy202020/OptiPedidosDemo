"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";
import { Boton } from "@/components/ui";

const MM_POR_PX = 25.4 / 96;

/**
 * Imprime el ticket en papel de 80 mm con el alto exacto del contenido, para que la
 * impresora térmica no avance papel en blanco. (`size: 80mm auto` no es CSS válido.)
 */
function imprimir() {
  const ticket = document.querySelector<HTMLElement>(".ticket");
  const alto = ticket ? Math.ceil(ticket.getBoundingClientRect().height * MM_POR_PX) + 2 : 200;
  let estilo = document.getElementById("pagina-ticket");
  if (!estilo) {
    estilo = document.createElement("style");
    estilo.id = "pagina-ticket";
    document.head.appendChild(estilo);
  }
  estilo.textContent = `@page { size: 80mm ${alto}mm; margin: 0; }`;
  window.print();
}

/** Botón de imprimir; con `auto` abre el diálogo de impresión al cargar. */
export function BotonImprimir({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (!auto) return;
    // Espera a que carguen las fuentes para medir e imprimir con la tipografía final.
    document.fonts.ready.then(imprimir);
  }, [auto]);

  return (
    <Boton variante="primario" icono={Printer} onClick={imprimir}>
      Imprimir
    </Boton>
  );
}
