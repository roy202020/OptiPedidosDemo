/**
 * Vistas de impresión (sin menú). Ticket para impresora térmica de 80 mm:
 * papel de 80 mm con 72 mm imprimibles, solo negro.
 */
export default function LayoutImpresion({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @page { margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .no-imprimir { display: none !important; }
          .ticket { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>
      <div className="min-h-dvh bg-slate-100 py-6 print:bg-white print:py-0">{children}</div>
    </>
  );
}
