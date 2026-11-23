# Security

## Threat model

firepanel está pensado para **LAN privada** o detrás de una **VPN** (Tailscale, WireGuard) o un **tunnel autenticado** (Cloudflare Access).

El backend ejecuta `adb` contra tu Fire TV / Android TV. Si alguien no autorizado alcanza el puerto `17892` puede instalar, desinstalar y lanzar apps en tus dispositivos — y potencialmente llamar a shells adb — como si tuviera el stick delante.

## No expongas firepanel a internet sin auth

**❌ NO hagas esto:**
- Mapear `17892` en el router hacia internet
- Publicar el dominio sin autenticación
- Dejar `FIREPANEL_AUTH` vacío si el panel es accesible fuera de tu LAN

**✅ Formas seguras de acceder desde fuera de casa:**
- **Tailscale** (WireGuard mesh, gratis hasta 100 nodos) — accedes a `100.x.x.x:17892`
- **WireGuard propio** en tu VPS — igual pero sin depender de terceros
- **Cloudflare Tunnel + Access** — el tunnel con política de OTP por email

## Validaciones en el código

- Los nombres de paquete Android (`package`) se validan contra `^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$` antes de pasar a `adb shell`. No es posible inyectar comandos via nombre de paquete.
- Los IDs del catálogo se validan contra `^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$`.
- Las URLs de APK se resuelven siempre desde el catálogo (o drag & drop local). El panel no permite URL arbitraria desde la UI web pública.
- APKs descargados se guardan en el volumen `firepanel-data` con nombre normalizado (no path traversal).

## Dependencias

- **Cero deps npm.** Solo stdlib de Node 20. No hay cadena de suministros que atacar.
- Base image Docker: `node:20-alpine` + `android-tools` (adb). Ambos mantenidos por sus propios equipos.

## Reporte de vulnerabilidades

Si encuentras algo, abre un issue en GitHub con la etiqueta `security` o escríbeme a mlarbi (at) gmail (dot) com. Si es grave y prefieres privado, mándame primero un email y espero 48h antes de hablarlo en público.

Gracias por mirar.
