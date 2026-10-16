import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { exportarExistencias, type FiltrosExistencias } from "@/lib/datos/inventario";
import { enPares } from "@/lib/inventario/medidas";
import { exigirOptica } from "@/lib/sesion";
import { leerNumero } from "@/lib/validacion/receta";

const ESTADOS = { ok: "Disponible", bajo: "Bajo mínimo", agotado: "Agotada" } as const;

const medida = (v: string | null) => {
  const n = leerNumero(v ?? "");
  return n == null || Number.isNaN(n) ? null : n;
};

/** Exporta las existencias filtradas a un archivo Excel (.xlsx) real. */
export async function GET(request: NextRequest) {
  const optica = await exigirOptica();
  const sp = request.nextUrl.searchParams;
  const filtros: FiltrosExistencias = {
    producto: sp.get("producto") ?? undefined,
    esfera: medida(sp.get("esfera")),
    cilindro: medida(sp.get("cilindro")),
    indice: medida(sp.get("indice")),
    tratamiento: sp.get("tratamiento") ?? undefined,
    estado:
      sp.get("vista") === "reponer"
        ? "reponer"
        : (["disponible", "bajo", "agotado"] as const).find((e) => e === sp.get("estado")),
  };
  const filas = await exportarExistencias(filtros);

  const libro = new ExcelJS.Workbook();
  libro.creator = "OptiPedidos";
  libro.created = new Date();
  const hoja = libro.addWorksheet("Existencias", { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = [
    { header: "Producto", key: "producto", width: 28 },
    { header: "Tratamiento", key: "tratamiento", width: 18 },
    { header: "Color AR", key: "color", width: 12 },
    { header: "Índice", key: "indice", width: 8 },
    { header: "Esfera", key: "esfera", width: 9 },
    { header: "Cilindro", key: "cilindro", width: 9 },
    { header: "Eje", key: "eje", width: 6 },
    { header: "Adición", key: "adicion", width: 9 },
    { header: "Lado", key: "lado", width: 6 },
    { header: "Stock (lunas)", key: "stock", width: 13 },
    { header: "Reservadas", key: "reservado", width: 11 },
    { header: "Disponible (lunas)", key: "disponible", width: 17 },
    { header: "Disponible (pares)", key: "pares", width: 17 },
    { header: "Mínimo", key: "minimo", width: 9 },
    { header: "Estado", key: "estado", width: 13 },
    { header: "Ubicación", key: "ubicacion", width: 14 },
  ];
  for (const e of filas) {
    hoja.addRow({
      producto: e.producto,
      tratamiento: e.tratamiento ?? "",
      color: e.color_tratamiento ?? "",
      indice: e.indice,
      esfera: e.esfera,
      cilindro: e.cilindro,
      eje: e.eje,
      adicion: e.adicion,
      lado: e.lado ?? "",
      stock: e.stock,
      reservado: e.reservado,
      disponible: e.disponible,
      pares: enPares(e.disponible),
      minimo: e.stock_minimo,
      estado: ESTADOS[e.estado_stock],
      ubicacion: e.ubicacion ?? "",
    });
  }
  hoja.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10203F" } };
  for (const col of ["indice", "esfera", "cilindro", "adicion"]) hoja.getColumn(col).numFmt = "+0.00;-0.00;0.00";
  hoja.getColumn("indice").numFmt = "0.00";
  hoja.autoFilter = { from: "A1", to: "P1" };

  const nombre = `inventario-${optica.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const buffer = await libro.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
