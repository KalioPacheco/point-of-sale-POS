# POS API

API del sistema POS con autenticación JWT y aislamiento multiempresa.

## Reglas de aislamiento (multiempresa)

1. El `companyId` **no se recibe del frontend** para operaciones normales de CRUD.
2. El `companyId` se obtiene del token autenticado mediante `helpers/getCompanyId`.
3. Las operaciones de `list`, `update` y `delete` se ejecutan en el scope de la empresa del token.
4. Si un registro no pertenece al scope de empresa, la API debe rechazar la operación.

## Soft-delete

- Las entidades `users`, `userTypes` y `companies` usan eliminación lógica con `disable=true`.
- Los listados solo deben considerar registros con `disable=false`.

## Autenticación y roles

- Login: `POST /users/login` (público)
- Rutas de administración: requieren token JWT y rol `admin`.

## Endpoints

### Users

Base: `/users`

- `POST /login`
  - Body: `{ "userName": string, "password": string }`
  - Respuesta: token JWT y datos de usuario.

- `GET /`
  - Auth: JWT
  - Devuelve usuarios del scope de empresa del token.

- `GET /:userId`
  - Auth: JWT
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
  - Auth: JWT
  - Lista tipos de usuario del scope de empresa.

- `GET /:typeId`
  - Auth: JWT
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

## Formato general de respuesta

Salvo login/registro, la API usa envelope:

- success: `{ "error": "", "body": any }`
- error: `{ "error": string, "body": "" }`
