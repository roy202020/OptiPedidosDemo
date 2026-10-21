import type { Metadata } from "next";
import { Marca } from "@/components/marca";

// Páginas públicas: no se indexan y el código no viaja en el Referer a otros sitios.
export const metadata: Metadata = {
  title: { default: "Estado de tu pedido", template: "%s · Estado de tu pedido" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function LayoutEstado({ children }: LayoutProps<"/estado">) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6 sm:py-10">{children}</main>
      <footer className="flex items-center justify-center gap-2 pb-6 text-xs text-slate-500">
        Consulta con <Marca className="scale-75" />
      </footer>
    </div>
  );
}
