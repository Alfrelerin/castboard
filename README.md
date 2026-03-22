# Dickmanns' CastBoard

Gestor de castings personal para actrices. PWA que funciona como app en iPhone y Mac.

## Subir a GitHub Pages (paso a paso)

### 1. Crear el repositorio

1. Ve a [github.com/new](https://github.com/new)
2. Nombre del repositorio: `castboard` (o el que prefieras)
3. Ponlo **Public** (necesario para GitHub Pages gratuito)
4. NO marques "Add a README" (ya tenemos el nuestro)
5. Pulsa **Create repository**

### 2. Subir los archivos

Desde la terminal en la carpeta `casting-app`:

```bash
cd casting-app
git init
git add .
git commit -m "Dickmanns CastBoard v1.0"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/castboard.git
git push -u origin main
```

O si prefieres, desde la web de GitHub:
1. En tu repo recien creado, pulsa **"uploading an existing file"**
2. Arrastra los 5 archivos (index.html, app.js, styles.css, manifest.json, sw.js)
3. Pulsa **Commit changes**

### 3. Activar GitHub Pages

1. En tu repositorio, ve a **Settings** > **Pages**
2. En "Source", selecciona **Deploy from a branch**
3. Branch: **main** / carpeta: **/ (root)**
4. Pulsa **Save**
5. En 1-2 minutos tendras la app en: `https://TU_USUARIO.github.io/castboard/`

### 4. Instalar como app en iPhone

1. Abre Safari en el iPhone
2. Ve a `https://TU_USUARIO.github.io/castboard/`
3. Pulsa el boton de compartir (cuadrado con flecha)
4. Selecciona **"Anadir a pantalla de inicio"**
5. Se instala como una app con icono propio

### 5. Configurar Gmail (para auto-importacion)

1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Crea un proyecto nuevo (nombre: "CastBoard")
3. En el menu lateral: **APIs y servicios** > **Biblioteca**
4. Busca **Gmail API** y activala
5. Ve a **APIs y servicios** > **Pantalla de consentimiento OAuth**
   - Tipo: **Externo**
   - Nombre de la app: "CastBoard"
   - Email de soporte: tu email
   - Ambitos: agrega `gmail.readonly`
   - Usuarios de prueba: agrega el email de Laura
6. Ve a **APIs y servicios** > **Credenciales**
   - Pulsa **Crear credenciales** > **ID de cliente OAuth 2.0**
   - Tipo: **Aplicacion web**
   - Origenes de JavaScript autorizados: `https://TU_USUARIO.github.io`
   - Pulsa **Crear**
7. Copia el **Client ID** (tiene formato `xxxx.apps.googleusercontent.com`)
8. En CastBoard, pulsa el icono de email (sobre) en la cabecera
9. Pega el Client ID y pulsa guardar

A partir de ahi, la app revisara Gmail cada 3 minutos automaticamente.

## Archivos del proyecto

- `index.html` - Estructura de la app
- `app.js` - Toda la logica (vistas, Gmail, datos)
- `styles.css` - Estilos visuales
- `manifest.json` - Configuracion PWA
- `sw.js` - Service Worker (funciona offline)
