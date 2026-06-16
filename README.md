# pili-cumple

Invitación web al primer añito de **Pilar** 🐰🎀

Página animada con música, galería, cuenta regresiva, ubicación y confirmación por WhatsApp.
Ahora incluye **backend**: los invitados suben fotos y dejan frases, hay un **muro de recuerdos**
público y un **panel admin** para ver confirmaciones y moderar el contenido.

## Tecnología

- **Node.js + Express** (servidor y API)
- **PostgreSQL** (`pg`) para confirmaciones, mensajes y metadatos de fotos
- **Cloudflare R2** (S3-compatible) para guardar las imágenes
- HTML/CSS/JS sin frameworks en el front

## Páginas

| Ruta      | Descripción                                              |
|-----------|----------------------------------------------------------|
| `/`       | Invitación principal                                     |
| `/muro`   | Muro público: subir foto, dejar frase y ver todo         |
| `/admin`  | Panel admin (login con contraseña): confirmaciones, fotos y mensajes |

## Correr localmente

```bash
npm install
# copiá .env.example a .env y completá las variables
npm start
```

Abrir http://localhost:3000

## Variables de entorno

Ver `.env.example`. Resumen:

- `DATABASE_URL` — conexión PostgreSQL.
- `DATABASE_SSL` — `true` solo si usás la URL pública.
- `ADMIN_PASSWORD` — contraseña del panel admin.
- `SESSION_SECRET` — string aleatorio para firmar la cookie de sesión.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` — Cloudflare R2.

## Deploy en Railway

1. Subir este repo a GitHub.
2. En Railway: **New Project → Deploy from GitHub repo** y elegir `pili-cumple`.
3. **+ New → Database → PostgreSQL** para crear la base (Railway define `DATABASE_URL`).
   En el servicio web, agregá la variable `DATABASE_URL = ${{Postgres.DATABASE_URL}}`.
4. Cargar el resto de variables (`ADMIN_PASSWORD`, `SESSION_SECRET`, y las `R2_*`).
5. Railway ejecuta `npm install` y `npm start` automáticamente.
6. **Settings → Networking → Generate Domain** para la URL pública.

### Configurar Cloudflare R2

1. En Cloudflare → **R2** → crear un bucket.
2. **Settings del bucket → Public access** → habilitar el dominio público `r2.dev`
   (o conectar un dominio propio). Esa URL va en `R2_PUBLIC_URL`.
3. **R2 → Manage API Tokens** → crear token con permiso de lectura/escritura.
   Te da `Access Key ID` y `Secret Access Key`. El `Account ID` está en el panel de R2.

## Configuración del número de WhatsApp

En `index.html`, dentro del `<script>`:

```js
var WHATSAPP_NUMBER = "5493512736375"; // código de país + número, sin + ni espacios
```

## Estructura

```
index.html        Invitación principal
muro.html         Muro público (subir foto / dejar frase / ver todo)
admin.html        Panel admin
server.js         Servidor Express + API
db.js             Pool de PostgreSQL e init de tablas
r2.js             Cliente de Cloudflare R2 (subida/borrado de imágenes)
package.json      Dependencias y script de inicio
assets/           Fotos, conejita, favicon y música
```
