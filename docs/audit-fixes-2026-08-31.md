# Cierre local M-03/M-04/M-05/M-06/M-09/M-11/L-01/L-02

Fecha: 2026-08-31. Sin publicar ni tocar datos remotos.

## Identidad y borradores (M-06)

`pos-cart:v2:<empresa>:<usuario>` sustituye `pos-cart`. La clave antigua se elimina sin migrarla: no contiene propietario verificable. La aplicacion empieza con Redux vacio y solo restaura el scope de una sesion vigente. Las mutaciones de sesion emiten un evento sincrono; el evento `storage` cubre cambios desde otra pestaña. La expiracion se comprueba al usar la sesion y cada segundo mientras la aplicacion esta abierta. Las rutas se remontan al cambiar identidad, descartando el preview de cupon, intento de pago y respuestas de la pantalla anterior.

Logout/expiracion vacian la vista pero conservan el borrador para volver a entrar con la misma identidad. Los cupones se vuelven a validar en el servidor y no se recuperan descuentos mock. La caja no forma parte de la clave: el pedido es un borrador del usuario dentro de su empresa; cobrar siempre exige el turno/caja vigente, y cambiar de identidad descarta ese contexto. LocalStorage no cifra datos y no protege contra alguien con acceso al perfil del navegador: usar cuentas de sistema aisladas cuando se requiera confidencialidad ante acceso fisico.

## Fechas y compatibilidad de cupones (M-09)

La UI envia `validFrom` a las 00:00:00.000Z y `expirationDate` a las 23:59:59.999Z. Ambos extremos son inclusivos; el formulario indica UTC. Se conserva el valor al leer/editar. Preview y checkout comparten validacion del modelo y rechazan inicio futuro/fin pasado; el store comprueba el rango completo tambien en actualizaciones parciales.

Legacy sin `validFrom` conserva la elegibilidad anterior (sin restriccion inicial). No requiere una migracion destructiva ni se inventa una fecha inicial a partir de creacion; el formulario legacy muestra creacion como valor inicial sugerido y al guardar pasa a persistir `validFrom`. El test de modelo cubre el caso sin campo y el E2E existente opera cupones legacy. No se ejecuta backfill remoto. Si negocio desea un inicio para promociones legacy, debe definirlo y aplicarlo con el CRUD autorizado. No reescribir las expiraciones historicas: solo nuevas fechas guardadas desde UI adoptan el fin de dia inclusivo.

## Cortes y ventas (M-11/M-04)

`/cashregistercuts` y `/cashregistercuts/reports/general` aceptan `page` (desde 1), `limit` (1–100, default 50), `date`, `startDate`, `endDate`, `cashierId` y `cashRegister`. Las rutas por usuario/caja tambien aplican el rango. Dias sin hora son dias UTC; timestamps requieren Z u offset. Se rechazan fechas imposibles y rango invertido. `$facet` calcula resumen y pagina sobre la misma consulta tenant. Respuesta: `cuts`, `count` de pagina, `total`, `page`, `limit`, `summary` y `filters`. Los totales no dependen de la pagina. Los wrappers por usuario/caja entregan la primera pagina y el resumen completo; usar general con filtros para navegar las siguientes.

Catalogo y listado de ventas aceptan `page`, `limit`, `paginated=true`; devuelven `{items,total,page,limit}` dentro de `body`. Sin `paginated` conservan el array pero ahora esta limitado (50 por defecto, maximo 100): consumidores externos deben adoptar paginacion. Catalogo filtra busqueda/categoria/marca/estado antes de paginar y ordena por nombre/_id. Se eliminan populates de usuario/empresa innecesarios. La consulta dirigida `ids` acepta hasta 100 IDs; el frontend divide carritos mayores en lotes y solo reconcilia de forma autoritativa cuando obtiene todos. Cambiar pagina/filtro no elimina articulos ajenos a la pagina.

El POS pagina 10 productos padre y mantiene sus variantes juntas; la tabla puede navegar las variantes dentro de esa pagina. Productos administrativos pagina directamente en servidor. `/sales/reports?paginated=true` pagina operaciones canonicas de venta/devolucion y agrega estadisticas y top 5 de todo el periodo. La UI no resume la pagina visible. CSV solicita sucesivamente paginas de 100, usando el rango aplicado, y solo descarga tras obtenerlas; no es un snapshot transaccional entre solicitudes si alguien modifica ventas durante la exportacion. Filtros nuevos y cambios de pagina descartan respuestas obsoletas.

Indices de consulta añadidos a modelos: productos company/disable/name/_id; ventas company/disable/createdAt/_id y company/disable/refundInfo.refundedAt; cortes company/disable/cutDate/_id. `syncIndexes` solo se ejecuto sobre la base temporal E2E. Revisar y crear indices de manera controlada en despliegue; nunca ejecutar un sync que elimine indices operativos sin inventario.

## Runtime y entorno (M-03)

Backend requiere DB_CONECTION_DEV MongoDB explicita, JWT_SECRET no placeholder de al menos 32 caracteres y CORS_ORIGINS no vacia; valida TTL JWT y PORT (1–65535, default 3000). No imprime URI ni secreto al fallar. Espera conexion antes de escuchar. `/health/live` acredita proceso, `/health/ready` exige conexion y ping acotado (200/503); `/version` publica solo APP_VERSION y APP_ENV/NODE_ENV. Configurar APP_VERSION con el commit de despliegue. SIGTERM/SIGINT dejan de aceptar solicitudes, drenan conexiones y desconectan Mongo, con deadline de 10 segundos.

Frontend: copiar `.env.example` a archivo local e indicar VITE_API_BASE_URL para el ambiente correspondiente. La compilacion falla si falta; no hay fallback remoto. Desarrollo sin variable usa localhost:3000. Rechaza URL con credenciales/query/fragmento y exige HTTPS excepto loopback. CI compila con URL localhost explicita, sin apuntar a bases operativas. Se debe configurar la variable real en Vercel antes de publicar. No hay credenciales en las plantillas.

## Impuestos y lenguaje (M-05/L-01/L-02)

Los errores fiscales usan `network.error`, preservando Error/code/name al propagarlos desde el store; elimina el wrapper que convertia todo a 400. Se conserva el envelope exitoso anterior. No encontrado 404, duplicado 409, validacion 400/422, inesperado 500 con mensaje publico generico y requestId. Se verifican tambien los permisos existentes.

Filtro POS: «Mostrar productos inactivos»; el boton de agregar sigue deshabilitado para inactivos. Login: controles en español y documento `lang=es`; no muestra credenciales de prueba en ningun ambiente, incluidos desarrollo y produccion. No se agrega una variable VITE con contraseñas: esas variables son publicas. Las cuentas demo deben existir solo en una base/tenant de demo identificados y entregarse fuera del bundle; responsable del ambiente debe inventariarlas, asignar caducidad y desactivarlas al terminar. Esta tarea no inspecciona ni elimina cuentas remotas, y no afirma que existan cuentas demo reales.

## Evidencia y reproduccion

- Backend: `npm run check`: 68 tests, lint, sintaxis y build verdes.
- Frontend: `VITE_API_BASE_URL=http://localhost:3000 npm run check`: 43 tests, lint, TypeScript, build y budget verdes.
- E2E: `AUDIT_NODE=/ruta/node22 python3 scripts/run-audit-e2e.py`. Requiere mongod/mongosh en PATH. El script crea un directorio y puerto locales temporales, inicia replica set, ejecuta 25 E2E, prueba el entrypoint real y destruye solo sus procesos/datos. No reutiliza DB_CONECTION_DEV del entorno ni accede a Atlas.
- Runtime real: readiness 200 con DB; 503 al detenerla; liveness 200; version verificable; SIGTERM exit 0.
- Cortes: 65 del periodo, uno fuera y otro tenant; resumen 650 y diferencia 130 en ambas paginas, sin IDs repetidos.
- Catalogo: 1.000 productos, filtros combinados, conteos y pagina 2 sin repetidos; 60 ventas + devolucion dan 61 operaciones y total neto 590, independiente de pagina.
- Rendimiento: 20 muestras HTTP locales secuenciales, pagina de 25 productos, p95 9,20 ms; JSON 4.566 bytes. Fixture sintetico, no SLO ni prueba de concurrencia productiva. Baseline descargaba el catalogo entero, ahora la respuesta esta acotada por pagina.
- Build: entrada 500,23 kB (gzip 164,15), antes 1.182,18 kB (gzip 358,76). Mayor chunk POS 505,59 kB (gzip 153,05); rutas administrativas cargadas a demanda. Budget mayor chunk reducido de 1.200 a 700 KiB; total 2.200 KiB sin ampliar.
- Login inspeccionado visualmente en navegador local, sin credenciales y con formulario visible. Pruebas de foco por teclado y ausencia de credenciales en configuraciones PROD true/false. Pruebas de POS conservan filtro/polling/cupons reales.

Falta publicar backend y frontend, observar CI remoto y validar el despliegue integrado. No se probaron scanner, impresora, cajon ni recorrido presencial con cajero. No hay aprobacion para manejar dinero real derivada de estas pruebas locales.

## Pantalla de activacion del demo

El 2026-09-04 se agrego `ServiceWakeupGate` al frontend. Debe configurarse en el build demo con `VITE_APP_ENV=demo` y `VITE_SERVICE_WAKEUP_ENABLED=true`. Usa la URL ya validada de `VITE_API_BASE_URL` y consulta `GET /health/ready` sin credenciales. La API existente devuelve 200 solo despues de un ping real a MongoDB; 503, timeout, error de red o respuesta intermedia mantienen la pantalla y disparan otro intento. No existe boton para omitir este gate. En produccion/no-demo queda inactivo.
