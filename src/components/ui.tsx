import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, Gem, Search } from "lucide-react";
import Link from "next/link";

/**
 * Componentes de presentación del sistema de diseño (sin estado, válidos en servidor y cliente).
 * Los controles de formulario con estado viven en ./formulario.tsx.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Estilo común de inputs, selects y textareas. */
export const claseControl =
  "font-sans leading-5 tracking-normal w-full rounded-lg border border-slate-300 bg-white px-3 text-base sm:text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-marca-500 focus:ring-3 focus:ring-marca-500/15 disabled:bg-slate-50 aria-invalid:border-red-500 aria-invalid:focus:ring-red-500/15";

// ------------------------------------------------------------------ botones

export const VARIANTES_BOTON = {
  primario: "bg-marca-700 text-white shadow-sm hover:bg-marca-800 active:bg-marca-900",
  secundario: "border border-slate-300 bg-white text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100",
  peligro: "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800",
  invertido: "text-marca-100 hover:bg-white/10 hover:text-white active:bg-white/15",
  fantasma: "text-slate-700 hover:bg-slate-100 active:bg-slate-200",
} as const;

const TAMANOS_BOTON = {
  sm: "min-h-11 sm:min-h-10 gap-1.5 px-3 py-2 text-sm",
  md: "min-h-11 gap-2 px-4 py-2 text-sm",
} as const;

export type VarianteBoton = keyof typeof VARIANTES_BOTON;

export const claseBoton = (variante: VarianteBoton = "secundario", tamano: keyof typeof TAMANOS_BOTON = "md") =>
  cx(
    "ui-boton font-sans text-center leading-5 tracking-normal max-w-full inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg font-medium whitespace-normal transition-colors select-none disabled:pointer-events-none disabled:opacity-60 aria-disabled:pointer-events-none",
    VARIANTES_BOTON[variante],
    TAMANOS_BOTON[tamano],
  );

type PropsBotonBase = { variante?: VarianteBoton; tamano?: keyof typeof TAMANOS_BOTON; icono?: LucideIcon };

export function Boton({
  variante,
  tamano,
  icono: Icono,
  className,
  children,
  type = "button",
  ...resto
}: PropsBotonBase & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cx(claseBoton(variante, tamano), className)} {...resto}>
      {Icono && <Icono aria-hidden className="size-4" />}
      {children}
    </button>
  );
}

export function EnlaceBoton({
  href,
  variante,
  tamano,
  icono: Icono,
  children,
  className,
}: PropsBotonBase & { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cx(claseBoton(variante, tamano), className)}>
      {Icono && <Icono aria-hidden className="size-4" />}
      {children}
    </Link>
  );
}

// ------------------------------------------------------------------ estructura

/** Título de página con descripción, enlace para volver y acciones. */
export function Encabezado({
  titulo,
  descripcion,
  volver,
  children,
}: {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  volver?: { href: string; texto: string };
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      {volver && (
        <Link
          href={volver.href}
          className="group mb-3 inline-flex min-h-11 sm:min-h-8 items-center gap-1 rounded-md text-sm font-medium text-slate-500 transition-colors hover:text-marca-700"
        >
          <ChevronLeft aria-hidden className="size-4 transition-transform group-hover:-translate-x-0.5" />
          {volver.texto}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-2xl">{titulo}</h1>
          {descripcion && <div className="mt-1 text-sm text-slate-500">{descripcion}</div>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}

/** Título de un bloque dentro de una página (sin tarjeta). */
export function Subtitulo({ children, acciones }: { children: React.ReactNode; acciones?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold leading-6 tracking-normal text-slate-700">{children}</h2>
      {acciones}
    </div>
  );
}

export function Tarjeta({
  titulo,
  descripcion,
  acciones,
  children,
  className,
  sinRelleno,
}: {
  titulo?: React.ReactNode;
  descripcion?: React.ReactNode;
  acciones?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  sinRelleno?: boolean;
}) {
  return (
    <section className={cx("rounded-2xl border border-slate-200/80 bg-white shadow-tarjeta", className)}>
      {(titulo || acciones) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            {titulo && <h2 className="text-base font-semibold leading-6 tracking-normal text-slate-900">{titulo}</h2>}
            {descripcion && <p className="mt-0.5 text-sm text-slate-500">{descripcion}</p>}
          </div>
          {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
        </div>
      )}
      <div className={sinRelleno ? "" : "p-5"}>{children}</div>
    </section>
  );
}

/** Lista de datos etiqueta/valor. */
export function Datos({ items, columnas = 3 }: { items: { titulo: string; valor: React.ReactNode }[]; columnas?: 2 | 3 | 4 }) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columnas];
  return (
    <dl className={cx("grid gap-x-6 gap-y-4 text-sm", cols)}>
      {items.map((i) => (
        <div key={i.titulo} className="min-w-0">
          <dt className="text-xs font-medium leading-4 tracking-normal text-slate-500">{i.titulo}</dt>
          <dd className="mt-1 break-words text-slate-900">{i.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

// ------------------------------------------------------------------ estados

export const TONOS = {
  neutro: "bg-slate-100 text-slate-700 ring-slate-200",
  azul: "bg-marca-50 text-marca-700 ring-marca-200",
  verde: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ambar: "bg-amber-50 text-amber-800 ring-amber-200",
  rojo: "bg-red-50 text-red-700 ring-red-200",
  violeta: "bg-violet-50 text-violet-700 ring-violet-200",
} as const;

export type Tono = keyof typeof TONOS;

export function Insignia({ tono = "neutro", icono: Icono, children }: { tono?: Tono; icono?: LucideIcon; children: React.ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", TONOS[tono])}>
      {Icono && <Icono aria-hidden className="size-3" />}
      {children}
    </span>
  );
}

/**
 * Estado vacío. `compacto` es para usarlo dentro de una tarjeta (sin borde propio).
 */
export function EstadoVacio({
  icono: Icono,
  titulo,
  descripcion,
  children,
  compacto,
}: {
  icono: LucideIcon;
  titulo: string;
  descripcion?: React.ReactNode;
  children?: React.ReactNode;
  compacto?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center text-center",
        compacto ? "px-5 py-8" : "rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12",
      )}
    >
      <span
        className={cx(
          "mb-3 flex items-center justify-center rounded-full bg-marca-50 text-marca-600 ring-8 ring-marca-50/50",
          compacto ? "size-10" : "size-12",
        )}
      >
        <Icono aria-hidden className="size-5" />
      </span>
      <p className="text-sm font-semibold text-slate-900">{titulo}</p>
      {descripcion && <p className="mt-1 max-w-sm text-sm text-slate-500">{descripcion}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Esqueleto({ className = "h-32" }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-xl bg-slate-200/70", className)} />;
}

/** Cuerpo de carga accesible para fallbacks de Suspense. */
export function Cargando({ alto = "h-64", texto = "Cargando…" }: { alto?: string; texto?: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{texto}</span>
      <Esqueleto className={alto} />
    </div>
  );
}

export function BarraProgreso({ valor, tono = "azul", etiqueta }: { valor: number; tono?: "azul" | "verde" | "ambar"; etiqueta: string }) {
  const pct = Math.max(0, Math.min(100, valor));
  const color = { azul: "bg-marca-600", verde: "bg-emerald-500", ambar: "bg-amber-500" }[tono];
  return (
    <div
      role="progressbar"
      aria-label={etiqueta}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
    >
      <div className={cx("h-full rounded-full transition-[width]", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Tarjeta de indicador (KPI). */
export function Indicador({
  titulo,
  valor,
  detalle,
  icono: Icono,
  tono = "azul",
  href,
}: {
  titulo: string;
  valor: React.ReactNode;
  detalle?: React.ReactNode;
  icono: LucideIcon;
  tono?: Tono;
  href?: string;
}) {
  const contenido = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm leading-5 font-medium text-slate-500">{titulo}</p>
        <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset", TONOS[tono])}>
          <Icono aria-hidden className="size-4" />
        </span>
      </div>
      <p className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{valor}</p>
      {detalle && <p className="mt-auto truncate pt-1 text-xs text-slate-500">{detalle}</p>}
    </>
  );
  // Alto uniforme: todas las tarjetas de una fila miden lo mismo aunque no tengan detalle.
  const clase = "flex h-full min-h-28 flex-col rounded-xl border border-slate-200/80 bg-white p-4 shadow-tarjeta";
  return href ? (
    <Link href={href} className={cx(clase, "transition hover:-translate-y-px hover:border-marca-300 hover:shadow-elevada")}>
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

/** Iniciales de un nombre o correo, para el avatar. */
export const iniciales = (texto: string) =>
  texto
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

export function Avatar({ texto, chico, className }: { texto: string; chico?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("flex shrink-0 items-center justify-center rounded-full font-semibold", chico ? "size-8 text-[11px]" : "size-9 text-xs", className ?? "bg-marca-100 text-marca-800")}
    >
      {iniciales(texto)}
    </span>
  );
}

/** Función que el plan de la óptica no incluye (la base también la rechaza). */
export function SoloProfesional({ children, compacto }: { children?: React.ReactNode; compacto?: boolean }) {
  if (compacto) return <Insignia tono="violeta" icono={Gem}>Disponible en plan Profesional</Insignia>;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm text-violet-900">
      <Gem aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">Disponible en plan Profesional</p>
        {children && <div className="text-violet-800">{children}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tablas

export function Tabla({ children, pie }: { children: React.ReactNode; pie?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-tarjeta">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm [&_tbody_tr]:transition-colors">{children}</table>
      </div>
      {pie && <div className="border-t border-slate-200 bg-slate-50/50 px-4 py-3">{pie}</div>}
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cx("border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-medium leading-4 tracking-normal whitespace-nowrap text-slate-600", className)}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cx("border-t border-slate-100 px-4 py-3 align-middle text-slate-700 [tr:first-child>&]:border-t-0", className)}>{children}</td>;
}

// ------------------------------------------------------------------ filtros

/**
 * Formulario GET de filtros de un listado (funciona sin JavaScript). La grilla la decide
 * cada página con `className` (p. ej. "sm:grid-cols-2 lg:grid-cols-6").
 */
export function BarraFiltros({ children, className, etiqueta = "Filtros" }: { children: React.ReactNode; className?: string; etiqueta?: string }) {
  return (
    <form role="search" aria-label={etiqueta} className={cx("grid gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-tarjeta", className)}>
      {children}
    </form>
  );
}

/** Caja de búsqueda con lupa, para usar dentro de BarraFiltros. */
export function Buscador({
  nombre = "q",
  etiqueta = "Buscar",
  className,
  ...resto
}: { nombre?: string; etiqueta?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "type">) {
  const id = resto.id ?? `buscar-${nombre}`;
  return (
    <div className={cx("relative", className)}>
      <label htmlFor={id} className="sr-only">
        {etiqueta}
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input {...resto} id={id} type="search" name={nombre} className={cx(claseControl, "h-10 pl-9")} />
    </div>
  );
}

/** Conmutador segmentado por enlaces (vista tabla/tablero, activos/archivados…). */
export function Segmentado({
  etiqueta,
  items,
}: {
  etiqueta: string;
  items: { href: string; texto: string; activo: boolean; icono?: LucideIcon }[];
}) {
  return (
    <div role="group" aria-label={etiqueta} className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5">
      {items.map(({ href, texto, activo, icono: Icono }) => (
        <Link
          key={href}
          href={href}
          aria-current={activo ? "true" : undefined}
          className={cx(
            "inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium leading-5 transition-colors",
            activo ? "bg-white text-marca-800 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900",
          )}
        >
          {Icono && <Icono aria-hidden className="size-4" />}
          {texto}
        </Link>
      ))}
    </div>
  );
}

/** Paginación por enlaces (funciona sin JavaScript). */
export function Paginacion({
  pagina,
  total,
  porPagina,
  href,
}: {
  pagina: number;
  total: number;
  porPagina: number;
  href: (pagina: number) => string;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hasta = Math.min(total, pagina * porPagina);
  const enlace = (p: number, etiqueta: string, Icono: LucideIcon, deshabilitado: boolean) =>
    deshabilitado ? (
      <span aria-disabled className={cx(claseBoton("secundario", "sm"), "opacity-50")}>
        <Icono aria-hidden className="size-4" />
        <span className="sr-only sm:not-sr-only">{etiqueta}</span>
      </span>
    ) : (
      <Link href={href(p)} className={claseBoton("secundario", "sm")}>
        <Icono aria-hidden className="size-4" />
        <span className="sr-only sm:not-sr-only">{etiqueta}</span>
      </Link>
    );

  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-3 text-sm text-slate-500">
      <p>
        {total === 0 ? "Sin resultados" : (
          <>
            <span className="font-medium text-slate-700">{desde}</span>–<span className="font-medium text-slate-700">{hasta}</span> de{" "}
            <span className="font-medium text-slate-700">{total}</span>
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        {enlace(pagina - 1, "Anterior", ChevronLeft, pagina <= 1)}
        <span className="tabular-nums">
          {pagina} / {paginas}
        </span>
        {enlace(pagina + 1, "Siguiente", ChevronRight, pagina >= paginas)}
      </div>
    </nav>
  );
}

/** Filtros en forma de pestañas (enlaces, funcionan sin JavaScript). */
export function Pestanas({ items, etiqueta }: { items: { href: string; texto: string; activo: boolean }[]; etiqueta: string }) {
  return (
    <nav aria-label={etiqueta} className="-mx-1 overflow-x-auto px-1">
      <ul className="flex min-w-max gap-1 border-b border-slate-200">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={i.activo ? "page" : undefined}
              className={cx(
                "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 py-2 text-sm font-medium leading-5 whitespace-nowrap",
                i.activo ? "border-marca-700 text-marca-800" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
              )}
            >
              {i.texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
