# Activar el envío de correos (sin terminal, unos 10 minutos)

## 1 · Brevo
1. **Clave nueva:** Brevo → *Configuración → SMTP y API → Claves API* → elimine la clave que se compartió en el chat → **Generar una nueva clave API** → cópiela (empieza con `xkeysib-`).
2. **Remitente:** *Configuración → Remitentes, dominio, IP → Remitentes* → **Agregar remitente** con el correo desde el que saldrán los QR → confírmelo con el enlace que llega a ese correo.
   - Mejor si es un correo institucional (por ejemplo `@unsa.edu.pe`) con el dominio autenticado (DKIM/DMARC): llega menos a spam que un `@gmail.com`.
3. **IP:** *Configuración → Seguridad → IP autorizadas* → **desactive** el bloqueo de IP desconocidas. Supabase envía desde IP variables; si no lo desactiva, Brevo rechaza los envíos.

## 2 · Supabase: publicar las 2 funciones (copiar y pegar)
En Supabase → menú izquierdo **Edge Functions** → **Deploy a new function** → **Via Editor**:

| Nombre (exacto) | Archivo a pegar | Ajuste después de publicar |
|---|---|---|
| `enviar-qr` | `supabase/panel/enviar-qr.ts` | ninguno |
| `qr` | `supabase/panel/qr.ts` | En la función → **Details / Settings** → desactive **Enforce JWT verification** → Save |

En cada una: borre el código de ejemplo, pegue **todo** el archivo y presione **Deploy function**.
La función `qr` debe quedar pública porque Gmail descarga desde ahí la imagen del QR. Solo entrega imágenes de QR válidos y no contiene datos personales.

## 3 · En la aplicación
1. **Configuración → Correo (Brevo):** pegue la clave nueva y el correo remitente → **Guardar datos de Brevo**. La clave se guarda cifrada y no se vuelve a mostrar.
2. **Configuración → Datos del congreso en el correo** (opcional): fecha y lugar → **Guardar**.
3. **Correos → Verificar configuración:** debe decir **«Todo listo»**. Si no, el mensaje dice qué falta.
4. **Correos → Enviar correo de prueba** a su propio correo. Revise la bandeja y spam.

## 4 · Enviar a los preinscritos
1. En Google Sheets: **Archivo → Descargar → Microsoft Excel (.xlsx)**.
2. App → **Inscritos → Importar** → elija el archivo → revise que «Correo» y «Nombre» estén bien asignados → **Revisar datos** → **Importar**.
3. **Generar QR pendientes**.
4. **Correos → Vista previa** (revise cómo se ve) → **Enviar QR pendientes** → confirmar.
   - Máximo **300 por día** con Brevo gratis. Si hay más inscritos, el resto queda pendiente y se envía al día siguiente con el mismo botón. Nunca se repite a quien ya lo recibió.
5. Los que se inscriban en la puerta quedan con su QR **pendiente de envío**: al final del día, **Correos → Enviar QR pendientes** les manda su QR.
