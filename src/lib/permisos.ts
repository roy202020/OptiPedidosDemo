import type { OpticaActual } from "@/lib/sesion";

/**
 * Permisos por rol para la interfaz y las Server Actions.
 * Son una segunda barrera: la base de datos aplica los mismos límites con RLS.
 * Módulo puro (sin código de servidor): lo usa también el menú en el cliente.
 * Para exigir un permiso en el servidor, usar exigirPermiso() de @/lib/sesion.
 */
export type Rol = OpticaActual["rol"];

export const PERMISOS = {
  /** Ventas, importes globales e informes. */
  verVentas: ["propietario", "administrador"],
  /** Crear y editar metas mensuales. */
  configurarMetas: ["propietario", "administrador"],
  /** Datos de la óptica (nombre, RUC, contacto) y auditoría. */
  administrarOptica: ["propietario", "administrador"],
  /** Crear sedes, activarlas o desactivarlas y asignar usuarios a cada sede. */
  gestionarSedes: ["propietario"],
  /** Reporte consolidado de todas las sedes. */
  verConsolidado: ["propietario"],
  /** Intervalo de los recordatorios de control. */
  configurarRecordatorios: ["propietario", "administrador"],
  /** Activar el envío automático de recordatorios (además exige el plan Profesional). */
  activarRecordatoriosAutomaticos: ["propietario"],
  /** Alta, rol y desactivación de miembros. */
  gestionarMiembros: ["propietario"],
} as const satisfies Record<string, readonly Rol[]>;

export type Permiso = keyof typeof PERMISOS;

export const tienePermiso = (rol: Rol, permiso: Permiso) => (PERMISOS[permiso] as readonly Rol[]).includes(rol);


export const NOMBRE_ROL: Record<Rol, string> = {
  propietario: "Propietario",
  administrador: "Administrador",
  operador: "Vendedor",
};
