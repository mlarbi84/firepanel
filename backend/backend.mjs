// backend.mjs - servidor Node del panel Fire TV.
//
// Arranca con: node backend.mjs
// Escucha en 0.0.0.0:17892 (asi acepta tanto localhost como el tunnel Cloudflare).
//
// Endpoints:
//   GET  /                     -> panel.html
//   GET  /api/catalogo         -> catalogo.json
//   GET  /api/estado           -> [{id, instalada}, ...]
//   GET  /api/stream?op=install&id=stremio    (SSE, logs en vivo)
//   GET  /api/stream?op=uninstall&package=... (SSE)
//   POST /api/launch           -> {package}
//   POST /api/stop             -> {package}
//   POST /api/add              -> {id,nombre,package,url,categoria,descripcion}
//   POST /api/update           -> {id,...campos} actualiza entrada
//   POST /api/delete           -> {id} borra del catalogo
//   GET  /api/health           -> {ok:true}

import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOGO = path.join(__dirname, 'catalogo.json');
const APKS = path.join(__dirname, 'apks');
const PANEL = path.join(__dirname, 'panel.html');
const LOG = path.join(__dirname, 'logs', `${new Date().toISOString().slice(0,10)}.log`);
fs.mkdirSync(APKS, { recursive: true });
fs.mkdirSync(path.dirname(LOG), { recursive: true });

function log(linea) {
  const marca = new Date().toISOString();
  const msg = `[${marca}] ${linea}\n`;
  process.stdout.write(msg);
  fs.appendFileSync(LOG, msg);
}

function leerCatalogo() { return JSON.parse(fs.readFileSync(CATALOGO, 'utf8')); }
function escribirCatalogo(c) { fs.writeFileSync(CATALOGO, JSON.stringify(c, null, 2), 'utf8'); }

function buscarAdb() {
  const candidatos = [
    path.join(os.homedir(), 'AppData/Local/Microsoft/WinGet/Packages'),
  ];
  for (const base of candidatos) {
    try {
      const paquetes = fs.readdirSync(base);
      for (const p of paquetes) {
        if (p.toLowerCase().includes('platformtools')) {
          const sub = path.join(base, p, 'platform-tools', 'adb.exe');
          if (fs.existsSync(sub)) return sub;
          const sub2 = path.join(base, p, 'adb.exe');
          if (fs.existsSync(sub2)) return sub2;
        }
      }
    } catch {}
  }
  return 'adb';
}
const ADB = buscarAdb();
log(`adb: ${ADB}`);

const STICK_DEV = () => {
  const c = leerCatalogo();
  return `${c.stick.ip}:5555`;
};

function adbSync(args, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const proc = spawn(ADB, args);
    let out = '', err = '';
    const to = setTimeout(() => { try { proc.kill(); } catch {} }, timeoutMs);
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    proc.on('close', (code) => {
      clearTimeout(to);
      resolve({ code, out, err });
    });
  });
}

async function conectar() {
  const dev = STICK_DEV();
  const r = await adbSync(['connect', dev]);
  const d = await adbSync(['devices']);
  if (!d.out.includes(`${dev}\tdevice`)) {
    throw new Error(`No puedo conectar con ${dev}. Salida: ${d.out} | ${r.out}`);
  }
  return dev;
}

async function shell(cmd) {
  const dev = STICK_DEV();
  const r = await adbSync(['-s', dev, 'shell', cmd]);
  return r.out.trim();
}

async function appInstalada(pkg) {
  const o = await shell(`pm list packages ${pkg}`);
  return o.split('\n').some(l => l.trim() === `package:${pkg}`);
}

async function descargarApk(id, url, sse) {
  const nombre = `${id}-${path.basename(new URL(url).pathname) || 'app.apk'}`;
  const destino = path.join(APKS, nombre);
  if (fs.existsSync(destino) && fs.statSync(destino).size > 100000) {
    sse?.(`cache: ${nombre} (${(fs.statSync(destino).size/1024/1024).toFixed(1)} MB)`);
    return destino;
  }
  sse?.(`descargando ${url}`);
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (Firefox/120)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al bajar ${url}`);
  const total = Number(res.headers.get('content-length') || 0);
  const fh = fs.createWriteStream(destino);
  let bajados = 0, ultimoAvi = 0;
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fh.write(value);
    bajados += value.length;
    const ahora = Date.now();
    if (ahora - ultimoAvi > 500) {
      ultimoAvi = ahora;
      const pct = total ? Math.round(100 * bajados / total) : 0;
      sse?.(`descargando ${(bajados/1024/1024).toFixed(1)}/${(total/1024/1024).toFixed(1)} MB (${pct}%)`);
    }
  }
  fh.end();
  await new Promise(r => fh.on('finish', r));
  sse?.(`descarga completa (${(bajados/1024/1024).toFixed(1)} MB)`);
  return destino;
}

async function resolverUrl(app, sse) {
  const f = app.fuente;
  if (!f || f.tipo === 'url-directa' || f.tipo === 'manual') return app.url;
  try {
    if (f.tipo === 'github') {
      sse?.(`resolviendo GitHub Releases: ${f.repo}`);
      const r = await fetch(`https://api.github.com/repos/${f.repo}/releases/latest`, {
        headers: { 'User-Agent': 'firepanel' }
      });
      if (!r.ok) throw new Error(`GH API ${r.status}`);
      const d = await r.json();
      const patron = new RegExp(f.patron || '\\.apk$');
      const asset = (d.assets || []).find(a => patron.test(a.name));
      if (!asset) throw new Error(`sin asset que case patron ${f.patron} en ${d.tag_name}`);
      sse?.(`version ${d.tag_name} -> ${asset.name}`);
      return asset.browser_download_url;
    }
    if (f.tipo === 'videolan') {
      // listing HTML de get.videolan.org/vlc-android/last/
      const html = await fetch(`https://get.videolan.org/${f.componente}/last/`).then(r=>r.text());
      const re = new RegExp(`href="([^"]*${f.abi}[^"]*\\.apk)"`);
      const m = html.match(re);
      if (!m) throw new Error('no apk en listing VLC');
      sse?.(`VLC resuelto: ${m[1]}`);
      return `https://get.videolan.org/${f.componente}/last/${m[1]}`;
    }
    if (f.tipo === 'fdroid') {
      // F-Droid repo index - fallback a URL fija del app.url
      return app.url;
    }
  } catch (e) {
    sse?.(`fallo resolver dinamico (${e.message}); uso url fija`);
  }
  return app.url;
}

async function instalar(id, sse) {
  const c = leerCatalogo();
  const app = c.apps.find(a => a.id === id);
  if (!app) throw new Error(`id desconocido: ${id}`);
  if (app.fuente?.tipo === 'manual') {
    throw new Error(`esta app no se descarga sola. ${app.fuente.nota || 'Baja el APK y arrastralo al panel.'}`);
  }
  await conectar();
  sse?.(`stick conectado`);
  if (await appInstalada(app.package)) {
    sse?.(`ya instalada: ${app.package}`);
    return { ok: true, nota: 'ya instalada' };
  }
  const urlFinal = await resolverUrl(app, sse);
  if (!urlFinal) throw new Error('sin url para descargar');
  const apk = await descargarApk(id, urlFinal, sse);
  sse?.(`ejecutando adb install...`);
  const dev = STICK_DEV();
  const res = await adbSync(['-s', dev, 'install', '-r', '-g', apk], 300000);
  const combinado = `${res.out}\n${res.err}`;
  if (combinado.includes('Success')) {
    sse?.(`OK instalada`);
    return { ok: true };
  }
  throw new Error(`fallo adb install: ${combinado.trim().slice(0,400)}`);
}

async function desinstalar(pkg, sse) {
  await conectar();
  sse?.(`stick conectado`);
  const dev = STICK_DEV();
  const res = await adbSync(['-s', dev, 'uninstall', pkg]);
  if (res.out.includes('Success')) { sse?.('desinstalada'); return { ok: true }; }
  throw new Error(res.out + res.err);
}

async function lanzar(pkg) {
  await conectar();
  const r = await shell(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);
  return { ok: !r.toLowerCase().includes('error'), salida: r };
}
async function parar(pkg) {
  await conectar();
  await shell(`am force-stop ${pkg}`);
  return { ok: true };
}

// --------- HTTP ---------
function responderJson(res, obj, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

function abrirSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  const emitir = (ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
  return emitir;
}

async function leerBody(req) {
  const trozos = [];
  for await (const t of req) trozos.push(t);
  const txt = Buffer.concat(trozos).toString('utf8');
  if (!txt) return {};
  try { return JSON.parse(txt); } catch { return {}; }
}

const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ruta = url.pathname;
  const metodo = req.method;
  log(`${metodo} ${ruta}`);

  try {
    if (metodo === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' });
      return res.end();
    }
    if (ruta === '/api/health') return responderJson(res, { ok: true, ts: Date.now(), adb: ADB });
    if (ruta === '/' || ruta === '/panel' || ruta === '/panel.html') {
      const html = fs.readFileSync(PANEL, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    if (ruta === '/api/catalogo' && metodo === 'GET') return responderJson(res, leerCatalogo());
    if (ruta === '/api/estado' && metodo === 'GET') {
      await conectar();
      const c = leerCatalogo();
      const estado = [];
      for (const a of c.apps) estado.push({ id: a.id, instalada: await appInstalada(a.package) });
      return responderJson(res, estado);
    }

    if (ruta === '/api/stream') {
      const op = url.searchParams.get('op');
      const emitir = abrirSSE(res);
      const sse = (m) => emitir('log', m);
      try {
        if (op === 'install') {
          const id = url.searchParams.get('id');
          const r = await instalar(id, sse);
          emitir('done', r);
        } else if (op === 'uninstall') {
          const pkg = url.searchParams.get('package');
          const r = await desinstalar(pkg, sse);
          emitir('done', r);
        } else emitir('error', { mensaje: 'op invalido' });
      } catch (e) {
        emitir('error', { mensaje: e.message });
      }
      return res.end();
    }

    if (ruta === '/api/launch' && metodo === 'POST') { const b = await leerBody(req); return responderJson(res, await lanzar(b.package)); }
    if (ruta === '/api/stop' && metodo === 'POST') { const b = await leerBody(req); return responderJson(res, await parar(b.package)); }

    if (ruta === '/api/add' && metodo === 'POST') {
      const b = await leerBody(req);
      if (!b.id || !b.package || !b.url) return responderJson(res, { error: 'faltan id/package/url' }, 400);
      const c = leerCatalogo();
      if (c.apps.some(a => a.id === b.id)) return responderJson(res, { error: 'id ya existe' }, 400);
      c.apps.push({ ...b, categoria: b.categoria || 'otras', descripcion: b.descripcion || '', orden_recomendado: 100 });
      escribirCatalogo(c);
      return responderJson(res, { ok: true });
    }
    if (ruta === '/api/update' && metodo === 'POST') {
      const b = await leerBody(req);
      const c = leerCatalogo();
      const i = c.apps.findIndex(a => a.id === b.id);
      if (i < 0) return responderJson(res, { error: 'id no encontrado' }, 404);
      c.apps[i] = { ...c.apps[i], ...b };
      escribirCatalogo(c);
      return responderJson(res, { ok: true });
    }
    if (ruta === '/api/upload-apk' && metodo === 'POST') {
      // Drag & drop: el body es el APK en bruto. Nombre viene en header X-Filename.
      const nombre = (req.headers['x-filename'] || `subida-${Date.now()}.apk`).toString().replace(/[^a-zA-Z0-9._-]/g,'_');
      const destino = path.join(APKS, `manual-${nombre}`);
      const fh = fs.createWriteStream(destino);
      let bytes = 0;
      for await (const t of req) { fh.write(t); bytes += t.length; }
      fh.end();
      await new Promise(r => fh.on('finish', r));
      log(`upload-apk ${nombre} (${(bytes/1024/1024).toFixed(1)} MB) -> ${destino}`);
      try {
        await conectar();
        const dev = STICK_DEV();
        const r = await adbSync(['-s', dev, 'install', '-r', '-g', destino], 300000);
        const combinado = `${r.out}\n${r.err}`;
        if (combinado.includes('Success')) {
          return responderJson(res, { ok: true, bytes, mensaje: 'instalada' });
        }
        return responderJson(res, { ok: false, bytes, error: combinado.trim().slice(0,400) });
      } catch (e) {
        return responderJson(res, { ok: false, bytes, error: e.message });
      }
    }

    if (ruta === '/api/delete' && metodo === 'POST') {
      const b = await leerBody(req);
      const c = leerCatalogo();
      c.apps = c.apps.filter(a => a.id !== b.id);
      escribirCatalogo(c);
      return responderJson(res, { ok: true });
    }

    responderJson(res, { error: 'ruta no reconocida', ruta }, 404);
  } catch (e) {
    log(`ERROR ${ruta}: ${e.message}`);
    responderJson(res, { error: e.message }, 500);
  }
});

const PUERTO = 17892;
srv.listen(PUERTO, '0.0.0.0', () => log(`listo en http://0.0.0.0:${PUERTO}`));
process.on('SIGINT', () => { log('SIGINT. cierro.'); process.exit(0); });
