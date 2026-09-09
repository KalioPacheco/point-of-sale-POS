# M5 — Migración, piloto y activación

## Alcance y contrato

Este procedimiento implementa M5 sin cambiar contratos de producto ni rutas HTTP existentes. Los únicos cambios de datos autorizados son las migraciones append-only `002`/`003`/`004`, los `featureFlags` ya definidos en `Company` y el registro append-only `m5RolloutAudits`. No se borran ni reinterpretan ventas, tickets, cortes, movimientos o promociones históricas. ADR-08 documenta el ajuste interno del índice de inventario requerido para que MongoDB pueda crear la restricción de unicidad.

`m5RolloutAudits` no es una API pública: registra el preflight, huella y firma de una activación o desactivación para auditoría operativa. No contiene secretos; la clave HMAC nunca se persiste.

## Secuencia obligatoria

1. Crear respaldo consistente y probar su restauración en un entorno aislado. Guardar el identificador del respaldo y sus conteos antes de continuar.
2. Publicar el backend compatible. Mantener `multiBranchInventory` y `promotionsV1` apagados para la empresa piloto.
3. Ejecutar `npm run migrate:plan` en la copia restaurada. Corregir cualquier ambigüedad antes de producción.
4. Durante una ventana sin checkout, cortes, recepciones, conteos ni ajustes, aplicar `002`, `003` y `004` con la confirmación explícita de la base. La última crea el índice único de posiciones fuera de la transacción porque MongoDB no permite DDL de índices dentro de ella.
5. Ejecutar el reporte M5. La activación exige cero blockers: una sola `MATRIZ`, atribución histórica completa, saldos y movimientos de apertura exactos, ningún turno abierto, transferencia en tránsito ni diferencia de corte pendiente.
6. Activar inventario para una sola empresa en `MATRIZ`; abrir un turno nuevo y completar el recorrido de piloto. Crear la segunda sucursal y probar una transferencia controlada. Activar promociones sólo después de conciliar inventario y corte.
7. Guardar el JSON firmado de cada reporte junto al identificador del respaldo y la aprobación operativa.

## Comandos

Todos leen `MIGRATION_DATABASE_URL` antes de `DB_CONECTION_DEV`. Nunca imprimir la URI ni la clave de firma.

```bash
npm run migrate:plan
npm run migrate:up -- --apply
npm run m5:report -- --company <companyId>
```

`migrate:up` además requiere `MIGRATION_CONFIRM_DB=<nombre-real-de-base>`. No se debe ejecutar hasta haber completado el respaldo/restauración y la ventana de mantenimiento.

La activación es dry-run por defecto. Para escribir el flag y un registro de auditoría firmado requiere las cuatro confirmaciones:

```bash
M5_CONFIRM_DB=<nombre-real-de-base> \
M5_CONFIRM_COMPANY=<companyId> \
M5_CONFIRM_STAGE=inventory \
M5_REPORT_SIGNING_KEY=<clave-secreta-de-operacion> \
npm run m5:activate -- --company <companyId> --stage inventory --apply
```

Para promociones, repetir el comando con `M5_CONFIRM_STAGE=promotions` y `--stage promotions`. El script rechaza promociones si el inventario del piloto no está activo.

## Conciliación y alertas

Antes de activar inventario, el reporte compara cada posición de `Products.stock`/`variants[].stock` contra `InventoryLevel` de `MATRIZ` y exige un `InventoryMovement(opening_balance)` equivalente. Después de una transferencia, conserva esa evidencia de apertura y compara el saldo legado contra el consolidado de todas las sucursales. También muestra usuarios u operaciones históricas sin atribución de sucursal, turnos abiertos, transferencias en tránsito, diferencias de corte sin aprobación, ventas con promoción y el caso prohibido de cupón más promoción.

Una diferencia bloquea la activación. No se compensa, ajusta ni corrige desde este script: documentar su causa y usar el flujo transaccional de ajuste aprobado.

## Reversión

Antes de cualquier venta, movimiento de inventario o transferencia posterior a la activación, puede apagarse el inventario multi-sucursal:

```bash
M5_CONFIRM_DB=<nombre-real-de-base> \
M5_CONFIRM_COMPANY=<companyId> \
M5_CONFIRM_STAGE=inventory \
M5_REPORT_SIGNING_KEY=<clave-secreta-de-operacion> \
npm run m5:deactivate -- --company <companyId> --stage inventory --apply
```

El script rechaza esa reversión si encuentra ventas, transferencias o movimientos posteriores al registro de activación. En ese caso la reversión requiere movimientos compensatorios aprobados; nunca borrar documentos. Apagar `promotionsV1` sólo detiene aplicaciones nuevas: las ventas ya emitidas conservan su snapshot, por lo que su reversión prospectiva es segura.

## Evidencia de cierre de piloto

- Reporte M5 firmado antes y después de cada etapa, con cero diferencias no explicadas.
- Casos de admin, gerente y vendedor en dos sucursales/dos cajas: venta, devolución, transferencia, recepción, corte, promoción y cupón excluyente.
- Prueba de concurrencia de venta/transferencia/corte y revisión de ticket de 58/80 mm.
- Aprobación de gerente/admin y ausencia de turnos o transferencias de prueba abiertos.
