# Martillo Autos · Subastas de vehículos en tiempo real

## 🔗 Sitio publicado: **https://fir-signos-vitales.web.app**

> Reemplaza este enlace por la URL real después de desplegar (ver [Despliegue](#despliegue)).

Plataforma desacoplada para subastar vehículos importados (estilo Copart / Ritchie Bros), con tres pilares: **Regístrese, Encuentre y Oferte**.

| Capa | Tecnología |
|---|---|
| Frontend (SPA) | Angular 18 con componentes standalone y signals |
| Web API REST | Node.js 18+ y Express |
| Base de datos | PostgreSQL (usuarios, catálogos, vehículos, fotos, pujas, resultados) |
| Tiempo real | Firebase Realtime Database (oferta actual, reloj e historial) |

---

## 👥 Credenciales de prueba

Las tres cuentas usan la contraseña **`Demo2026!`**

| Usuario | Correo | Rol sugerido |
|---|---|---|
| Ana López | `ana@demo.gt` | Vendedora: publicó los 6 vehículos de ejemplo |
| Carlos Méndez | `carlos@demo.gt` | Comprador |
| Sofía Ruiz | `sofia@demo.gt` | Comprador |

**Prueba cruzada en tiempo real:**

1. Abre el sitio en dos navegadores distintos, o en una ventana normal y otra de incógnito.
2. Inicia sesión como Carlos en uno y como Sofía en el otro.
3. Entren al mismo vehículo, por ejemplo la **Toyota Hilux**, que cierra pocos minutos después de cargar los datos.
4. Ofertan por turnos y observan:
   - El monto y el reloj se actualizan en ambos navegadores sin recargar.
   - Badge verde *"¡Vas ganando esta subasta!"* para quien lleva la oferta más alta.
   - Badge rojo *"Tu oferta ha sido superada…"* para quien fue superado.
   - Con 60 s o menos aparece la rueda de tiempo. Cada oferta la reinicia a 60 s.
   - Al llegar a cero se muestra **"Oferta cerrada"** y el resultado: vendido o desierta.
5. Inicia sesión como Ana para ver que no puede ofertar en sus propias publicaciones y para editar una publicación sin ofertas desde **Mis publicaciones**.

> Las fechas del seed son relativas al momento de ejecutar `02_seed.sql`. Si las subastas ya cerraron, vuelve a correr `npm run db:init` o publica un vehículo nuevo.

---

## 📐 Reglas de negocio implementadas

| Regla | Dónde se aplica |
|---|---|
| Sin sesión solo se puede ver el inventario y el detalle | `authGuard` (Angular) y `requireAuth` (API) |
| Registro con nombre, apellido, correo, teléfono y contraseña segura (8+ caracteres, mayúscula, minúscula, número y símbolo) | `auth.routes.js` y `login.component.ts` |
| Ficha técnica completa, nivel de daño Verde/Amarillo/Rojo, mínimo 5 fotos, monto base, inicio y cierre | `vehicles.routes.js` (`validateVehicle`) y `publish.component.ts` |
| El publicador busca y edita sus publicaciones, solo mientras no tengan ofertas | `GET /api/vehicles/mine` y `PUT /api/vehicles/:id` |
| Filtros por cualquier campo de la ficha técnica | `GET /api/vehicles` |
| Oferta ≥ monto base y al menos **10 %** sobre la oferta actual | `auction.service.js` (`placeBid`, dentro de una transacción RTDB) |
| Nadie conoce la identidad del postor: solo se muestra un alias anónimo (`**469`) | `utils/bidder.js` (HMAC por subasta) |
| Después del cierre no se puede ofertar ("Oferta cerrada") | `placeBid` y la UI |
| **Minuto final:** cada oferta con ≤ 60 s restantes reinicia el reloj a 60 s; la subasta termina cuando pasa un minuto sin ofertas | `placeBid` (`softCloseMs`) y la rueda de `bid-panel` |
| Si al cierre no se alcanza el monto base, la subasta queda **desierta** | `closeAuction` |
| Resultado final (ganador, precio, total de pujas) guardado en PostgreSQL | tabla `auctions` e historial en `bids` |

### Por qué las pujas pasan por la API y no se escriben directo en Firebase

El navegador **solo lee** de Firebase (las reglas tienen `.write: false`). Las ofertas se envían a `POST /api/auctions/:id/bids`, donde el backend:

1. Valida las reglas dentro de una **transacción** de Firebase, así dos ofertas simultáneas nunca se pisan.
2. Escribe el nuevo estado en Firebase, que lo propaga al instante a todos los navegadores conectados.
3. Registra la puja con el usuario real en PostgreSQL para dar trazabilidad.

Así nadie puede saltarse las reglas manipulando el JavaScript del navegador.

El temporizador usa `.info/serverTimeOffset` de Firebase, de modo que todos los usuarios ven el mismo reloj aunque la hora de su computadora esté desfasada.

---

## 🗂️ Estructura

```
subastas/
├── database/
│   ├── 01_schema.sql          # tablas, tipos, índices y vista v_catalog
│   └── 02_seed.sql            # catálogos, 3 usuarios y 6 vehículos de ejemplo
├── firebase/
│   ├── rtdb-structure.json    # ejemplo de la estructura en tiempo real
│   ├── database.rules.json    # reglas de seguridad (solo lectura pública)
│   └── firebase.json          # configuración de Hosting para el frontend
├── backend/
│   ├── scripts/init-db.js     # crea las tablas y carga el seed
│   └── src/
│       ├── index.js
│       ├── config/            # pg y firebase-admin
│       ├── middleware/auth.js
│       ├── routes/            # auth, catalogs, vehicles, photos, auctions
│       ├── services/auction.service.js   # motor de subastas
│       ├── jobs/auction-scheduler.js     # abre y cierra subastas cada segundo
│       └── utils/
└── frontend/src/app/
    ├── core/                  # modelos, servicios, guard e interceptor
    ├── shared/                # header, card, carrusel, pipes
    └── pages/
        ├── catalog/           # Home e inventario con filtros
        ├── vehicle-detail/    # detalle y panel de subasta (incluye minuto final)
        ├── login/             # iniciar sesión y crear cuenta
        ├── publish/           # publicar y editar
        └── my-listings/       # mis publicaciones
```

### Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/auth/register` | — | Crear cuenta |
| POST | `/api/auth/login` | — | Iniciar sesión (devuelve JWT) |
| GET | `/api/auth/me` | ✔ | Usuario actual |
| GET | `/api/catalogs` | — | Todos los catálogos de la ficha técnica |
| GET | `/api/vehicles` | — | Inventario con filtros y paginación |
| GET | `/api/vehicles/facets` | — | Contadores por categoría |
| GET | `/api/vehicles/mine?search=` | ✔ | Mis publicaciones |
| GET | `/api/vehicles/:id` | — | Detalle |
| POST | `/api/vehicles` | ✔ | Publicar (multipart, 5 a 15 fotos) |
| PUT | `/api/vehicles/:id` | ✔ | Editar publicación propia sin ofertas |
| GET | `/api/photos/:id` | — | Imagen |
| GET | `/api/auctions/:id/me` | ✔ | Token anónimo del usuario en la subasta |
| POST | `/api/auctions/:id/bids` | ✔ | Ofertar `{ "amount": 193000 }` |

Filtros de `GET /api/vehicles`:

- Búsqueda y pestaña: `search`, `tab` (`open` o `closed`).
- Por id (listas separadas por coma): `itemTypeId`, `makeId`, `modelId`, `fuelTypeId`, `transmissionId`, `drivetrainId`.
- Otros: `cylinders`, `damage` (`VERDE,AMARILLO,ROJO`), `yearFrom`, `yearTo`.
- Orden: `sort` (`ending`, `newest`, `price_asc`, `price_desc`, `year_desc`).
- Paginación: `page`, `pageSize`.

---

## 💻 Ejecutar en local

**Requisitos:** Node 18+, PostgreSQL 14+ y Angular CLI (`npm i -g @angular/cli`).

### 1. Firebase

1. En la [Consola de Firebase](https://console.firebase.google.com/) abre el proyecto `fir-signos-vitales`. Si prefieres no mezclar proyectos, crea uno nuevo.
2. **Realtime Database → Reglas:** **agrega** el bloque `"subastas"` de `firebase/database.rules.json` dentro de tus reglas actuales. No reemplaces las reglas completas, para no romper el dashboard de signos vitales.
3. **Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.** Se descarga un JSON; conviértelo a base64:
   ```bash
   base64 -w0 clave-servicio.json
   ```
4. **Configuración del proyecto → Tus apps → App web:** copia el objeto `firebaseConfig` en `frontend/src/environments/environment.ts` y en `environment.development.ts`.

### 2. Backend

```bash
cd backend
cp .env.example .env      # completa DATABASE_URL, JWT_SECRET, BIDDER_SECRET y FIREBASE_SERVICE_ACCOUNT_BASE64
npm install
createdb subastas         # o créala desde DBeaver
npm run db:init           # ⚠ borra y recrea las tablas, luego carga el seed
npm run dev               # http://localhost:3000/api/health
```

Al arrancar, el backend crea en Firebase los nodos de las subastas abiertas que existan en PostgreSQL.

### 3. Frontend

```bash
cd frontend
npm install
ng serve                  # http://localhost:4200
```

---

## 🚀 Despliegue

### Base de datos: Neon, Supabase o Render PostgreSQL (plan gratuito)

1. Crea la base y copia la *connection string*.
2. Carga el esquema y el seed de una de estas dos formas:
   - Desde tu máquina: `DATABASE_URL=... PGSSL=true npm run db:init`.
   - Ejecutando `01_schema.sql` y luego `02_seed.sql` en el editor SQL del proveedor.

### API: Render (Web Service)

| Campo | Valor |
|---|---|
| Root directory | `backend` |
| Build command | `npm install` |
| Start command | `npm start` |
| Variables | Las de `.env.example`, con `PGSSL=true` y `CORS_ORIGINS=https://<tu-sitio>.web.app` |

> En el plan gratuito, Render apaga el servicio tras 15 minutos sin tráfico y la primera petición tarda unos 50 s. Abre `/api/health` antes de la demostración. Mientras el servicio está dormido, el cierre automático de subastas se pausa y se completa en cuanto despierta.

### Frontend: Firebase Hosting

1. Pon la URL de Render en `frontend/src/environments/environment.ts` (`apiUrl`).
2. Compila y despliega:
   ```bash
   cd frontend && ng build
   cd ../firebase
   npm i -g firebase-tools && firebase login
   firebase deploy --only hosting
   ```
3. Copia la URL resultante al inicio de este README y en `CORS_ORIGINS` del backend.

---

## 🧪 Checklist de verificación

- [ ] Sin sesión, el botón dice "Inicia sesión para ofertar" y lleva al login.
- [ ] Una oferta menor al monto base o menor al 10 % de incremento se rechaza con el mínimo correcto.
- [ ] Dos navegadores ven la misma oferta y el mismo reloj sin recargar.
- [ ] Los badges verde y rojo cambian solos al ser superado.
- [ ] Con ≤ 60 s aparece la rueda y una oferta la reinicia.
- [ ] Al cierre sin ofertas suficientes se muestra "desierta"; con ofertas, "vendido", y el resultado queda en `auctions`.
- [ ] Publicar exige 5 fotos o más; editar se bloquea cuando ya hay ofertas.
