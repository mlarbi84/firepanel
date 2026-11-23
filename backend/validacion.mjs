// validacion.mjs - entrada de confianza-cero.
//
// Todo lo que viene por la API web pasa por aquí ANTES de tocar `adb shell`,
// `exec` o el filesystem. Si no cumple un patrón explícito, se rechaza.
//
// Reglas:
// - package Android: letras y digitos con puntos, segmentos separados. [a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+ y <= 160 chars
// - id catalogo: letras, digitos, guion y guion_bajo. [a-zA-Z0-9][a-zA-Z0-9_-]{0,80}
// - url remota: URL http(s) parseable con `new URL()` y host ascii.
// - nombre apk: solo letras, digitos, puntos, guiones, guion_bajo. Sin `/`, `..`, ni espacios.

const RE_PKG = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const RE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/;
const RE_NOMBRE_APK = /^[a-zA-Z0-9._-]{1,120}\.apk$/i;

export function validarPkg(pkg) {
  if (typeof pkg !== 'string' || pkg.length > 160 || !RE_PKG.test(pkg)) {
    throw new Error(`package invalido: ${JSON.stringify(pkg)}`);
  }
  return pkg;
}

export function validarId(id) {
  if (typeof id !== 'string' || !RE_ID.test(id)) {
    throw new Error(`id invalido: ${JSON.stringify(id)}`);
  }
  return id;
}

export function validarUrlApk(u) {
  if (typeof u !== 'string' || u.length > 2048) {
    throw new Error(`url invalida: tipo o longitud`);
  }
  let parsed;
  try { parsed = new URL(u); } catch { throw new Error(`url invalida: no parseable`); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`url invalida: solo http(s)`);
  }
  if (!/^[a-z0-9.\-]+$/i.test(parsed.hostname)) {
    throw new Error(`url invalida: hostname sospechoso`);
  }
  return parsed.toString();
}

export function sanitizarNombreApk(nombre) {
  if (typeof nombre !== 'string') nombre = '';
  // reemplazar secuencias problematicas y limitar a basename seguro
  nombre = nombre.replace(/[\/\\]/g, '_').replace(/\s+/g, '_');
  if (!nombre.toLowerCase().endsWith('.apk')) nombre = nombre + '.apk';
  if (!RE_NOMBRE_APK.test(nombre)) {
    throw new Error(`nombre apk invalido`);
  }
  return nombre;
}

// re-exporto los patrones para tests
export const _patrones = { RE_PKG, RE_ID, RE_NOMBRE_APK };
