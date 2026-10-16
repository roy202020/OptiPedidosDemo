import Link from "next/link";

/** Título de página con acciones a la derecha y enlace opcional para volver. */
export function Encabezado({
  titulo,
  subtitulo,
  volver,
  children,
}: {
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  volver?: { href: string; texto: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {volver && (
        <Link href={volver.href} className="mb-2 inline-block text-sm text-sky-700 hover:underline dark:text-sky-400">
          ← {volver.texto}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          {subtitulo && <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitulo}</p>}
        </div>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  );
}

const BOTON = {
  primario: "bg-sky-700 text-white hover:bg-sky-800",
  secundario:
    "border border-zinc-300 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800",
};

export function EnlaceBoton({
  href,
  variante = "secundario",
  children,
}: {
  href: string;
  variante?: keyof typeof BOTON;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-medium ${BOTON[variante]}`}>
      {children}
    </Link>
  );
}

export function Boton({
  variante = "secundario",
  className = "",
  ...resto
}: { variante?: keyof typeof BOTON } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-medium disabled:opacity-60 ${BOTON[variante]} ${className}`}
      {...resto}
    />
  );
}

export function Tarjeta({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {children}
    </section>
  );
}

const ETIQUETA = {
  gris: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  verde: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  ambar: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  rojo: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function Etiqueta({ color = "gris", children }: { color?: keyof typeof ETIQUETA; children: React.ReactNode }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${ETIQUETA[color]}`}>{children}</span>;
}

export function Cargando({ alto = "h-32" }: { alto?: string }) {
  return <div className={`${alto} animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800`} />;
}
