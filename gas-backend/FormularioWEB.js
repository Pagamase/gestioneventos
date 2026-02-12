function doPost_legacy_disabled(e) {
  const props = PropertiesService.getScriptProperties();

  // ✅ Spreadsheet 2026 (ponlo en Script Properties como SPREADSHEET_ID)
  // Fallback por si no está puesto:
  const SPREADSHEET_ID =
    props.getProperty("SPREADSHEET_ID") ||
    "13VpknYmweNSEAxlbawBugh6sM7I9lFxvJ6o9i5hwrXQ";

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const modo = e.parameter.modo || "guardar";
  const mes = e.parameter.mes; // ej: "Enero - 2026"
  const dias = e.parameter.dias ? e.parameter.dias.split(",") : [];

  // ✅ Calendarios: pon CALENDAR_ID_1 y CALENDAR_ID_2 en Script Properties
  // Fallback: tu calendario antiguo en CALENDAR_ID_1 si no está puesto en props
  const calendarIds = [
    props.getProperty("CALENDAR_ID_1") || "t89fi5v8sj5a0o16guv0rbrbgk@group.calendar.google.com",
    props.getProperty("CALENDAR_ID_2") // puede estar vacío
  ].filter(Boolean);

  const calendars = calendarIds
    .map(id => CalendarApp.getCalendarById(id))
    .filter(Boolean);

  if (calendars.length === 0) {
    return ContentService.createTextOutput(JSON.stringify({
      error: "❌ No hay calendarios configurados. Revisa CALENDAR_ID_1 / CALENDAR_ID_2 en Script Properties."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  function toBool(v) {
    if (v === true) return true;
    if (v === false || v == null) return false;
    const s = String(v).trim().toLowerCase();
    return s === "true" || s === "on" || s === "1" || s === "sí" || s === "si";
  }

  const MESES = {
    "ENERO": 0, "FEBRERO": 1, "MARZO": 2, "ABRIL": 3,
    "MAYO": 4, "JUNIO": 5, "JULIO": 6, "AGOSTO": 7,
    "SEPTIEMBRE": 8, "OCTUBRE": 9, "NOVIEMBRE": 10, "DICIEMBRE": 11
  };

  function parseFechaDesdeMesYDia_(mesStr, diaNum) {
    // mesStr: "Enero - 2026"
    const partes = (mesStr || "").split(" - ");
    if (partes.length < 2) return null;

    const mesTexto = partes[0];
    const añoTexto = partes[1];

    const mesNum = MESES[String(mesTexto).toUpperCase()];
    const año = parseInt(añoTexto, 10);
    const dia = parseInt(diaNum, 10);

    if (isNaN(mesNum) || isNaN(año) || isNaN(dia)) return null;
    return new Date(año, mesNum, dia);
  }

  function crearAllDayEnTodos_(titulo, fecha) {
    calendars.forEach(cal => cal.createAllDayEvent(titulo, fecha));
  }

  function borrarAllDayEnTodos_(titulo, fecha) {
    // Borrado por título + día (all-day)
    const fechaInicio = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
    const fechaFin = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 1);

    calendars.forEach(cal => {
      const eventos = cal.getEvents(fechaInicio, fechaFin);
      eventos.forEach(ev => {
        if (ev.isAllDayEvent() && ev.getTitle() === titulo) ev.deleteEvent();
      });
    });
  }

  const hoja = ss.getSheetByName(mes);
  if (!hoja) {
    return ContentService.createTextOutput(JSON.stringify({
      error: "❌ El mes especificado no es válido o no existe en la hoja de cálculo."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // --- CONSULTA DE GANANCIAS ---
  if (modo === "consulta") {
    const total = hoja.getRange("K33").getValue(); // movido una a la derecha
    const real = hoja.getRange("O33").getValue();
    return ContentService.createTextOutput(JSON.stringify({ total, real }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // --- RESET DE DÍAS ---
  if (modo === "reset") {
    try {
      dias.forEach(function(diaStr) {
        const diaNum = parseInt(diaStr, 10);
        const fila = diaNum + 1;

        if (!isNaN(fila) && !isNaN(diaNum)) {
          const tituloEvento = hoja.getRange(fila, 3).getValue(); // C

          const fecha = parseFechaDesdeMesYDia_(mes, diaNum);
          if (fecha && tituloEvento) {
            borrarAllDayEnTodos_(tituloEvento, fecha);
          }

          hoja.getRange(fila, 3).clearContent();        // C: Evento
          hoja.getRange(fila, 4).setValue("Ninguna");   // D: Tarifa
          hoja.getRange(fila, 6).setValue("No");        // F: Extras
          hoja.getRange(fila, 7).setValue(false);       // G: Media jornada
          hoja.getRange(fila, 8).setValue(false);       // H: Jefe y Operador
          hoja.getRange(fila, 9).setValue(false);       // I: Doble jornada
          hoja.getRange(fila, 4).setNote("");           // quitar nota
        }
      });

      return ContentService.createTextOutput(JSON.stringify({ result: "Días reseteados correctamente" }))
        .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Error al resetear los días" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // --- DÍAS LIBRES ---
  if (modo === "diasLibres") {
    try {
      dias.forEach(function(diaLibreStr) {
        const diaNum = parseInt(diaLibreStr, 10);
        const filaLibre = diaNum + 1;

        if (!isNaN(filaLibre) && !isNaN(diaNum)) {
          hoja.getRange(filaLibre, 3).setValue("Descanso"); // C
          const fecha = parseFechaDesdeMesYDia_(mes, diaNum);

          if (fecha) {
            const nota = hoja.getRange(filaLibre, 4).getNote(); // D
            if (nota !== "evento creado") {
              crearAllDayEnTodos_("Descanso", fecha);
              hoja.getRange(filaLibre, 4).setNote("evento creado");
            }
          }
        }
      });

      return ContentService.createTextOutput(JSON.stringify({ result: "success" }))
        .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Error al procesar los días libres" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // --- REGISTRO NORMAL ---
  const dia = parseInt(e.parameter.dia, 10);
  const fila = dia + 1;

  if (isNaN(dia)) {
    return ContentService.createTextOutput(JSON.stringify({ error: "❌ Día inválido" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  hoja.getRange(fila, 3).setValue(e.parameter.evento);                  // C: Evento
  hoja.getRange(fila, 4).setValue(e.parameter.tarifa);                  // D: Tarifa
  hoja.getRange(fila, 6).setValue(e.parameter.extras);                  // F: Extras
  hoja.getRange(fila, 7).setValue(toBool(e.parameter.mediaJornada));     // G: Media jornada
  hoja.getRange(fila, 8).setValue(toBool(e.parameter.jefeOperador));     // H: Jefe y Operador
  hoja.getRange(fila, 9).setValue(toBool(e.parameter["Doble jornada"])); // I: Doble jornada

  // --- Evento al calendario (en 1 o 2 calendarios) ---
  const evento = e.parameter.evento;
  if (evento) {
    const fecha = parseFechaDesdeMesYDia_(mes, dia);
    const nota = hoja.getRange(fila, 4).getNote();

    if (fecha && nota !== "evento creado") {
      crearAllDayEnTodos_(evento, fecha);
      hoja.getRange(fila, 4).setNote("evento creado");
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ result: "success" }))
    .setMimeType(ContentService.MimeType.JSON);
}
