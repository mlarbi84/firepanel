# firepanel

**Panel web para gestionar tu Fire TV, Android TV o Chromecast rooteado.** Instala apps que Amazon no te deja, lanza, mata, desinstala. Sin tocar el mando. Desde el móvil, el portátil o el navegador.

> Hecho para ti y para quien quiera copiarlo. MIT. Open source. Autohospedado.

![demo](./landing/demo.gif)

## Qué hace

- **Instala APKs** en tu Fire TV / Android TV con un clic (sideload via ADB)
- **Catálogo curado** editable: SmartTube, Jellyfin, CloudStream, Kodi, VLC, NewPipe…
- **Fuentes dinámicas:** cada app se actualiza sola porque el catálogo resuelve la versión más reciente desde GitHub Releases, VideoLAN, etc.
- **Arrastra y suelta** cualquier APK que tengas → se instala
- **Multi-stick:** si tienes varios Fire TV/Android TV en casa los gestionas desde el mismo panel
- **Auto-detecta** sticks en tu red local (scan ADB:5555)
- **Logs en vivo** mientras instala (descarga, progreso, errores)
- **Mobile-first:** diseñado para ir desde el móvil

## Instalación en 1 línea

```bash
docker run -d --name firepanel \
  --network host \
  -v firepanel-data:/data \
  -e FIREPANEL_SCAN=1 \
  --restart unless-stopped \
  ghcr.io/mlarbi84/firepanel:latest
```

Abre `http://<ip-de-tu-pc>:17892` desde cualquier dispositivo de tu red.

### Con docker compose

```yaml
services:
  firepanel:
    image: ghcr.io/mlarbi84/firepanel:latest
    network_mode: host
    volumes:
      - firepanel-data:/data
    environment:
      FIREPANEL_SCAN: "1"
      FIREPANEL_AUTH: ""   # vacío = sin auth (solo LAN). Pon una password si lo expones.
    restart: unless-stopped
volumes:
  firepanel-data:
```

### Sin Docker (Node directo)

```bash
git clone https://github.com/mlarbi84/firepanel
cd firepanel/backend
node backend.mjs
```

Requisitos: Node 20+, ADB en el PATH (`apt install adb` o `winget install Google.PlatformTools`).

## Primer uso

1. En tu Fire TV: **Ajustes → My Fire TV → About → Fire TV** → pulsa OK 7 veces para activar el modo desarrollador
2. **Developer Options → ADB Debugging ON** y **Apps from Unknown Sources ON**
3. Abre firepanel. En la primera pantalla te detecta el stick (o lo añades por IP)
4. Desde el stick acepta la huella ADB (checkbox "siempre")
5. Dale a instalar lo que quieras

## Cómo funciona

```
┌─────────────┐  ADB (puerto 5555)   ┌──────────────┐
│  firepanel  │ ──────────────────▶ │ Fire TV Stick │
│  (Docker)   │                     │   Android TV  │
└─────────────┘                     └──────────────┘
      ▲
      │  HTTP 17892
      │
┌─────────────┐
│    móvil    │
│   portátil  │
│   navegador │
└─────────────┘
```

El contenedor habla ADB a los sticks de tu red. Sirve un panel web. Tú decides qué instalar.

## Catálogo propio y compartido

El catálogo vive en un JSON. Puedes:
- **Editarlo** desde la UI (botón "añadir app")
- **Importar** catálogos de otros (`https://.../catalogo-stuff.json`)
- **Publicar** el tuyo (haz un PR al repo o aloja tu JSON donde quieras)

Esquema:

```json
{
  "id": "newpipe",
  "nombre": "NewPipe",
  "package": "org.schabi.newpipe",
  "fuente": { "tipo": "github", "repo": "TeamNewPipe/NewPipe", "patron": "NewPipe_v.*\\.apk$" },
  "categoria": "streaming",
  "descripcion": "..."
}
```

Tipos de fuente soportados: `github`, `videolan`, `kodi`, `url-directa`.

## Preguntas frecuentes

**¿Me banean la cuenta de Amazon?** No. Sideload por ADB no usa tu cuenta Amazon, es un canal estándar de Android.

**¿Mi stick no es Fire TV, ¿sirve?** Sí. Cualquier Android TV/Google TV con ADB (puerto 5555) funciona.

**¿Y la seguridad si lo expongo fuera de casa?** Pon `FIREPANEL_AUTH=<password>` o mete un tunnel Cloudflare con Access/OIDC, o una VPN (Tailscale, WireGuard).

**¿Es legal?** Sideloading APKs legítimas sí. Qué app instales depende de ti.

## Donaciones

Si te sirve y quieres invitarme a un café:
<!-- RELLENAR CON LINKS REALES -->
- Ko-fi: https://ko-fi.com/larbielyounoussi
- GitHub Sponsors: https://github.com/sponsors/mlarbi84
- PayPal: https://paypal.me/mlarbi84
- Lightning: *próximamente*
- USDC: *próximamente*

## Contribuir

Issues y PRs bienvenidos. Catálogos comunitarios, también — mándalos como PR al fichero `backend/catalogo-defecto.json` o aloja el tuyo donde quieras y comparte la URL.

## Licencia

MIT. Haz lo que quieras, no me demandes.
