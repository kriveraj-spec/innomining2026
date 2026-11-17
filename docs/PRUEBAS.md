# Resultados de pruebas · 17/11/2026

**Cómo se probó**
- **Base de datos:** PostgreSQL 16 **real**, con la misma migración que se ejecuta en Supabase (`supabase/migrations/…sql`). Encima va un archivo mínimo, `tests/supabase-stub.sql`, que crea lo que Supabase ya trae: roles `anon`, `authenticated` y `service_role`, el esquema `auth` y los permisos por defecto.
- **API:** `tests/local-supabase.mjs` expone las mismas rutas HTTP que Supabase (Auth, `/rest/v1/rpc`, `/functions/v1`). La web usa el cliente oficial `supabase-js` sin cambios, y las Edge Functions ejecutan el mismo código que se publica.
- **Brevo:** `tests/fake-brevo.mjs` imita la API v3 (aceptado, rebote, 429, 500, remitente inválido y sin respuesta). **No se enviaron correos reales**: desde el entorno de desarrollo no había acceso a Brevo ni a Supabase.
- **Navegador:** Chromium real con tres sesiones a la vez (administrador, laptop y celular Pixel 7). El celular usa una **cámara simulada que muestra el QR**, así que el escáner se prueba de verdad.

**Totales:** backend 38/38 (`node tests/db.test.mjs`) · navegador 20/20 (`node tests/e2e.test.mjs`).

## Casos obligatorios (sección 17)

| # | Caso | Resultado | Evidencia |
|---|---|---|---|
| 1 | Importación de participantes | ✅ | CSV con asignación de columnas → revisión → corrección de un correo inválido → 13 guardados en la base. Exportación tipo Google Forms reconocida. |
| 2 | Detección de duplicados | ✅ | Repetido en el archivo, ya existente (con otra mayúscula o espacios), nombre distinto marcado «Revisar». La reimportación no duplica. |
| 3 | Generación masiva de QR | ✅ | 14 desde la web y 300 en paralelo por 2 administradores: todos únicos, sin regenerar los existentes. |
| 4 | Descarga de códigos | ✅ | PNG individual y ZIP con 14 PNG más `indice.csv`. |
| 5 | Mismo QR tras actualizar | ✅ | Cambiar nombre y correo conserva `id` y `qr_token`. |
| 6 | Correos por Brevo | ✅* | Verificación de clave, cuenta y remitente; correo de prueba; envío masivo por lotes (1 por persona); vista previa. *Con Brevo simulado. |
| 7 | Registro presencial (laptop) | ✅ | Participante, QR y asistencia en una transacción; correo «pendiente»; formulario listo para el siguiente. |
| 8 | Escaneo (celular) | ✅ | La cámara lee el QR → «INGRESO REGISTRADO» con nombre, fecha y hora del servidor. |
| 9 | Persistencia | ✅ | Recarga de página y reinicio del servidor: los datos siguen en PostgreSQL. |
| 10 | Sincronización entre dispositivos | ✅ | Ingresos de la laptop y del celular aparecen en el panel del admin sin recargar (sondeo cada 10 s). |
| 11 | Sin asistencias duplicadas | ✅ | 20 escaneos simultáneos del mismo QR → 1 asistencia; los 19 restantes ven la hora original. |
| 12 | Registro por fechas | ✅ | El mismo QR registra el 18/11 y el 19/11 por separado; el mismo día devuelve «ya registrado»; fuera de fecha se rechaza (si el modo prueba está apagado). |
| 13 | Envío posterior a presenciales | ✅ | Seleccionar presenciales → enviar → llega **el mismo** QR que se generó en la puerta. |
| 14 | Errores de conexión | ✅ | Laptop sin internet: «Sin conexión, NO se registró»; al volver, registra sin duplicar. Brevo con 429 o 500: los pendientes se conservan. Brevo sin respuesta: «Por verificar», sin reintento automático, y «Verificar» lo resuelve. Envío colgado: pasa a «Por verificar» a los 5 minutos. |
| 15 | Exportación | ✅ | CSV con id, código, nombre, correo normalizado, origen, estados, primer ingreso y una columna por fecha. |

## Concurrencia y seguridad

| Caso | Resultado |
|---|---|
| 3 dispositivos registran a la misma persona nueva a la vez → 1 participante, 1 asistencia | ✅ |
| 2 administradores envían correos a la vez → ningún destinatario repetido | ✅ |
| Anónimo: no puede llamar funciones ni leer tablas | ✅ |
| Operador: no puede importar, listar ni exportar, ni leer tablas (RLS) ni llamar funciones `srv_*` | ✅ |
| Endpoint de envío: 401 sin sesión, 403 para operador | ✅ |
| Operador solo corrige a quienes registró en puerta; ve correos enmascarados (`mj•••@…`) | ✅ |
| QR anulado o inexistente: no registra; la imagen pública del QR devuelve 404 | ✅ |
| Webhook de Brevo: rechaza sin secreto; «delivered» → Entregado | ✅ |
| Límite diario configurable: se detiene y conserva los pendientes | ✅ |
| Fórmulas (`=HYPERLINK(...)`) neutralizadas al guardar y al exportar | ✅ |
| Interfaz móvil sin desplazamiento horizontal; sin errores de JavaScript | ✅ |
| La clave de Brevo no aparece en ningún archivo del proyecto | ✅ |

## Pendiente (requiere sus cuentas)
- Ejecutar la migración en **su** proyecto Supabase y publicar las Edge Functions (README §2 a §4).
- **Envío real** por Brevo con remitente verificado (README §5).
- Escaneo con cámara en un Android y un iPhone físicos sobre HTTPS.
