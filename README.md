# POS API

API del sistema POS con autenticación JWT y aislamiento multiempresa.

## Reglas de aislamiento (multiempresa)

1. El `companyId` **no se recibe del frontend** para operaciones normales de CRUD.
2. El `companyId` se obtiene del token autenticado mediante `helpers/getCompanyId`.
3. Las operaciones de `list`, `update` y `delete` se ejecutan en el scope de la empresa del token.
4. Si un registro no pertenece al scope de empresa, la API debe rechazar la operación.

## Soft-delete

- Las entidades `users`, `userTypes`, `companies` y `customer` usan eliminación lógica con `disable=true`.
- Los listados solo deben considerar registros con `disable=false`.

## Autenticación y roles

- Login: `POST /users/login` (público)
- `vendedor`: POS, catálogo de lectura, clientes sin eliminación, turno propio y tickets propios.
- `manager`: catálogo, inventario, cupones, movimientos, cortes, reportes y devoluciones.
- `admin`: capacidades de manager más usuarios, empresa, impuestos y compatibilidad de tipos de usuario.
- `userTypes` y `privileges` son compatibilidad legado; la autorización efectiva usa `role`.

## Endpoints

### Users

Base: `/users`

- `POST /login`
  - Body: `{ "userName": string, "password": string }`
  - Respuesta: token JWT y datos de usuario.

- `GET /`
  - Auth: JWT + `admin`
  - Devuelve usuarios del scope de empresa del token.

- `GET /:userId`
  - Auth: JWT + `admin`
  - Devuelve usuario del scope de empresa del token.

- `POST /`
  - Auth: JWT + `admin`
  - Body (create):
    - `userName` (requerido)
    - `password` (requerido, no vacío)
    - `userTypeId` (opcional)
    - `disable` (opcional)
  - Nota: `companyId` se toma del token.

- `PATCH /:userId`
  - Auth: JWT + `admin`
  - Body (update):
    - `userName` (opcional)
    - `userTypeId` (opcional)
    - `disable` (opcional)
  - Nota: `companyId` se toma del token para validar ownership.

- `DELETE /:userId`
  - Auth: JWT + `admin`
  - Soft-delete (`disable=true`) en el scope de la empresa.

### User Types

Base: `/userTypes`

- `GET /`
  - Auth: JWT + `admin`
  - Lista tipos de usuario del scope de empresa.

- `GET /:typeId`
  - Auth: JWT + `admin`
  - Obtiene tipo de usuario del scope de empresa.

- `POST /`
  - Auth: JWT + `admin`
  - Body:
    - `name` (requerido)
  - Nota: `companyId` se toma del token.

- `PATCH /:typeId`
  - Auth: JWT + `admin`
  - Body:
    - `name` (requerido)
  - Nota: valida ownership por empresa.

- `DELETE /:typeId`
  - Auth: JWT + `admin`
  - Soft-delete (`disable=true`) en scope.

### Companies

Base: `/companies`

- `GET /`
  - Auth: JWT + `admin`
  - Lista solo la empresa del scope del token.

- `GET /:companyId`
  - Auth: JWT + `admin`
  - Solo permite consultar la empresa del scope del token.

- `POST /`
  - Auth: JWT + `admin`
  - Body:
    - `name` (requerido)
    - `rfc` (opcional)
    - `address` (opcional)
  - `createdBy` se toma del usuario autenticado.

- `PATCH /:companyId`
  - Auth: JWT + `admin`
  - Solo permite actualizar la empresa del scope del token.

- `DELETE /:companyId`
  - Auth: JWT + `admin`
  - Soft-delete (`disable=true`) solo en scope.

### Tickets

Base: `/tickets`

- `GET /`
  - Auth: JWT + `admin|manager`
  - Lista tickets del scope de empresa del token.

### Customers

Base: `/customer`

- `GET /`
  - Auth: JWT + `admin|manager|vendedor`
  - Lista clientes activos del scope de empresa.

- `GET /:customerId`
  - Auth: JWT + `admin|manager|vendedor`
  - Obtiene cliente activo por ID en scope.

- `POST /`
  - Auth: JWT + `admin|manager|vendedor`
  - Body:
    - `name` (requerido)
    - `email` (opcional, válido)
    - `phone` (opcional)
    - `rfc` (opcional)
    - `address.street` (opcional)
  - Nota: `company` y `createdBy` se toman del token.

- `PATCH /:customerId`
  - Auth: JWT + `admin|manager|vendedor`
  - Actualiza datos del cliente en scope de empresa.

- `DELETE /:customerId`
  - Auth: JWT + `admin|manager`
  - Soft-delete (`disable=true`) en scope.

## Quality gates

Frontend and backend workflows run lint, typecheck, tests and build on pushes and
pull requests. Backend CI also starts MongoDB as a replica set and runs the E2E
checkout, tenant and role matrix without production credentials.

## Database migrations

See [MIGRATIONS.md](MIGRATIONS.md). Always run `npm run migrate:plan` before
applying and explicitly confirm the target database name.

## Formato general de respuesta

La API usa un envelope compatible con código y correlación:

- success: `{ "error": "", "body": any, "requestId": string }`
- error: `{ "error": string, "code": string, "message": string, "details"?: array, "body": "", "requestId": string }`

Los errores de validación responden `422`; conflictos de estado o duplicados `409`;
recursos inexistentes `404`; y los errores internos no exponen detalles sensibles.
