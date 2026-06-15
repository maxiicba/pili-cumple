# pili-cumple

Invitación web al primer añito de **Pili** 🐰🎀

Página de una sola pantalla con portada animada, música de fondo, galería de fotos,
cuenta regresiva, ubicación con Google Maps y confirmación de asistencia por WhatsApp.

## Correr localmente

```bash
npm start
```

Luego abrir http://localhost:3000

## Deploy en Railway

1. Subir este repo a GitHub.
2. En Railway: **New Project → Deploy from GitHub repo** y elegir `pili-cumple`.
3. Railway detecta Node automáticamente y ejecuta `npm start` (sirve el sitio en `$PORT`).
4. En **Settings → Networking → Generate Domain** para obtener la URL pública.

## Configuración

En `index.html`, dentro del `<script>`, cambiar el número de WhatsApp real:

```js
var WHATSAPP_NUMBER = "5493510000000"; // código de país + número, sin + ni espacios
```

## Estructura

```
index.html        Invitación (HTML + CSS + JS en un solo archivo)
server.js         Servidor estático mínimo (sin dependencias)
package.json      Script de inicio para Railway
assets/           Fotos, ilustración de la conejita y música
```
