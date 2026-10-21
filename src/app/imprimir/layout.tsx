/**
 * Vistas de impresión (sin menú). Ticket para impresora térmica de 80 mm:
 * papel de 80 mm con 72 mm imprimibles, solo negro. El alto de la página lo fija
 * BotonImprimir al medir el ticket; margen 0 quita los encabezados y pies del navegador.
 */
export default function LayoutImpresion({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @page { margin: 0; }
        .ticket { overflow-wrap: anywhere; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .no-imprimir { display: none !important; }
          .ticket { box-shadow: none !important; margin: 0 auto !important; }
          .ticket, .ticket * { color: #000 !important; background: transparent !important; border-color: #000 !important; }
          .ticket .bloque, .ticket tr { break-inside: avoid; }
        }
      `}</style>
      <div className="min-h-dvh bg-slate-100 py-6 print:min-h-0 print:bg-white print:py-0">{children}</div>
    </>
  );
}
