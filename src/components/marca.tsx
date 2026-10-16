import { Glasses } from "lucide-react";

/** Logotipo de OptiPedidos. */
export function Marca({ invertida = false, className = "" }: { invertida?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span
        className={`flex size-8 items-center justify-center rounded-lg ${invertida ? "bg-white/10 text-white" : "bg-marca-700 text-white"}`}
      >
        <Glasses aria-hidden className="size-4.5" />
      </span>
      <span className={invertida ? "text-white" : "text-marca-900"}>OptiPedidos</span>
    </span>
  );
}
