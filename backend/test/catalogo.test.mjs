// node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarPkg, validarId, validarUrlApk } from '../validacion.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOGO = path.join(__dirname, '..', 'catalogo-defecto.json');

test('catalogo defecto es JSON valido', () => {
  const raw = fs.readFileSync(CATALOGO, 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw));
});

const cat = JSON.parse(fs.readFileSync(CATALOGO, 'utf8'));

test('cada app del catalogo tiene campos minimos', () => {
  assert.ok(Array.isArray(cat.apps));
  assert.ok(cat.apps.length > 0);
  for (const a of cat.apps) {
    assert.ok(a.id, `falta id en ${JSON.stringify(a)}`);
    assert.ok(a.nombre, `falta nombre en ${a.id}`);
    assert.ok(a.package, `falta package en ${a.id}`);
    assert.ok(a.categoria, `falta categoria en ${a.id}`);
  }
});

test('cada id y package del catalogo pasa la validacion de seguridad', () => {
  for (const a of cat.apps) {
    assert.doesNotThrow(() => validarId(a.id), `id invalido ${a.id}`);
    assert.doesNotThrow(() => validarPkg(a.package), `package invalido ${a.package} en ${a.id}`);
  }
});

test('cada url del catalogo es http(s) parseable (si no es fuente manual)', () => {
  for (const a of cat.apps) {
    if (a.fuente?.tipo === 'manual') continue;
    if (!a.url) continue;
    assert.doesNotThrow(() => validarUrlApk(a.url), `url invalida en ${a.id}`);
  }
});

test('no hay IDs duplicados', () => {
  const ids = cat.apps.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length, 'IDs duplicados');
});

test('no hay packages duplicados', () => {
  const pkgs = cat.apps.map(a => a.package);
  assert.equal(new Set(pkgs).size, pkgs.length, 'packages duplicados');
});
