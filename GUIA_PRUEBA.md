# Cómo probar INNOMINING 2026 (paso a paso)

Tiempo: unos 40 minutos la primera vez. Necesita una computadora (Windows, Mac o Linux) y un celular.

---

## Paso 0 · Instalar lo necesario (una sola vez)
1. Descargue e instale **Node.js LTS**: <https://nodejs.org> (siguiente, siguiente, finalizar).
2. Descomprima `innomining2026.zip` en una carpeta, por ejemplo `Documentos/innomining2026`.
3. Abra una terminal **dentro de esa carpeta**:
   - Windows: abra la carpeta, escriba `cmd` en la barra de direcciones y presione Enter.
   - Mac: clic derecho en la carpeta → *Nuevo terminal en la carpeta*.

## Paso 1 · Crear la base de datos (Supabase, gratis)
1. Entre a <https://supabase.com> → **Start your project** → inicie sesión (puede usar GitHub o su correo).
2. **New project**: nombre `innomining2026`; una contraseña de base de datos (anótela); región **South America (São Paulo)** → **Create new project**. Espere unos 2 minutos.
3. Menú izquierdo → **SQL Editor** → **New query**.
4. Abra con el Bloc de notas el archivo `supabase/migrations/20261117000000_innomining.sql`, copie **todo**, péguelo y presione **Run**. Debe decir *Success. No rows returned*.
5. Menú → **Authentication** → **Users** → **Add user** → **Create new user**. Cree 3 usuarios (marque *Auto Confirm User*):
   - su correo de administrador y una contraseña
   - un correo para la laptop (por ejemplo `laptop.innomining@gmail.com`)
   - un correo para el celular

   No necesitan ser correos reales para operadores, pero sí deben tener formato de correo.
6. Vuelva a **SQL Editor** → **New query**, pegue lo siguiente (con sus correos) y presione **Run**:
   ```sql
   select registrar_operador('SU_CORREO_ADMIN', 'admin', 'Su nombre');
   select registrar_operador('CORREO_LAPTOP', 'operador', 'Puesto laptop');
   select registrar_operador('CORREO_CELULAR', 'operador', 'Puesto celular');
   ```
7. Menú → **Project Settings** (engranaje) → **API**. Deje esta página abierta: necesitará la **Project URL** y la clave **anon public**. La **service_role** no la use ni la comparta.
8. En **Authentication → Sign In / Providers**, desactive **Allow new users to sign up**.

## Paso 2 · Publicar la web y probar la parte principal (sin correos todavía)
1. En la carpeta `web`, copie el archivo `.env.example` y renombre la copia como `.env`. Ábrala con el Bloc de notas y pegue sus datos:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ... (la clave anon public)
   ```
2. En la terminal (dentro de la carpeta del proyecto), ejecute uno por uno:
   ```
   cd web
   npm install
   npm run build
   ```
   Se crea la carpeta `web/dist`.
3. Entre a <https://app.netlify.com/drop> (cree una cuenta gratis) y **arrastre la carpeta `dist`** a la página. Le dará una dirección `https://algo.netlify.app`. Esa es su aplicación.
4. **Pruebe en la computadora:** abra la dirección → inicie sesión como **admin** → **Participantes → Importar** → elija `samples/participantes_prueba.csv` → **Revisar datos** → corrija el correo marcado en rojo → **Importar** → **Generar QR pendientes** → toque a un participante → **Descargar PNG**.
5. **Pruebe en el celular:** abra la misma dirección → inicie sesión con la cuenta del **celular** → **Celular · Escáner** → permita la cámara → escanee el PNG que se ve en la pantalla de la computadora. Debe aparecer **INGRESO REGISTRADO** en verde. Escanéelo de nuevo: **INGRESO YA REGISTRADO**.
6. **Pruebe la laptop:** en otra ventana o navegador, inicie sesión con la cuenta de la **laptop** → **Laptop · Administración y registro** → registre a una persona nueva → **INGRESO REGISTRADO**.
7. Vuelva a la cuenta admin → **Inicio**: en unos 10 segundos verá los ingresos de ambos puestos.

## Paso 3 · Activar el envío de correos (Brevo)
1. En Brevo → **Configuración → SMTP y API → Claves API**: **elimine la clave que se compartió en el chat** y cree una nueva. Cópiela; Brevo la muestra una sola vez.
2. Brevo → **Remitentes, dominio, IP → Remitentes**: agregue el correo remitente (por ejemplo `innomining2026@gmail.com` o uno institucional) y **confírmelo** con el enlace que le llega.
3. Brevo → **Seguridad → IP autorizadas**: **desactive** el bloqueo de IP desconocidas. Supabase envía desde IP variables.
4. En Supabase → **Project Settings → General**, copie el **Reference ID** (algo como `abcdxyz`).
5. En la terminal, en la carpeta del proyecto (no en `web`), ejecute uno por uno:
   ```
   npx supabase login
   npx supabase link --project-ref SU_REFERENCE_ID
   npx supabase functions deploy enviar-qr
   npx supabase functions deploy qr --no-verify-jwt
   npx supabase functions deploy brevo-webhook --no-verify-jwt
   ```
   (`login` abre el navegador para autorizar; `link` pide la contraseña de la base del Paso 1.)
6. En la aplicación (admin) → **Configuración → Correo (Brevo)**: pegue la clave nueva y el correo remitente → **Guardar datos de Brevo**. Se guarda cifrada y no se vuelve a mostrar.
7. En la aplicación (admin) → **Correos** → **Verificar configuración** → debe decir **«Todo listo»**. Si no, el mensaje indica qué falta.
8. **Enviar correo de prueba** a su propio correo. Revise la bandeja (y spam).
9. Cambie los correos de `participantes_prueba.csv` por correos suyos o del comité, impórtelo y use **Enviar QR pendientes**. Abra un correo en el celular de otra persona y escanéelo desde el puesto celular.

## Paso 4 · Antes del evento
- **Configuración**: agregue las fechas reales del congreso y **desmarque el modo prueba**.
- Borre los datos de prueba en Supabase → SQL Editor:
  ```sql
  truncate asistencias, envios_correo, qr_anulados, participantes, bitacora cascade;
  ```
- Importe los inscritos reales → **Generar QR pendientes** → **Enviar QR pendientes** con días de anticipación (máximo 300 por día en Brevo gratis).
- Entre a Supabase unos días antes: los proyectos gratis se **pausan tras 7 días sin uso**.

## Si algo falla
| Mensaje | Solución |
|---|---|
| «Falta configuración» al abrir la web | El archivo `web/.env` no existe o está incompleto. Repita el Paso 2.1 y vuelva a hacer `npm run build`. |
| «Su cuenta no está habilitada como organizador» | Falta el `registrar_operador(...)` del Paso 1.6 para ese correo. |
| «Correo o contraseña incorrectos» | Revise el usuario en Authentication → Users. |
| La cámara no abre | Use la dirección **https** de Netlify, en Chrome (Android) o Safari (iPhone), y permita la cámara. |
| Brevo 401 al verificar | Clave mal copiada, o falta desactivar el bloqueo de IP (Paso 3.3). |
| «Remitente no verificado» | Confirme el remitente en Brevo (Paso 3.2). |
| Correos en spam | Use un remitente con dominio propio y autentique el dominio en Brevo (DKIM/DMARC). |

Más detalle técnico en `README.md`.
