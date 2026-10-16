import { fecha, fechaLima, graduacion, valor } from "@/lib/formato";
import { normalizarCelularPe } from "@/lib/telefono";
import { DISENOS, ORIGENES_MONTURA, TIPOS_TRABAJO, TRATAMIENTOS, numeroOrden } from "./estados";

/** Datos mínimos de una orden para enviarla o imprimirla (sin importes: son para el laboratorio). */
export type OrdenParaLaboratorio = {
  numero: number;
  creado_en: string;
  fecha_entrega_prometida: string | null;
  prioridad: "normal" | "urgente";
  tipo_trabajo: keyof typeof TIPOS_TRABAJO;
  montura_descripcion: string | null;
  montura_origen: keyof typeof ORIGENES_MONTURA | null;
  paciente: { nombres: string; apellidos: string };
  laboratorio: { nombre: string; telefono: string | null };
  ojos: {
    ojo: "OD" | "OI";
    esfera: number | null;
    cilindro: number | null;
    eje: number | null;
    adicion: number | null;
    dnp: number | null;
    altura: number | null;
    prisma: number | null;
    base_prisma: string | null;
    material: string | null;
    indice: number | null;
    diseno: string | null;
    tratamientos: string[];
    tinte: string | null;
    diametro_mm: number | null;
  }[];
  observaciones: { texto: string }[];
};

/** Descripción del lente de un ojo: "Policarbonato · índice 1.59 · Monofocal · Ø 70 mm · Antirreflejo". */
export function descripcionLente(o: OrdenParaLaboratorio["ojos"][number]): string {
  return [
    o.material,
    o.indice ? `índice ${Number(o.indice).toFixed(2)}` : null,
    o.diseno ? (DISENOS[o.diseno as keyof typeof DISENOS] ?? o.diseno) : null,
    o.diametro_mm ? `Ø ${o.diametro_mm} mm` : null,
    o.tinte ? `tinte ${o.tinte}` : null,
    ...o.tratamientos.map((t) => TRATAMIENTOS[t as keyof typeof TRATAMIENTOS] ?? t),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Graduación de un ojo en una línea: "-1.25 -0.75 x180° Ad +2.00 DNP 31.5". */
export function lineaGraduacion(o: OrdenParaLaboratorio["ojos"][number]): string {
  return [
    graduacion(o.esfera),
    o.cilindro ? graduacion(o.cilindro) : null,
    o.cilindro ? `x${valor(o.eje)}°` : null,
    o.adicion ? `Ad ${graduacion(o.adicion)}` : null,
    o.dnp ? `DNP ${o.dnp}` : null,
    o.altura ? `Alt ${o.altura}` : null,
    o.prisma ? `Prisma ${o.prisma} ${o.base_prisma ?? ""}`.trim() : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Mensaje de WhatsApp con la orden para el laboratorio. Usa el formato de WhatsApp
 * (*negrita*). No incluye precios ni datos de contacto del paciente.
 */
export function mensajeLaboratorio(o: OrdenParaLaboratorio, optica: { nombre: string; telefono?: string | null }): string {
  const lineas = [
    `*${optica.nombre}* · Orden de trabajo *${numeroOrden(o.numero)}*`,
    o.prioridad === "urgente" ? "*URGENTE*" : null,
    "",
    `Paciente: ${o.paciente.apellidos}, ${o.paciente.nombres}`,
    `Trabajo: ${TIPOS_TRABAJO[o.tipo_trabajo]}`,
    `Fecha: ${fechaLima(o.creado_en)}`,
    o.fecha_entrega_prometida ? `Entrega requerida: *${fecha(o.fecha_entrega_prometida)}*` : null,
    "",
    "*Graduación*",
    ...o.ojos.map((j) => `${j.ojo}: ${lineaGraduacion(j)}`),
  ];

  const lentes = o.ojos.filter((j) => descripcionLente(j));
  if (lentes.length) {
    lineas.push("", "*Lentes*");
    // Si ambos ojos llevan el mismo lente, se escribe una sola vez.
    if (lentes.length === 2 && descripcionLente(lentes[0]) === descripcionLente(lentes[1])) {
      lineas.push(`OD y OI: ${descripcionLente(lentes[0])}`);
    } else {
      for (const j of lentes) lineas.push(`${j.ojo}: ${descripcionLente(j)}`);
    }
  }

  if (o.montura_origen || o.montura_descripcion) {
    lineas.push(
      "",
      `Montura: ${[o.montura_origen ? ORIGENES_MONTURA[o.montura_origen].toLowerCase() : null, o.montura_descripcion].filter(Boolean).join(" · ")}`,
    );
  }
  if (o.observaciones.length) {
    lineas.push("", "*Observaciones*", ...o.observaciones.map((ob) => `- ${ob.texto}`));
  }
  if (optica.telefono) lineas.push("", `Consultas: ${optica.telefono}`);

  return lineas.filter((l) => l !== null).join("\n");
}

/**
 * Enlace que abre WhatsApp (web o app) con el mensaje escrito. Si el laboratorio no tiene un
 * celular válido, el enlace no lleva número y WhatsApp deja elegir el contacto.
 */
export function enlaceWhatsAppLaboratorio(o: OrdenParaLaboratorio, optica: { nombre: string; telefono?: string | null }) {
  const numero = normalizarCelularPe(o.laboratorio.telefono);
  return {
    url: `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(mensajeLaboratorio(o, optica))}`,
    conNumero: Boolean(numero),
  };
}
