/** Estado que devuelven las Server Actions de formularios (useActionState). */
export type EstadoFormulario = {
  error?: string;
  aviso?: string;
  campos?: Record<string, string[] | undefined>;
  valores?: Record<string, string>;
  /** La acción terminó bien (los diálogos de confirmación se cierran). */
  listo?: boolean;
};
