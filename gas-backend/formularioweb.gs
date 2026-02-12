var APP_VERSION = "backend-fix-2026-02-12-v4";

function doGet(e) {
  if (e && e.parameter && e.parameter.ping === "1") {
    return json_({ ok: true, version: APP_VERSION });
  }
  return json_({ ok: true });
}

function doPost(e) {
  const props = PropertiesService.getScriptProperties();

  const SPREADSHEET_ID =
    props.getProperty("SPREADSHEET_ID") ||
    "1GlBG2lRCFEkdZc8q_igLwia8ekyRGtUT5qo8sWqLgH4";

  const calendarIds = [
    props.getProperty("CALENDAR_ID_1") || "t89fi5v8sj5a0o16guv0rbrbgk@group.calendar.google.com",
    props.getProperty("CALENDAR_ID_2")
  ].filter(Boolean);

  const calendars = calendarIds
    .map(function (id) { return CalendarApp.getCalendarById(id); })
    .filter(Boolean);

  if (calendars.length === 0) {
    return json_({
      error: "No hay calendarios configurados. Revisa CALENDAR_ID_1 y CALENDAR_ID_2."
    });
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const modo = (e && e.parameter && e.parameter.modo) || "guardar";
  const mes = (e && e.parameter && e.parameter.mes) || "";
  const dias = (e && e.parameter && e.parameter.dias)
    ? String(e.parameter.dias).split(",").map(function (d) { return d.trim(); }).filter(Boolean)
    : [];

  const hoja = ss.getSheetByName(mes);
  if (!hoja) {
    return json_({ error: "El mes indicado no existe en la hoja." });
  }

  if (modo === "consulta") {
    const total = hoja.getRange("K33").getValue();
    const real = hoja.getRange("O33").getValue();
    return json_({ total: total, real: real, version: APP_VERSION });
  }

  if (modo === "reset") {
    try {
      dias.forEach(function (diaStr) {
        const diaNum = parseInt(diaStr, 10);
        if (isNaN(diaNum)) return;

        const fila = diaNum + 1;
        const tituloEvento = String(hoja.getRange(fila, 3).getValue() || "").trim();
        const notaRange = hoja.getRange(fila, 4);
        const nota = String(notaRange.getNote() || "");
        const ids = parseIdsFromNote_(nota);
        const fecha = parseFechaDesdeMesYDia_(mes, diaNum);

        if (fecha && tituloEvento) {
          borrarEventoEnTodos_(calendars, ids, tituloEvento, fecha);
        } else if (fecha) {
          // Si no hay titulo, intentamos borrar por IDs igualmente.
          borrarEventoEnTodos_(calendars, ids, "", fecha);
        }

        hoja.getRange(fila, 3).clearContent();      // C: Evento
        hoja.getRange(fila, 4).setValue("Ninguna"); // D: Tarifa
        hoja.getRange(fila, 6).setValue("No");      // F: Extras
        hoja.getRange(fila, 7).setValue(false);     // G: Media jornada
        hoja.getRange(fila, 8).setValue(false);     // H: Jefe y Operador
        hoja.getRange(fila, 9).setValue(false);     // I: Doble jornada
        notaRange.setNote("");
      });

      return json_({ result: "Dias reseteados correctamente", version: APP_VERSION });
    } catch (err) {
      return json_({ error: "Error al resetear los dias", detail: String(err) });
    }
  }

  if (modo === "diasLibres") {
    try {
      dias.forEach(function (diaLibreStr) {
        const diaNum = parseInt(diaLibreStr, 10);
        if (isNaN(diaNum)) return;

        const fila = diaNum + 1;
        const fecha = parseFechaDesdeMesYDia_(mes, diaNum);
        if (!fecha) return;

        hoja.getRange(fila, 3).setValue("Descanso"); // C
        const notaRange = hoja.getRange(fila, 4);
        const notaActual = String(notaRange.getNote() || "");
        const idsActuales = parseIdsFromNote_(notaActual);
        const nuevosIds = upsertEventoEnTodos_(calendars, idsActuales, "Descanso", fecha);
        notaRange.setNote(JSON.stringify(nuevosIds));
      });

      return json_({ result: "success", version: APP_VERSION });
    } catch (err) {
      return json_({ error: "Error al procesar dias libres", detail: String(err) });
    }
  }

  // Registro normal.
  const dia = parseInt((e && e.parameter && e.parameter.dia) || "", 10);
  if (isNaN(dia)) {
    return json_({ error: "Dia invalido" });
  }

  const fila = dia + 1;
  const tituloAnterior = String(hoja.getRange(fila, 3).getValue() || "").trim();
  const notaRange = hoja.getRange(fila, 4);
  const notaActual = String(notaRange.getNote() || "");
  const idsActuales = parseIdsFromNote_(notaActual);
  const evento = String((e && e.parameter && e.parameter.evento) || "").trim();

  hoja.getRange(fila, 3).setValue(evento);                               // C: Evento
  hoja.getRange(fila, 4).setValue((e && e.parameter && e.parameter.tarifa) || "Ninguna"); // D: Tarifa
  hoja.getRange(fila, 6).setValue((e && e.parameter && e.parameter.extras) || "No");       // F: Extras
  hoja.getRange(fila, 7).setValue(toBool_((e && e.parameter && e.parameter.mediaJornada))); // G
  hoja.getRange(fila, 8).setValue(toBool_((e && e.parameter && e.parameter.jefeOperador))); // H
  hoja.getRange(fila, 9).setValue(toBool_((e && e.parameter && e.parameter["Doble jornada"]))); // I

  if (evento) {
    const fecha = parseFechaDesdeMesYDia_(mes, dia);
    if (fecha) {
      // Si no hay IDs válidos y cambia el título, limpiamos el evento anterior por fallback.
      if (!hasAnyId_(idsActuales) && tituloAnterior && tituloAnterior !== evento) {
        borrarPorTituloEnTodos_(calendars, tituloAnterior, fecha);
      }

      const nuevosIds = upsertEventoEnTodos_(calendars, idsActuales, evento, fecha);
      notaRange.setNote(JSON.stringify(nuevosIds));
    }
  } else {
    notaRange.setNote("");
  }

  return json_({ result: "success", version: APP_VERSION });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function toBool_(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "on" || s === "1" || s === "si" || s === "sí";
}

function parseFechaDesdeMesYDia_(mesStr, diaNum) {
  const MESES = {
    ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3,
    MAYO: 4, JUNIO: 5, JULIO: 6, AGOSTO: 7,
    SEPTIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11
  };

  const partes = String(mesStr || "").split(" - ");
  if (partes.length < 2) return null;

  const mesTexto = String(partes[0] || "").toUpperCase();
  const anio = parseInt(partes[1], 10);
  const mes = MESES[mesTexto];
  const dia = parseInt(diaNum, 10);

  if (isNaN(anio) || typeof mes !== "number" || isNaN(dia)) return null;
  return new Date(anio, mes, dia);
}

function parseIdsFromNote_(note) {
  const raw = String(note || "").trim();
  if (!raw) return {};
  if (raw.toLowerCase() === "evento creado") return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    // Nuevo formato: {"ids":{"calendarId":"eventId"}}
    if (parsed.ids && typeof parsed.ids === "object") {
      return sanitizeIdMap_(parsed.ids);
    }
    // Legacy: {"cal1":"...","cal2":"..."}
    const legacy = {};
    if (parsed.cal1) legacy.cal1 = String(parsed.cal1);
    if (parsed.cal2) legacy.cal2 = String(parsed.cal2);
    return legacy;
  } catch (err) {
    return {};
  }
}

function hasAnyId_(ids) {
  return Boolean(ids && Object.keys(ids).length > 0);
}

function upsertEventoEnTodos_(calendars, idsActuales, titulo, fecha) {
  const out = { ids: {} };
  const legacyKeys = ["cal1", "cal2"];

  calendars.forEach(function (cal, idx) {
    const calId = String(cal.getId());
    const legacyKey = legacyKeys[idx] || "";
    const existingId =
      (idsActuales && idsActuales[calId]) ||
      (legacyKey && idsActuales && idsActuales[legacyKey]) ||
      "";

    const event = getEventoById_(cal, String(existingId || ""));

    if (event) {
      event.deleteEvent();
    }

    const recreated = cal.createAllDayEvent(titulo, fecha);
    out.ids[calId] = recreated.getId();
  });

  return out;
}

function borrarEventoEnTodos_(calendars, idsActuales, titulo, fecha) {
  const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const fin = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 1);
  const legacyKeys = ["cal1", "cal2"];

  calendars.forEach(function (cal, idx) {
    const calId = String(cal.getId());
    const legacyKey = legacyKeys[idx] || "";
    const existingId =
      (idsActuales && idsActuales[calId]) ||
      (legacyKey && idsActuales && idsActuales[legacyKey]) ||
      "";
    const byId = getEventoById_(cal, String(existingId || ""));

    if (byId) {
      byId.deleteEvent();
      return;
    }

    if (!titulo) return;
    borrarPorTituloEnCalendario_(cal, titulo, inicio, fin);
  });
}

function borrarPorTituloEnTodos_(calendars, titulo, fecha) {
  const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const fin = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 1);
  calendars.forEach(function (cal) {
    borrarPorTituloEnCalendario_(cal, titulo, inicio, fin);
  });
}

function borrarPorTituloEnCalendario_(cal, titulo, inicio, fin) {
  const objetivo = String(titulo || "").trim();
  if (!objetivo) return;
  const events = cal.getEvents(inicio, fin);
  events.forEach(function (ev) {
    if (ev.isAllDayEvent() && String(ev.getTitle() || "").trim() === objetivo) {
      ev.deleteEvent();
    }
  });
}

function getEventoById_(cal, id) {
  if (!id) return null;
  try {
    return cal.getEventById(id) || null;
  } catch (err) {
    // Intento alternativo comun cuando el ID se guarda sin sufijo.
    try {
      if (id.indexOf("@") === -1) {
        return cal.getEventById(id + "@google.com") || null;
      }
    } catch (err2) {
      // no-op
    }
    return null;
  }
}

function sanitizeIdMap_(idMap) {
  const out = {};
  Object.keys(idMap).forEach(function (k) {
    const key = String(k || "").trim();
    const val = String(idMap[k] || "").trim();
    if (key && val) out[key] = val;
  });
  return out;
}
