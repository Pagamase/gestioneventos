PROYECTO: Web/PWA Registro de Jornadas + Google Sheets + Google Calendar (Migración 2026)
Fecha de resumen: 2026-02-12

1) OBJETIVO
El usuario tiene una web/PWA (Netlify, usada sobre todo desde iPhone) para:
- Registrar jornadas/eventos (evento, tarifa, extras, flags, etc.) en Google Sheets con una hoja por mes.
- Crear eventos en Google Calendar automáticamente al guardar.
- Acciones desde la web (modales):
  - Consulta de ganancias
  - Reset de días
  - Asignar días libres (marca “Descanso” y crea evento all-day)

NUEVO:
- Crear/borrar eventos en 2 calendarios a la vez.
- Mejora “B”: anti-duplicados perfecto guardando IDs de eventos.

2) PREFERENCIAS/RESTRICCIONES
- El usuario NO quiere ver código en el chat.
- Quiere recibir cambios como ZIP con TODOS los archivos del proyecto.
- Migración 2025 -> 2026.

3) IDENTIFICADORES CONFIRMADOS
3.1 Google Sheets 2026
- SPREADSHEET_ID (Sheets 2026):
  1GlBG2lRCFEkdZc8q_igLwia8ekyRGtUT5qo8sWqLgH4
- Nombres de pestañas/hojas:
  "Mes - 2026"
  Ej: "Enero - 2026", "Febrero - 2026", ..., "Diciembre - 2026"

3.2 Apps Script Web App (backend)
- URL actual del Web App (frontend apunta aquí):
  https://script.google.com/macros/s/AKfycbwrgAgbS8C4TqhU5Uw-MFHAbb9moH8c9Mlnh4Rjv7XNiUNlRdYYQCap-PUTDXe9RcI/exec

3.3 Google Calendar (2 calendarios)
- CALENDAR_ID_1: calendario antiguo (ya existía)
- CALENDAR_ID_2: calendario nuevo
- Ejemplo visto de ID válido (calendario principal):
  familiagarmarser@gmail.com

3.4 Script Properties (recomendado)
Guardar configuración en Script Properties:
- SPREADSHEET_ID
- CALENDAR_ID_1
- CALENDAR_ID_2

4) BACKEND ACTUAL: COMPORTAMIENTO doPost (RESUMEN)
El doPost(e) gestiona un parámetro "modo":

4.1 modo=consulta
- Devuelve un JSON con dos campos (total y real) leyendo celdas fijas del mes:
  - K33 (total)
  - O33 (real)

4.2 modo=reset
- Recibe "dias" como CSV (ej "1,2,3") y por cada día:
  - fila = día + 1
  - Borra evento del calendario (actualmente por título + rango del día)
  - Limpia celdas de esa fila (evento, tarifa, extras, flags)
  - Limpia nota en Tarifa (se usaba “evento creado”)

4.3 modo=diasLibres
- Marca el día como “Descanso”
- Crea evento “Descanso” all-day en Calendar
- Escribe nota “evento creado” para evitar duplicados

4.4 Registro normal (modo por defecto)
- Escribe valores del formulario:
  evento, tarifa, extras, mediaJornada, jefeOperador, doble jornada
- Crea evento all-day con título = evento
- Usa nota “evento creado” como protección anti-duplicados

4.5 Parámetros desde la web (resumen)
- modo (opcional)
- mes (string, ej "Enero - 2026")
- dia (número, registro normal)
- dias (CSV, reset y diasLibres)
- evento, tarifa, extras, mediaJornada, jefeOperador, "Doble jornada"

5) FRONTEND (index.html): CAMBIOS 2026
- Actualizar todos los selectores/listas de meses para enviar: "Mes - 2026"
- Actualizar link del botón/ícono de Drive para abrir el Sheet 2026 (ID nuevo)
- Actualizar "scriptURL" para usar el Web App URL actual (arriba)

6) FÓRMULAS 2026 (TABLA RESUMEN)
- Rango confirmado: B2:M6 (12 columnas = meses)
- Regla: referencias "Mes - 2025" -> "Mes - 2026" dentro de las fórmulas (manteniendo orden Mes - Año)

7) MEJORA “B” (PRIORIDAD): ANTI-DUPLICADOS PERFECTO CON EVENT IDs
Problema: la nota “evento creado” no identifica eventos concretos.
Solución: guardar Event IDs reales (2 IDs, uno por calendario).

7.1 Objetivo funcional
- Guardar IDs reales:
  - cal1: ID evento en CALENDAR_ID_1
  - cal2: ID evento en CALENDAR_ID_2
- En guardado:
  - si existe ID -> actualizar evento
  - si no existe / inválido -> crear y guardar ID
- En reset:
  - borrar por ID y limpiar IDs
- Si el evento fue borrado a mano:
  - detectar y recrear

7.2 Dónde guardar IDs
Opción preferida (sin tocar columnas): guardar JSON en la NOTA de una celda (p.ej Tarifa):
- Ej: {"cal1":"EVENT_ID_1","cal2":"EVENT_ID_2"}

Alternativa: columnas ocultas para IDs (más limpio pero cambia el sheet).

7.3 Compatibilidad hacia atrás
Si la nota es “evento creado” (antiguo):
- Migrar a JSON en el siguiente guardado, o limpiar y recrear con IDs.

7.4 Doble calendario
Todas las operaciones (create/update/delete) deben ejecutarse en ambos calendarios (si CALENDAR_ID_2 está configurado).

8) PAQUETE BASE
- El usuario subió un archivo base como RAR ("Web OK.rar").
- Para integrar cambios y devolver un ZIP final con TODO, se recomienda convertirlo a ZIP.

9) CHECKLIST DE PUESTA EN MARCHA
1) Apps Script -> Script Properties:
   - SPREADSHEET_ID = 1GlBG2lRCFEkdZc8q_igLwia8ekyRGtUT5qo8sWqLgH4
   - CALENDAR_ID_1 = (calendario antiguo)
   - CALENDAR_ID_2 = (calendario nuevo)
2) Deploy Apps Script (Web App):
   - Execute as: Me
   - Access: Anyone / Anyone with link
   - Si cambias código: Deploy -> Manage deployments -> Edit -> Deploy
3) Frontend:
   - scriptURL correcto (Web App URL)
   - meses enviados como "Mes - 2026"

10) SMOKE TESTS (PRUEBAS RÁPIDAS)
- Guardar evento normal: escribe en hoja correcta + crea evento en 2 calendarios.
- Días libres: “Descanso” en sheet + evento “Descanso” all-day en 2 calendarios.
- Reset: limpia fila + borra eventos en 2 calendarios.

11) PARA CODEX: TAREAS Y ENTREGABLES
Tarea principal:
- Implementar Mejora B:
  - Guardar IDs en nota JSON (cal1/cal2)
  - Update si existe; create si no.
  - Reset borra por ID (fallback título+rango si no hay IDs)
  - Migrar nota antigua “evento creado” cuando proceda.

Entregable:
- ZIP final con TODOS los archivos (frontend + backend) listo para desplegar.
