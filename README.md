# INNOMINING 2026 · Acreditación y control de ingreso

Sistema web para acreditar participantes con QR y registrar su ingreso al congreso desde **dos puestos a la vez**: una laptop para el registro presencial y un celular para escanear QR. Ambos usan **una sola base de datos central**.

| | |
|---|---|
| **Base de datos** | Supabase (PostgreSQL), con restricciones únicas y funciones transaccionales |
| **Acceso** | Supabase Auth, con roles `admin` y `operador`. RLS impide leer o escribir directamente en las tablas |
| **Backend** | Funciones SQL (RPC) más 3 Edge Functions: `enviar-qr`, `qr` (imagen) y `brevo-webhook` |
| **Correos** | API transaccional de Brevo. La clave vive **solo** en los secretos de Supabase |
| **Web** | Vite y JavaScript, una sola aplicación para laptop y celular. Se publica gratis con HTTPS |

> **Estado:** todo el sistema se probó contra **PostgreSQL 16 real** con la migración de Supabase y con navegador real (ver `docs/PRUEBAS.md`).
> Desde el entorno de desarrollo **no hubo acceso a Supabase ni a Brevo**, así que **todavía no se creó tu proyecto Supabase ni se envió ningún correo real**. Las secciones 2 a 5 explican cómo conectarlo (unos 30 minutos). Recién después estará listo para operar.

---

## 1. Cómo funciona

```
 Laptop (registro presencial)          Celular (escáner)
            │  supabase-js (HTTPS)            │
            └──────────────┬──────────────────┘
                           ▼
              Supabase ─ Auth (operadores)
                       ─ PostgreSQL  ← funciones SQL transaccionales (RPC)
                       ─ Edge Functions → API de Brevo (BREVO_API_KEY secreta)
```

- **Situación A (inscrito):** se importa → se genera su QR → Brevo se lo envía → el celular lo escanea → ingreso registrado.
- **Situación B (no inscrito):** la laptop registra nombre, correo e institución → queda **acreditado al instante**, con su QR generado y **pendiente de envío** → después, desde Correos, se le envía ese mismo QR.
- **Situación C (inscrito sin QR a mano):** la laptop lo busca → registra su ingreso. No se crea un duplicado ni un QR distinto.

### Garantías de la base de datos
| Riesgo | Cómo se evita |
|---|---|
| Participantes duplicados | `participantes.email` es único; el correo se normaliza (minúsculas, sin espacios) |
| Dos ingresos el mismo día | `unique (participante_id, fecha)` en `asistencias`; la segunda lectura devuelve la hora original |
| Dos QR activos | `qr_token` es único y hay uno por participante; los anulados pasan a `qr_anulados` |
| Correos duplicados | Cada envío se reserva con `FOR UPDATE SKIP LOCKED` y un índice único de «un envío en curso por participante» |
| Registro presencial incompleto | Participante, QR y asistencia se crean en **una sola transacción** |
| Operaciones simultáneas | Probado con 20 escaneos simultáneos, 3 registros simultáneos de la misma persona y 2 administradores enviando a la vez |

QR = `IM26:` seguido de 32 caracteres hexadecimales (128 bits aleatorios de `gen_random_bytes`). No contiene datos personales. La hora la pone el servidor, en zona `America/Lima`.

### Estados del correo
`Pendiente` → `Procesando` → `Aceptado por Brevo` (Brevo lo recibió; **no** garantiza la entrega) → `Entregado` (solo si Brevo lo confirma por webhook).
`Fallido`: Brevo lo rechazó. Se puede corregir el correo y reintentar.
`Por verificar`: Brevo no respondió a tiempo y **pudo haberlo enviado**. No se reintenta solo; el botón «Verificar en Brevo» lo consulta y lo resuelve.
Si falla la cuota o la configuración, o Brevo no está disponible, el envío vuelve a `Pendiente` y no se pierde.

---

## 2. Crear la base de datos en Supabase (gratis)

1. Entre a <https://supabase.com>, cree una cuenta y un **proyecto nuevo** (región: *South America (São Paulo)*). Guarde la contraseña de la base.
2. Abra **SQL Editor → New query**, pegue el contenido completo de `supabase/migrations/20261117000000_innomining.sql` y presione **Run**. Crea tablas, reglas y funciones, y se puede volver a ejecutar sin problema.
3. Cree los usuarios del comité en **Authentication → Users → Add user → Create new user**. Use correo y contraseña y marque *Auto Confirm User*.
4. Asigne los roles en **SQL Editor**:
   ```sql
   select registrar_operador('admin@tu-correo.com',   'admin',    'Nombre Apellido');
   select registrar_operador('laptop@tu-correo.com',  'operador', 'Puesto laptop');
   select registrar_operador('celular@tu-correo.com', 'operador', 'Puesto celular');
   ```
5. Recomendado: en **Authentication → Sign In / Providers**, desactive *Allow new users to sign up*, para que nadie pueda crearse una cuenta por su cuenta. Aunque alguien lo hiciera, sin rol no puede usar nada.
6. Copie de **Project Settings → API**: la *Project URL* y la clave *anon public*. Las va a necesitar en el paso 4. La clave `service_role` **no** se usa en la web.

> **Plan gratuito de Supabase:** un proyecto se **pausa tras 7 días sin actividad**. Entre al panel (o use la app) unos días antes del evento y verifique que esté activo. La capacidad (500 MB) sobra para este evento.

## 3. Configurar Brevo y las Edge Functions

### 3.1 En Brevo
1. **Remitente verificado:** en *Configuración → Remitentes, dominio, IP → Remitentes* agregue el correo desde el que se enviará (por ejemplo `acreditacion@…`) y confírmelo con el enlace que llega. Lo ideal es **autenticar el dominio** (registros DKIM y DMARC) para no caer en spam.
2. **Nueva clave API:** la clave que se pegó en el chat **debe considerarse expuesta**. En *Configuración → SMTP y API → Claves API*, **elimínela** y cree una nueva. Si Brevo ofrece permisos limitados, elija solo correo transaccional. Use la clave normal (`xkeysib-…`); el sistema también acepta la versión «MCP».
3. **IP autorizadas:** las Edge Functions de Supabase salen desde IP variables. En *Configuración → Seguridad → IP autorizadas*, **desactive el bloqueo de IP desconocidas**. Si no lo hace, Brevo responderá 401.
4. Si al probar aparece un error de cuenta «no activada» para envíos transaccionales, escriba al soporte de Brevo para activarla. Tener la cuenta creada no siempre basta.

### 3.2 Publicar las funciones y guardar los secretos (en su computadora)
Necesita [Node.js](https://nodejs.org) 18 o superior. Desde la carpeta del proyecto:
```bash
npx supabase login
```
```bash
npx supabase link --project-ref SU_PROJECT_REF
```
```bash
npx supabase functions deploy enviar-qr
```
```bash
npx supabase functions deploy qr --no-verify-jwt
```
```bash
npx supabase functions deploy brevo-webhook --no-verify-jwt
```
Guarde los secretos. Se escriben **en su terminal**, nunca en el código ni en el chat:
```bash
npx supabase secrets set BREVO_API_KEY=xkeysib-SU_CLAVE_NUEVA BREVO_SENDER_EMAIL=acreditacion@su-dominio.com BREVO_SENDER_NAME="INNOMINING 2026"
```
**Más fácil:** en vez de este comando, pegue la clave y el remitente en la aplicación, en **Configuración → Correo (Brevo)**. Se guardan cifrados en Supabase Vault y no se vuelven a mostrar.
Opcionales: `BREVO_REPLY_TO` (correo para respuestas) y `BREVO_WEBHOOK_SECRET` (texto largo aleatorio, para el paso 3.3).

### 3.3 Confirmación de entrega (opcional)
En Brevo, *Configuración → Webhooks → Transaccional → Agregar*:
URL `https://SU_PROJECT_REF.supabase.co/functions/v1/brevo-webhook?secreto=EL_MISMO_BREVO_WEBHOOK_SECRET`, con los eventos *Entregado*, *Rebote fuerte*, *Bloqueado* y *Correo inválido*.
Sin webhook, los correos quedan en «Aceptado por Brevo», que es lo correcto: no se afirma una entrega que no se confirmó.

## 4. Publicar la web (gratis, con HTTPS)

1. En la carpeta `web`, copie `.env.example` como **`.env`** y complete las dos líneas con la *Project URL* y la clave *anon public* del paso 2.
2. Luego:
```bash
cd web
```
```bash
npm install
```
```bash
npm run build
```
Se genera la carpeta `web/dist`. Súbala a **Netlify** (*Add new site → Deploy manually*, arrastrando la carpeta), **Cloudflare Pages** o **Vercel**. Todos dan HTTPS, que es obligatorio para la cámara del celular.
Las variables `VITE_…` son públicas por diseño. La seguridad la dan el login y las reglas de la base de datos.

## 5. Prueba real antes del evento (lista de verificación)
- [ ] Ingresar como admin. Ir a **Correos → Verificar configuración**: debe decir «Todo listo».
- [ ] **Enviar correo de prueba** a correos del comité: Gmail, Outlook y uno universitario. Revisar bandeja y spam, y que el QR se vea.
- [ ] Importar `samples/participantes_prueba.csv` con **los correos cambiados por correos propios del comité**. Generar QR y enviar pendientes.
- [ ] En un **Android** y un **iPhone**: entrar como operador → *Celular · Escáner* → escanear un QR del correo recibido → «INGRESO REGISTRADO». Escanearlo otra vez → «YA REGISTRADO».
- [ ] En la laptop: registrar a una persona nueva. Verificar que aparece en el panel del admin sin recargar (unos 10 segundos).
- [ ] Probar con la laptop y el celular conectados a **redes distintas** (wifi y datos móviles).
- [ ] Exportar el CSV y abrirlo en Google Sheets.
- [ ] **Borrar los datos de prueba** desde SQL Editor:
  ```sql
  truncate asistencias, envios_correo, qr_anulados, participantes, bitacora cascade;
  ```
- [ ] En **Configuración**: cargar las fechas reales del congreso y **desactivar el modo prueba**.
- [ ] Importar los inscritos reales, generar QR y enviarlos **con días de anticipación**. El límite es de 300 por día en el plan gratuito; el sistema lo respeta y el límite se puede cambiar en Configuración.

---

## 6. Guía rápida para organizadores

**Al entrar** elija cómo usará el dispositivo: **Laptop · Administración y registro** o **Celular · Escáner**.

**Celular (puerta del auditorio):** la cámara se abre sola. Apunte al QR:
- 🟩 **INGRESO REGISTRADO:** nombre, fecha y hora.
- 🟨 **INGRESO YA REGISTRADO:** ya había entrado hoy. Se muestra la hora original y no se registra de nuevo.
- 🟥 **QR NO VÁLIDO / ANULADO:** no se registra. Envíe a la persona a la laptop.

Toque la pantalla para seguir o espere 3 segundos. «Cambiar cámara» alterna entre la cámara trasera y la frontal.

**Laptop (registro presencial):**
- *Persona sin inscripción:* escriba nombre, correo y universidad → **Registrar e ingresar**. Queda acreditada al instante. Su QR se le enviará después.
- *Correo ya registrado:* aparece «Este correo ya está registrado» con el nombre. Si es la misma persona → **Registrar ingreso**.
- *Inscrito sin su QR:* use el buscador de la derecha → **Registrar ingreso**.
- *Error de tipeo:* **Corregir datos** justo después de registrar. El QR no cambia.

**Administración (admin):**
- **Participantes:** Importar (Excel o CSV; puede asignar las columnas) → **Generar QR pendientes** → **Descargar QR (ZIP)** / **Exportar CSV**. Al tocar una fila se ve el detalle: credencial, asistencias por fecha, editar, reenviar, anular QR.
- **Correos:** Verificar configuración, Vista previa, **Enviar QR pendientes** (incluye a los registrados en puerta), Reintentar fallidos, Por verificar e Historial.
- **Configuración:** fechas del congreso, modo prueba, límite diario de correos y lista de operadores.

**Si se corta el internet:** la pantalla dice claramente «NO SE REGISTRÓ». Al volver la conexión, repita: nunca se duplica.

---

## 7. Estructura del proyecto
```
supabase/
  migrations/20261117000000_innomining.sql   tablas, restricciones, RLS y funciones (toda la lógica crítica)
  functions/enviar-qr/  qr/  brevo-webhook/  Edge Functions (Deno)
  functions/_shared/    plantilla del correo, cliente Brevo, PNG del QR, manejadores
  config.toml
web/                    aplicación (Vite): src/pages/{inicio,registro,escaner,participantes,correos,configuracion}.js
tests/                  pruebas: PostgreSQL real + emulador local de la API de Supabase + Brevo simulado
samples/                plantilla CSV y datos ficticios
docs/                   resultados de pruebas y capturas
version-anterior-apps-script/   versión previa (Google Sheets), ya no se usa
```

### Para Google Forms (asistencia a ponencias)
El CSV exportado incluye `id` permanente, nombre, **correo normalizado**, origen y una columna `ingreso_DD/MM/AAAA` por cada fecha. Se cruza con las respuestas usando el correo.

## 8. Ejecutar las pruebas (desarrolladores)
Requiere PostgreSQL 15+ local en el puerto 54329 y Chromium con Playwright.
```bash
cd tests && npm install && cd ../web && npm install && npx vite build && cd ..
```
```bash
node tests/db.test.mjs
```
```bash
node tests/e2e.test.mjs
```
