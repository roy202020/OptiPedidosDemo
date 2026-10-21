import { Insignia } from "@/components/ui";
import type { TicketLab } from "@/lib/datos/cuentas-laboratorio";
import { cuandoVence, ESTADO_PAGO, ESTADO_VENCIMIENTO } from "@/lib/laboratorios/cuentas";

/** Insignias de pago y vencimiento de un ticket (también en el estado de cuenta). */
export function EstadoTicket({ t }: { t: Pick<TicketLab, "anulado_en" | "estado_pago" | "estado_vencimiento" | "fecha_vencimiento" | "dias_para_vencer"> }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Insignia tono={ESTADO_PAGO[t.estado_pago].tono}>{ESTADO_PAGO[t.estado_pago].texto}</Insignia>
      {!t.anulado_en && t.estado_pago !== "pagado" && t.estado_vencimiento !== "al_dia" && (
        <Insignia tono={ESTADO_VENCIMIENTO[t.estado_vencimiento].tono}>{cuandoVence(t.dias_para_vencer)}</Insignia>
      )}
    </span>
  );
}
