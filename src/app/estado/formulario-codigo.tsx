import { Search } from "lucide-react";
import { claseBoton, claseControl } from "@/components/ui";
import { buscarPedido } from "./acciones";

/** Campo para escribir el código del ticket (funciona sin JavaScript). */
export function FormularioCodigo({ inicial }: { inicial?: string }) {
  return (
    <form action={buscarPedido} className="flex flex-col gap-3">
      <label htmlFor="codigo" className="text-sm font-medium text-slate-700">
        Código de consulta
      </label>
      <input
        id="codigo"
        name="codigo"
        required
        maxLength={20}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="ABCD-EFGH-JKMN"
        defaultValue={inicial}
        className={`${claseControl} h-12 text-center font-mono text-lg tracking-widest uppercase`}
      />
      <button type="submit" className={`${claseBoton("primario")} h-12 w-full`}>
        <Search aria-hidden className="size-4" />
        Consultar
      </button>
      <p className="text-xs text-slate-500">Está impreso en el ticket que te entregó la óptica, junto al código QR.</p>
    </form>
  );
}
