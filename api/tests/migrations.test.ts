import assert from "node:assert/strict";
import test from "node:test";
import {
  checksumMigrationSql,
  inspectMigrationState,
  validateMigrationNames,
  type MigrationDescriptor,
} from "../database/migrations.js";
import { validateRuntimeDatabasePassword } from "../database/runtime-role.js";

const migration = (name: string, sql = "SELECT 1;"): MigrationDescriptor => ({
  name,
  sql,
  checksum: checksumMigrationSql(sql),
});

test("valida nomenclatura, ordem e continuidade das migrations", () => {
  assert.deepEqual(
    validateMigrationNames(["0002_second.sql", "0001_first.sql"]),
    ["0001_first.sql", "0002_second.sql"],
  );
  assert.throws(
    () => validateMigrationNames(["0001_first.sql", "0003_third.sql"]),
    /Sequência de migrations inválida/,
  );
  assert.throws(
    () => validateMigrationNames(["0001_First.sql"]),
    /Nome de migration inválido/,
  );
});

test("checksum é estável entre checkouts LF e CRLF", () => {
  assert.equal(
    checksumMigrationSql("CREATE TABLE example (\r\n  id uuid\r\n);\r\n"),
    checksumMigrationSql("CREATE TABLE example (\n  id uuid\n);\n"),
  );
  assert.notEqual(
    checksumMigrationSql("SELECT 1;"),
    checksumMigrationSql("SELECT 2;"),
  );
});

test("detecta pendência, backfill e alteração de migration aplicada", () => {
  const first = migration("0001_first.sql");
  const second = migration("0002_second.sql", "SELECT 2;");

  assert.deepEqual(
    inspectMigrationState([first, second], [{ name: first.name, checksum: first.checksum }]),
    { pending: [second], backfill: [] },
  );
  assert.deepEqual(
    inspectMigrationState([first], [{ name: first.name, checksum: null }]),
    { pending: [], backfill: [first] },
  );
  assert.throws(
    () => inspectMigrationState([first], [{ name: first.name, checksum: "0".repeat(64) }]),
    /Checksum divergente/,
  );
});

test("recusa histórico desconhecido ou aplicado fora de ordem", () => {
  const first = migration("0001_first.sql");
  const second = migration("0002_second.sql");

  assert.throws(
    () => inspectMigrationState(
      [first],
      [{ name: "0000_unknown.sql", checksum: "0".repeat(64) }],
    ),
    /não existe no código/,
  );
  assert.throws(
    () => inspectMigrationState(
      [first, second],
      [{ name: second.name, checksum: second.checksum }],
    ),
    /fora de ordem/,
  );
});

test("exige credencial forte para a role de runtime gerenciada", () => {
  assert.throws(
    () => validateRuntimeDatabasePassword("curta"),
    /ao menos 32 caracteres/,
  );
  const password = "runtime-password-with-32-characters!";
  assert.equal(validateRuntimeDatabasePassword(password), password);
});
