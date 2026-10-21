/** Piezas comunes de los comprobantes de 80 mm (solo negro, sin fondos). */

export const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Lima" }).format(new Date(iso));

/** Línea divisoria de ticket. */
export const Linea = () => <div className="my-1.5 border-t border-dashed border-black" />;

/** Bloque que la impresora no debe partir. */
export function Bloque({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <section className="bloque">
      {titulo && <h2 className="mb-0.5 font-bold uppercase">{titulo}</h2>}
      {children}
    </section>
  );
}

/** Lista "Etiqueta: valor" en dos columnas; las filas sin valor no se pintan. */
export function Filas({ filas }: { filas: [string, React.ReactNode, boolean?][] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
      {filas.map(([etiqueta, contenido, destacado]) =>
        contenido == null || contenido === "" ? null : (
          <div key={etiqueta} className="contents">
            <dt>{etiqueta}:</dt>
            <dd className={destacado ? "font-bold" : undefined}>{contenido}</dd>
          </div>
        ),
      )}
    </dl>
  );
}

/** Pie con la hora de impresión y margen para el corte de la impresora. */
export function Pie({ nota }: { nota?: string }) {
  return (
    <>
      <Linea />
      {nota && <p className="text-center text-[10px]">{nota}</p>}
      <p className="text-center text-[10px]">Impreso {fechaHora(new Date().toISOString())}</p>
      <div className="h-[8mm]" />
    </>
  );
}
