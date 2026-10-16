# OptiPedidos

Sistema de gestión para ópticas: pacientes, recetas, órdenes de trabajo al laboratorio, laboratorios,
ventas con metas mensuales y aviso por WhatsApp cuando los lentes están listos.

- **Next.js 16** (App Router, Server Actions, Cache Components) + **React 19** + **Tailwind CSS 4**
- **Supabase**: Auth, PostgreSQL con RLS, Edge Functions
- Multiempresa: cada óptica ve solo sus datos; la base de datos lo garantiza con RLS.

## Puesta en marcha local

Requisitos: Node.js 20+, Docker Desktop abierto.

```bash
npm install
npx supabase start          # base local + Auth + Edge Functions (aplica las migraciones)
npm run dev                 # http://localhost:3000
```

`.env.local` necesita `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (los muestra `npx supabase status`).

Migraciones nuevas sobre una base local con datos: `npx supabase migration up --local` (no borra datos).
`npx supabase db reset` reconstruye la base desde cero **y borra todos los datos locales**.

## Pruebas

```bash
npm test            # todo: base de datos + API + unitarias
npm run test:db     # pgTAP: RLS, reglas de negocio, órdenes, ventas, avisos, administración, inventario
npm run test:api    # Vitest: aislamiento por la API REST real (requiere Supabase local) y unitarias
```

Las pruebas usan datos ficticios: pgTAP revierte todo; las de API crean usuarios `@prueba.test`.

## Estructura

```
src/app/(acceso)/        ingresar, registro (Server Actions de Auth)
src/app/panel/           app autenticada: panel, órdenes, pacientes, inventario, laboratorios, ventas, administración
src/components/          sistema de diseño (ui.tsx: presentación; formulario.tsx: controles y diálogos)
src/lib/sesion.ts        usuario, óptica actual, exigirOptica(), exigirPermiso()
src/lib/permisos.ts      matriz de permisos por rol (módulo puro, también usado en el cliente)
src/lib/datos/           lecturas por módulo (siempre filtradas por la óptica actual + RLS)
src/lib/validacion/      esquemas zod alineados con las restricciones de la base
src/lib/ordenes/         estados de las órdenes y su mapeo comercial
src/proxy.ts             renueva la sesión y redirige rutas privadas (Next 16: "proxy" = middleware)
supabase/migrations/     esquema versionado (ver abajo)
supabase/functions/      Edge Function enviar-whatsapp (Deno)
supabase/tests/database/ pruebas pgTAP
tests/                   pruebas Vitest (api/, unit/)
```

## Migraciones

| Versión | Contenido |
|---|---|
| `20261014185231_esquema_inicial` | Ópticas, miembros, pacientes, laboratorios, recetas, órdenes, historial, observaciones, auditoría, RLS |
| `20261014200000_correcciones_integridad` | Autor fijado por el servidor, receta reemplazada en la misma óptica, anular receta no bloquea órdenes |
| `20261016000000_ordenes_flujo_comercial` | Estado comercial, atajos a "listo para entrega", `crear_orden()` y `actualizar_orden_borrador()` atómicas, `miembros_optica()`, índices |
| `20261016100000_ventas_metas` | Precio, descuento y fecha de confirmación en órdenes; tabla `metas_ventas`; `ventas_mensuales()` y `ventas_del_dia()` |
| `20261016200000_notificaciones_whatsapp` | Consentimiento del paciente, tabla `notificaciones`, encolado automático, reintento, reclamo atómico |
| `20261016300000_administracion_miembros` | `agregar_miembro()` por correo y protección del último propietario |
| `20261017000000_inventario_lunas` | Productos, variantes por medida exacta, movimientos, reservas, compras masivas, inventario físico, vista de existencias |
| `20261017100000_orden_pagos` | Tabla `orden_pagos` (adelantos y saldo), control de saldo, anulación con motivo |
| `20261017200000_caja_saldos` | Columna calculada `saldo` de cada orden y `caja_del_dia()` |
| `20261018000000_sedes` | Tablas `sedes` y `miembro_sedes`, `sede_id` en pedidos, stock, caja, metas y avisos, RLS por sede, informes por sede y `reporte_consolidado()` |

Ninguna migración borra tablas, columnas ni datos. La 0004 rellena `confirmada_en` de órdenes ya confirmadas
desde su historial.

## Órdenes de trabajo

El enum `estado_orden` no cambió. La interfaz muestra el **estado comercial**; el interno se conserva como detalle.
El mapeo existe en la base (`estado_comercial()`) y en `src/lib/ordenes/estados.ts`.

| Estado comercial | Estados internos |
|---|---|
| Venta iniciada | `borrador` |
| En el laboratorio | `enviada`, `recibida_lab`, `en_proceso`, `lista` |
| Listo para entrega | `recibida_optica` (dispara el aviso por WhatsApp) |
| Entregado | `entregada` |
| Anulado | `anulada` (con motivo obligatorio) |

- Las transiciones válidas están en la tabla `transiciones_estado`; la base rechaza cualquier otra y registra cada
  cambio en `orden_historial_estados` con el usuario. La 0003 agregó atajos de cualquier subestado de laboratorio a
  "Listo para entrega".
- Solo las órdenes en venta iniciada se editan (cabecera, lentes e importes). La graduación se copia de la receta al
  crear la orden y no cambia.
- **Atrasada**: la fecha prometida ya pasó y el trabajo aún no llega a la óptica (venta iniciada o en laboratorio).
  Las listas para entrega no cuentan como atrasadas: esperan al paciente.

## Ventas y metas

- Importes en **soles (PEN), IGV incluido**.
- **Venta = precio − descuento** de órdenes **confirmadas** (salieron de venta iniciada) y **no anuladas**, contadas en
  el **mes de confirmación** (hora de Lima). Si una orden vuelve a venta iniciada deja de contar; anularla equivale a
  una devolución.
- Una meta por óptica y mes (`unique`); no se borran. Desde la app solo se editan metas del mes actual o futuros:
  las de meses cerrados quedan como historial.
- La meta se mide por venta confirmada, **no por dinero cobrado**: los pagos no la afectan.

## Pagos de las órdenes

- `orden_pagos` registra cada cobro (adelanto o saldo): importe > 0, medio (`efectivo`, `tarjeta`, `transferencia`,
  `yape_plin`), fecha de Lima (hoy o antes) y autor fijado por el servidor.
- **Saldo = (precio − descuento) − pagos vigentes.** La base rechaza un pago que supere el saldo (bloqueando la orden,
  así dos cobros simultáneos tampoco lo superan) y no deja bajar el importe de una orden por debajo de lo ya pagado.
- Los pagos no se editan ni se borran: se **anulan con motivo** (el servidor guarda cuándo y quién) y se registra
  otro si hace falta. Altas y anulaciones quedan en `auditoria`. Cualquier miembro de la óptica cobra y anula.
- Se cobra desde venta iniciada (adelanto) hasta la entrega; no en órdenes anuladas, cuyos pagos sí se pueden anular
  como devolución. Al entregar con saldo pendiente, la confirmación lo advierte (no lo impide).
- `saldo(ordenes)` es una columna calculada de PostgREST (`select=saldo`, filtro `saldo=gt.0`). La lista y el tablero
  de órdenes marcan «Saldo S/ X» en las no anuladas con saldo y tienen el filtro «Con saldo pendiente».
- **Caja del día** (`caja_del_dia()`, solo propietario y administrador): pagos vigentes con fecha de hoy (Lima) por
  medio de pago, más el saldo pendiente total de las órdenes no anuladas. Es dinero cobrado, no venta: la meta no cambia.

## Inventario de lunas

Stock por **combinación exacta** de medida, en **lunas sueltas** (la interfaz muestra también el equivalente en pares).

| Tabla | Contenido |
|---|---|
| `lunas_productos` | Tipo de luna sin medida: nombre, tipo, material, índice, tratamiento y color del AR, visión (monofocal, bifocal, progresivo, ocupacional), superficie, control por lado, proveedor, costo y mínimo por defecto |
| `lunas_variantes` | Una fila por medida exacta (`unique nulls not distinct` de producto + esfera + cilindro + eje + adición + lado), con `stock`, `reservado`, `stock_minimo` y `ubicacion` |
| `inventario_operaciones` | Cabecera de compras, inventarios físicos y ajustes (proveedor, documento, fecha, responsable) |
| `inventario_movimientos` | Registro inmutable de entradas y salidas con stock anterior y resultante, motivo, lote, costo y usuario |
| `inventario_reservas` | Lunas apartadas para el OD o el OI de una orden |
| `lunas_existencias` (vista) | Existencias con `disponible = stock − reservado` y estado (`ok`, `bajo`, `agotado`) |

Reglas, todas aplicadas en la base:

- El stock **solo cambia con movimientos**: un trigger bloquea la variante, valida y guarda el stock resultante. La API
  no puede escribir `stock` ni `reservado`. Un movimiento afecta solo a su medida.
- **Sin stock negativo** y sin dejar reservas sin respaldo, salvo autorización explícita de propietario o administrador.
- **Compras**: `registrar_compra()` registra muchas medidas en una sola operación atómica y crea las medidas que no
  existan. En la app se cargan en una **matriz esfera × cilindro** (o × adición en multifocales), con varios
  productos por compra.
- Cualquier miembro registra compras, ventas, pérdidas y devoluciones. Los **ajustes** y el **inventario físico**
  (`registrar_conteo()`) son solo de propietario o administrador y quedan con motivo y usuario.
- **Cilindro negativo**: el stock se guarda con cilindro ≤ 0. Una receta en cilindro positivo se transpone
  (esfera + cilindro, −cilindro, eje ± 90°) antes de buscar, porque es la misma luna óptica. La interfaz lo indica.
- **Órdenes**: para cada ojo se busca la medida exacta del producto elegido. Si no existe o no hay stock, se informa
  ("solicitar al proveedor") y las alternativas aparecen solo como **sugerencias** que el usuario debe confirmar.
  Al **reservar** (venta iniciada) se aparta la luna; al **enviar al laboratorio** se descuenta (movimiento de
  consumo); si se **anula** en venta iniciada se libera; si **vuelve** a venta iniciada se repone con una devolución.
  Una orden anulada después de enviarse no repone stock sola (las lunas pueden estar cortadas): se registra una
  devolución manual si vuelven.
- **Reposición**: cada medida tiene su mínimo; el panel y la pestaña Reposición avisan cuando el disponible llega al
  mínimo o se agota. Las existencias filtradas se exportan a **Excel (.xlsx)**.
- El eje se guarda solo si el producto lo requiere. La carga por matriz registra medidas sin eje (lunas terminadas,
  donde el eje se da al biselar).

## Sedes

Jerarquía: **óptica (empresa) → sedes → usuarios**.

- **De toda la óptica**: pacientes, recetas, laboratorios y catálogo de lunas (un paciente se atiende en cualquier sede).
- **De una sede** (`sede_id` obligatorio): pedidos y sus pagos, avisos y reservas; stock de lunas (variantes,
  compras, conteos, movimientos); metas. La sede de un registro no cambia nunca.
- El lente se recoge **siempre en la sede donde se vendió**: el ticket muestra sus datos y el aviso por WhatsApp sale
  del número de esa sede (`sedes.whatsapp_phone_number_id`, o el secreto `WHATSAPP_PHONE_NUMBER_ID` si está vacío).
- Acceso (`tiene_sede()`): el propietario ve todas; administradores y vendedores, las asignadas en `miembro_sedes`.
  Lo aplican las políticas RLS de cada tabla y triggers (`f_sede_asignar`, `f_sede_heredar`) que validan la sede al
  crear: nadie registra en una sede ajena aunque llame directo a la API. Pagos, avisos y movimientos heredan la sede
  del pedido o de la medida; un pedido solo reserva lunas del stock de su sede.
- Las sedes no se borran: se desactivan (sin pedidos, compras ni metas nuevas; el historial se conserva). Siempre
  queda una activa. Toda óptica nueva nace con su «Sede principal»; con una sola sede, los miembros nuevos quedan
  asignados a ella y la base la usa si no se indica otra.
- La migración 0010 creó una «Sede principal» por óptica existente, con todos sus registros y miembros.
- **Selector de sede** arriba (cookie validada en el servidor): solo lista las sedes del usuario y, con más de una,
  «Todas mis sedes» para consultar. Para registrar hay que tener una sede concreta elegida.
- **Consolidado** (Ventas y metas, solo propietario): ventas, pedidos, metas, cobros y saldos del mes por sede y total.
- Pantalla **Administración → Sedes**: el propietario crea y desactiva sedes y asigna usuarios; el administrador
  edita los datos de contacto de sus sedes.

## Roles y permisos

Se comprueban en la interfaz, en cada Server Action y en la base (RLS y funciones `SECURITY DEFINER` con
verificación de rol). El rol `operador` se muestra como **Vendedor**. Salvo el propietario, cada persona solo ve
y registra datos de sus sedes asignadas.

| | Propietario | Administrador | Vendedor |
|---|:-:|:-:|:-:|
| Pacientes, recetas, órdenes, laboratorios | ✓ | ✓ | ✓ |
| Inventario: compras, ventas, pérdidas, devoluciones, reservas | ✓ | ✓ | ✓ |
| Inventario: ajustes, inventario físico, stock negativo | ✓ | ✓ | — |
| Precio de cada orden | ✓ | ✓ | ✓ |
| Ventas totales, informes y metas | ✓ | ✓ | — |
| Datos de la óptica, auditoría | ✓ | ✓ | — |
| Agregar miembros, cambiar roles, quitar acceso | ✓ | — | — |
| Crear y desactivar sedes, asignar usuarios a sedes | ✓ | — | — |
| Editar datos de contacto y WhatsApp de la sede | ✓ | sus sedes | — |
| Consolidado de todas las sedes | ✓ | — | — |

Para sumar a alguien: la persona crea su cuenta y el propietario la agrega con ese correo en **Administración**.
La óptica siempre conserva al menos un propietario activo.

## Aviso por WhatsApp

Cuando una orden pasa a **Listo para entrega**, un trigger encola un aviso en `notificaciones` (uno por orden:
`unique (orden_id, tipo)`). Después de responder al usuario, la app invoca la Edge Function `enviar-whatsapp`, que:

1. comprueba con el JWT del usuario (RLS) que el aviso es de su óptica;
2. lo reclama de forma atómica (`pendiente → enviando`), lo que evita envíos duplicados;
3. envía la plantilla aprobada por la **API oficial de WhatsApp Business (Meta Cloud API)**;
4. guarda el resultado: enviado (con el id del mensaje) o fallido (con el error), con intentos y fechas.

Si falta el consentimiento del paciente o su teléfono no es un celular válido de Perú, el aviso queda
**No enviado** con el motivo. Ningún fallo bloquea el cambio de estado. Los avisos fallidos u omitidos se
**reintentan** desde la orden, y el reintento vuelve a revisar el teléfono y el consentimiento.

### Configuración pendiente (necesaria para enviar mensajes reales)

1. En [Meta for Developers](https://developers.facebook.com/), crea una app de tipo Business con el producto
   WhatsApp y registra el número de la óptica.
2. Crea y envía a aprobación una plantilla **Utilidad**, idioma **Español (es)**, nombre `lentes_listos`, con cuerpo:
   `Hola, {{1}}. Te informamos que tus lentes ya están listos para recoger en nuestra óptica. ¡Gracias por confiar en nosotros!`
3. Genera un **token permanente** con un usuario del sistema (permiso `whatsapp_business_messaging`) y copia el
   **Phone number ID**.
4. Guarda los secretos y despliega la función (las credenciales nunca van al frontend ni al repositorio):
   ```bash
   npx supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=...
   npx supabase functions deploy enviar-whatsapp
   ```
   Opcionales: `WHATSAPP_TEMPLATE` (por defecto `lentes_listos`), `WHATSAPP_TEMPLATE_LANG` (por defecto `es`).

En local, copia `supabase/functions/.env.example` a `supabase/functions/.env` (ignorado por git) y reinicia Supabase.

Pendiente a futuro: webhook de Meta para estados de entrega o lectura, y reintentos automáticos programados.

## Producción

1. `npx supabase link --project-ref <ref>` y `npx supabase db push` (aplica las migraciones).
2. Secretos y despliegue de `enviar-whatsapp` (ver arriba).
3. Variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en el hosting de Next.js.
4. En Supabase Auth: `Site URL` y `Redirect URLs` con el dominio real, incluido `/auth/confirmar`, y
   confirmación de correo activada.
5. La clave `service_role` solo vive en la Edge Function (la inyecta Supabase); la app no la usa.
