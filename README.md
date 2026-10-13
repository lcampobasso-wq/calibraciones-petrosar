# Calibración de Detectores — PETROSAR

App para emitir certificados de calibración (A4) y etiquetas (30×20 mm) de detectores monogas,
con control de vencimientos, aviso por mail, QR de verificación y control de vida útil
(equipos descartables: máximo 4 calibraciones, configurable).

## Archivos
- `index.html` — la app (frontend, un solo archivo)
- `api/avisos.js` — aviso diario por mail (Vercel Function)
- `vercel.json` — programa el aviso todos los días 08:00 (Argentina)
- `package.json` — dependencia `nodemailer`
- `supabase/tablas.sql` — tablas de la base de datos

## Puesta en marcha
1. **Supabase** → SQL Editor → ejecutar `supabase/tablas.sql`.
2. En `index.html`, al principio del `<script>`, completar `SUPA_URL` y `SUPA_KEY` (anon key).
3. **GitHub**: crear el repo `calibraciones-petrosar` y subir todo (menos `node_modules`).
4. **Vercel** → Add New → Project → importar el repo → Deploy.
5. Vercel → Settings → Environment Variables:
   | Variable | Valor |
   |---|---|
   | `SUPABASE_URL` | https://xxxx.supabase.co |
   | `SUPABASE_SERVICE_KEY` | service_role key (Supabase → Settings → API) |
   | `CRON_SECRET` | una clave larga cualquiera |
   | `SMTP_HOST` | ej. smtp.gmail.com / smtp.office365.com |
   | `SMTP_PORT` | 587 (o 465) |
   | `SMTP_USER` | cuenta que envía |
   | `SMTP_PASS` | contraseña de aplicación |
   | `SMTP_FROM` | opcional, ej. `Calibraciones PETROSAR <cuenta@...>` |
   Luego **Redeploy**.
6. En la app → Vencimientos → destinatarios (por defecto pmorales@petrosar.com) y días de anticipación.
7. Probar: Vercel → Settings → Cron Jobs → **Run** sobre `/api/avisos`.

## Uso
- El QR del certificado y de la etiqueta abre `https://<app>/?v=<código>` con el estado del certificado
  (vigente / por vencer / vencido / reemplazado) y la descarga en PDF.
- El aviso se manda una sola vez por certificado; al recalibrar el equipo se reinicia.
- Vida útil: cada certificado lleva su N° de calibración (1/4…4/4). En la 4ª se marca como ÚLTIMA en certificado,
  etiqueta y QR, aparece en «A reponer» y el mail del día siguiente pide reponer el equipo. No se permite una 5ª.
  Al vencer, el equipo se da de baja desde Vencimientos.
- Asignación: cada equipo tiene «Asignado a» y «Base» con historial (Ver → Asignación). Al dar de baja un equipo,
  la persona queda en «sin detector» hasta que se le asigne uno nuevo. La persona no va en la etiqueta ni en el certificado,
  ni en la página pública del QR; sí en Vencimientos y en los mails.
- Importar inventario (Vencimientos → Importar inventario): pegar filas de Excel. Los equipos entran como «importados»
  (sin certificado propio; se les puede imprimir la etiqueta). El próximo certificado lo emite la app.
- Equipos con historia previa (calibrados antes de usar la app): al cargarlos por primera vez, elegir a mano el «Calib. N°».
- Si ya habías creado las tablas con una versión anterior, volvé a ejecutar `supabase/tablas.sql` (agrega las columnas nuevas).
