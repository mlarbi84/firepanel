// node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarPkg, validarId, validarUrlApk, sanitizarNombreApk } from '../validacion.mjs';

test('validarPkg acepta packages Android reales', () => {
  for (const p of [
    'org.jellyfin.androidtv',
    'com.lagradost.cloudstream3',
    'com.teamsmart.videomanager.tv',
    'org.xbmc.kodi',
    'org.videolan.vlc',
    'com.foo.bar.baz',
    'a.b',
    'com.example.app_name',
  ]) {
    assert.equal(validarPkg(p), p, `debe aceptar ${p}`);
  }
});

test('validarPkg rechaza intentos de inyeccion shell', () => {
  for (const p of [
    'com.foo;rm -rf /',
    'com.foo && echo pwn',
    'com.foo`id`',
    'com.foo$(whoami)',
    'com.foo|cat /etc/passwd',
    'com.foo\nsudo id',
    '../../../etc/passwd',
    'com.foo bar',
    '',
    'sincabecera',
    '.com.foo',
    'com.1foo',
    'a'.repeat(200),
    null,
    undefined,
    123,
    { pkg: 'com.foo' },
  ]) {
    assert.throws(() => validarPkg(p), /package invalido/, `debe rechazar ${JSON.stringify(p)}`);
  }
});

test('validarId acepta ids del catalogo', () => {
  for (const id of ['stremio', 'smart-youtube-tv', 'kodi', 'vlc', 'jellyfin-tv', 'a', 'my_app_1', '0']) {
    assert.equal(validarId(id), id);
  }
});

test('validarId rechaza ids malformados', () => {
  for (const id of ['', '-foo', 'foo bar', 'foo/bar', 'foo;rm', '-', 'a'.repeat(120), null, 42]) {
    assert.throws(() => validarId(id), /id invalido/);
  }
});

test('validarUrlApk acepta http/https validas', () => {
  for (const u of [
    'https://github.com/foo/bar/releases/download/v1/app.apk',
    'http://localhost:8080/pkg.apk',
    'https://get.videolan.org/vlc-android/last/VLC.apk',
  ]) {
    assert.equal(validarUrlApk(u), u);
  }
});

test('validarUrlApk rechaza esquemas no http y urls no parseables', () => {
  for (const u of [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,hola',
    'ftp://foo.com/x.apk',
    'notaurl',
    '',
    'https://evil\u0000host/x.apk',
    'a'.repeat(3000),
  ]) {
    assert.throws(() => validarUrlApk(u), /url invalida/);
  }
});

test('sanitizarNombreApk limpia separadores y fuerza .apk', () => {
  assert.equal(sanitizarNombreApk('mi app.apk'), 'mi_app.apk');
  assert.equal(sanitizarNombreApk('../etc/passwd'), '.._etc_passwd.apk');
  assert.equal(sanitizarNombreApk('simple.apk'), 'simple.apk');
});

test('sanitizarNombreApk rechaza nombres monstruosos', () => {
  assert.throws(() => sanitizarNombreApk('a'.repeat(200) + '.apk'), /nombre apk invalido/);
});
