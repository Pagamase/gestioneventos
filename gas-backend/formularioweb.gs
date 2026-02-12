var APP_VERSION = "event-workflow-2026-02-12-v1";

var MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function doGet(e) {
  if (e && e.parameter && e.parameter.ping === "1") {
    return json_({ ok: true, version: APP_VERSION });
  }
  return json_({ ok: true, version: APP_VERSION });
}

function doPost(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var props = PropertiesService.getScriptProperties();

    var spreadsheetId = props.getProperty("SPREADSHEET_ID") || "1GlBG2lRCFEkdZc8q_igLwia8ekyRGtUT5qo8sWqLgH4";
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var calendars = resolveCalendars_(props);
    if (calendars.length === 0) {
      return json_({ error: "No hay calendarios configurados.", version: APP_VERSION });
    }

    var modo = String(params.modo || "guardar");

    if (modo === "consulta") return handleConsulta_(ss, params);
    if (modo === "reset") return handleReset_(ss, calendars, params);
    if (modo === "diasLibres") return handleDiasLibres_(ss, calendars, params);

    if (modo === "guardarEventoRango") return handleGuardarEventoRango_(ss, calendars, params);
    if (modo === "listarEventos") return handleListarEventos_(ss, params);
    if (modo === "obtenerEvento") return handleObtenerEvento_(ss, params);
    if (modo === "actualizarEvento") return handleActualizarEvento_(ss, calendars, params);

    return handleGuardarLegacyDia_(ss, calendars, params);
  } catch (err) {
    return json_({ error: "Error interno", detail: String(err), version: APP_VERSION });
  }
}

function handleConsulta_(ss, params) {
  var mes = String(params.mes || "");
  var hoja = ss.getSheetByName(mes);
  if (!hoja) return json_({ error: "Mes no valido", version: APP_VERSION });

  var total = hoja.getRange("K33").getValue();
  var real = hoja.getRange("O33").getValue();
  return json_({ total: total, real: real, version: APP_VERSION });
}

function handleReset_(ss, calendars, params) {
  var mes = String(params.mes || "");
  var dias = String(params.dias || "")
    .split(",")
    .map(function (d) { return d.trim(); })
    .filter(Boolean);

  var hoja = ss.getSheetByName(mes);
  if (!hoja) return json_({ error: "Mes no valido", version: APP_VERSION });

  var procesados = 0;
  dias.forEach(function (diaStr) {
    var dia = parseInt(diaStr, 10);
    if (isNaN(dia)) return;

    var fila = dia + 1;
    var fecha = parseFechaDesdeMesYDia_(mes, dia);
    if (!fecha) return;

    var rowState = readRowState_(hoja, fila);
    borrarEventoEnTodos_(calendars, rowState.noteData, rowState.evento, fecha);
    clearRow_(hoja, fila);
    procesados++;
  });

  return json_({ result: "success", dias: procesados, version: APP_VERSION });
}

function handleDiasLibres_(ss, calendars, params) {
  var mes = String(params.mes || "");
  var dias = String(params.dias || "")
    .split(",")
    .map(function (d) { return d.trim(); })
    .filter(Boolean);

  var hoja = ss.getSheetByName(mes);
  if (!hoja) return json_({ error: "Mes no valido", version: APP_VERSION });

  var procesados = 0;
  dias.forEach(function (diaStr) {
    var dia = parseInt(diaStr, 10);
    if (isNaN(dia)) return;

    var fila = dia + 1;
    var fecha = parseFechaDesdeMesYDia_(mes, dia);
    if (!fecha) return;

    var rowState = readRowState_(hoja, fila);
    var idsMap = upsertEventoEnTodos_(calendars, rowState.noteData, "Descanso", fecha, rowState.evento);
    hoja.getRange(fila, 3).setValue("Descanso");
    hoja.getRange(fila, 4).setNote(JSON.stringify(buildNoteData_(idsMap, "", "Descanso", "", "")));
    procesados++;
  });

  return json_({ result: "success", dias: procesados, version: APP_VERSION });
}

function handleGuardarLegacyDia_(ss, calendars, params) {
  var mes = String(params.mes || "");
  var dia = parseInt(String(params.dia || ""), 10);
  if (isNaN(dia)) return json_({ error: "Dia invalido", version: APP_VERSION });

  var hoja = ss.getSheetByName(mes);
  if (!hoja) return json_({ error: "Mes no valido", version: APP_VERSION });

  var fila = dia + 1;
  var evento = String(params.evento || "").trim();
  var fecha = parseFechaDesdeMesYDia_(mes, dia);
  if (!fecha) return json_({ error: "Fecha invalida", version: APP_VERSION });

  var rowState = readRowState_(hoja, fila);
  var payload = {
    evento: evento,
    tarifa: hasText_(params.tarifa) ? String(params.tarifa) : "Ninguna",
    extras: hasText_(params.extras) ? String(params.extras) : "No",
    mediaJornada: toBool_(params.mediaJornada),
    jefeOperador: toBool_(params.jefeOperador),
    dobleJornada: toBool_(params["Doble jornada"])
  };
  writeRow_(hoja, fila, payload);

  if (!evento) {
    hoja.getRange(fila, 4).setNote("");
    return json_({ result: "success", version: APP_VERSION });
  }

  var idsMap = upsertEventoEnTodos_(calendars, rowState.noteData, evento, fecha, rowState.evento);
  var existingKey = rowState.noteData.eventKey || "";
  var noteData = buildNoteData_(idsMap, existingKey, evento, "", "");
  hoja.getRange(fila, 4).setNote(JSON.stringify(noteData));

  return json_({ result: "success", version: APP_VERSION });
}

function handleGuardarEventoRango_(ss, calendars, params) {
  var evento = String(params.evento || "").trim();
  if (!evento) return json_({ error: "Falta nombre del evento", version: APP_VERSION });

  var inicio = parseIsoDate_(params.fechaInicio);
  var fin = parseIsoDate_(params.fechaFin || params.fechaInicio);
  if (!inicio || !fin) return json_({ error: "Fechas invalidas", version: APP_VERSION });
  if (inicio.getTime() > fin.getTime()) return json_({ error: "La fecha final debe ser mayor o igual", version: APP_VERSION });

  var eventKey = String(params.eventKey || Utilities.getUuid());
  var payload = {
    eventKey: eventKey,
    evento: evento,
    fechaInicio: toIsoDate_(inicio),
    fechaFin: toIsoDate_(fin),
    tarifa: hasText_(params.tarifa) ? String(params.tarifa) : "Ninguna",
    extras: hasText_(params.extras) ? String(params.extras) : "No",
    mediaJornada: toBool_(params.mediaJornada),
    jefeOperador: toBool_(params.jefeOperador),
    dobleJornada: toBool_(params["Doble jornada"])
  };

  var contexts = collectContextsForRange_(ss, inicio, fin, eventKey);
  saveContexts_(calendars, contexts, payload);

  return json_({
    result: "success",
    eventKey: eventKey,
    dias: contexts.length,
    version: APP_VERSION
  });
}

function handleListarEventos_(ss, params) {
  var q = String(params.q || "").trim().toLowerCase();
  var rows = collectAllEventRows_(ss);
  var byKey = {};

  rows.forEach(function (r) {
    var key = r.noteData.eventKey;
    if (!key) return;
    if (!byKey[key]) {
      byKey[key] = {
        eventKey: key,
        evento: r.evento || r.noteData.eventName || "Evento",
        fechaInicio: r.iso,
        fechaFin: r.iso,
        tarifa: r.tarifa || "Ninguna",
        dias: 0
      };
    }

    var item = byKey[key];
    if (r.iso < item.fechaInicio) item.fechaInicio = r.iso;
    if (r.iso > item.fechaFin) item.fechaFin = r.iso;
    if (r.evento) item.evento = r.evento;
    item.dias++;
  });

  var events = Object.keys(byKey)
    .map(function (k) { return byKey[k]; })
    .filter(function (ev) {
      if (!q) return true;
      return String(ev.evento || "").toLowerCase().indexOf(q) !== -1;
    })
    .sort(function (a, b) {
      if (a.fechaInicio < b.fechaInicio) return 1;
      if (a.fechaInicio > b.fechaInicio) return -1;
      return 0;
    });

  return json_({ result: "success", events: events, version: APP_VERSION });
}

function handleObtenerEvento_(ss, params) {
  var eventKey = String(params.eventKey || "").trim();
  if (!eventKey) return json_({ error: "Falta eventKey", version: APP_VERSION });

  var rows = collectAllEventRows_(ss).filter(function (r) {
    return r.noteData.eventKey === eventKey;
  });
  rows.sort(function (a, b) { return a.date.getTime() - b.date.getTime(); });
  if (rows.length === 0) return json_({ error: "Evento no encontrado", version: APP_VERSION });

  var first = rows[0];
  var last = rows[rows.length - 1];

  return json_({
    result: "success",
    event: {
      eventKey: eventKey,
      evento: first.evento || first.noteData.eventName || "",
      fechaInicio: first.iso,
      fechaFin: last.iso,
      tarifa: first.tarifa || "Ninguna",
      extras: first.extras || "No",
      mediaJornada: toBool_(first.mediaJornada),
      jefeOperador: toBool_(first.jefeOperador),
      dobleJornada: toBool_(first.dobleJornada),
      dias: rows.map(function (r) { return r.iso; })
    },
    version: APP_VERSION
  });
}

function handleActualizarEvento_(ss, calendars, params) {
  var eventKey = String(params.eventKey || "").trim();
  if (!eventKey) return json_({ error: "Falta eventKey", version: APP_VERSION });

  var existingRows = collectAllEventRows_(ss).filter(function (r) {
    return r.noteData.eventKey === eventKey;
  });
  existingRows.sort(function (a, b) { return a.date.getTime() - b.date.getTime(); });
  if (existingRows.length === 0) return json_({ error: "Evento no encontrado", version: APP_VERSION });

  var existingByIso = {};
  existingRows.forEach(function (r) { existingByIso[r.iso] = r; });

  var first = existingRows[0];
  var last = existingRows[existingRows.length - 1];

  var inicio = parseIsoDate_(params.fechaInicio || first.iso);
  var fin = parseIsoDate_(params.fechaFin || last.iso);
  if (!inicio || !fin) return json_({ error: "Fechas invalidas", version: APP_VERSION });
  if (inicio.getTime() > fin.getTime()) return json_({ error: "La fecha final debe ser mayor o igual", version: APP_VERSION });

  var evento = String(params.evento || first.evento || first.noteData.eventName || "").trim();
  if (!evento) return json_({ error: "Falta nombre del evento", version: APP_VERSION });

  var payload = {
    eventKey: eventKey,
    evento: evento,
    fechaInicio: toIsoDate_(inicio),
    fechaFin: toIsoDate_(fin),
    tarifa: hasText_(params.tarifa) ? String(params.tarifa) : String(first.tarifa || "Ninguna"),
    extras: hasText_(params.extras) ? String(params.extras) : String(first.extras || "No"),
    mediaJornada: hasParam_(params, "mediaJornada") ? toBool_(params.mediaJornada) : toBool_(first.mediaJornada),
    jefeOperador: hasParam_(params, "jefeOperador") ? toBool_(params.jefeOperador) : toBool_(first.jefeOperador),
    dobleJornada: hasParam_(params, "Doble jornada") ? toBool_(params["Doble jornada"]) : toBool_(first.dobleJornada)
  };

  var targetDates = expandDateRange_(inicio, fin);
  var targetIsoSet = {};
  targetDates.forEach(function (d) { targetIsoSet[toIsoDate_(d)] = true; });

  var contexts = [];
  targetDates.forEach(function (date) {
    var iso = toIsoDate_(date);
    if (existingByIso[iso]) {
      var ex = existingByIso[iso];
      contexts.push({
        date: date,
        iso: iso,
        sheet: ex.sheet,
        row: ex.row,
        rowState: {
          evento: ex.evento,
          tarifa: ex.tarifa,
          extras: ex.extras,
          mediaJornada: ex.mediaJornada,
          jefeOperador: ex.jefeOperador,
          dobleJornada: ex.dobleJornada,
          noteData: ex.noteData
        }
      });
      return;
    }

    var sheet = getSheetByDate_(ss, date);
    if (!sheet) throw new Error("Falta hoja: " + buildSheetNameFromDate_(date));
    var row = date.getDate() + 1;
    var rowState = readRowState_(sheet, row);

    if (rowState.noteData.eventKey && rowState.noteData.eventKey !== eventKey) {
      throw new Error("Conflicto en " + iso + " con evento " + rowState.noteData.eventKey);
    }

    contexts.push({ date: date, iso: iso, sheet: sheet, row: row, rowState: rowState });
  });

  var removedDays = 0;
  existingRows.forEach(function (r) {
    if (targetIsoSet[r.iso]) return;
    borrarEventoEnTodos_(calendars, r.noteData, r.evento, r.date);
    clearRow_(r.sheet, r.row);
    removedDays++;
  });

  saveContexts_(calendars, contexts, payload);

  return json_({
    result: "success",
    eventKey: eventKey,
    diasActualizados: contexts.length,
    diasEliminados: removedDays,
    version: APP_VERSION
  });
}

function saveContexts_(calendars, contexts, payload) {
  contexts.forEach(function (ctx) {
    var idsMap = upsertEventoEnTodos_(
      calendars,
      ctx.rowState.noteData,
      payload.evento,
      ctx.date,
      ctx.rowState.evento
    );

    writeRow_(ctx.sheet, ctx.row, payload);

    var noteData = buildNoteData_(
      idsMap,
      payload.eventKey,
      payload.evento,
      payload.fechaInicio,
      payload.fechaFin
    );
    ctx.sheet.getRange(ctx.row, 4).setNote(JSON.stringify(noteData));
  });
}

function collectContextsForRange_(ss, inicio, fin, eventKey) {
  var dates = expandDateRange_(inicio, fin);
  var contexts = [];

  dates.forEach(function (date) {
    var sheet = getSheetByDate_(ss, date);
    if (!sheet) throw new Error("Falta hoja: " + buildSheetNameFromDate_(date));

    var row = date.getDate() + 1;
    var rowState = readRowState_(sheet, row);

    if (rowState.noteData.eventKey && rowState.noteData.eventKey !== eventKey) {
      throw new Error("Conflicto en " + toIsoDate_(date) + " con evento " + rowState.noteData.eventKey);
    }

    contexts.push({ date: date, iso: toIsoDate_(date), sheet: sheet, row: row, rowState: rowState });
  });

  return contexts;
}

function collectAllEventRows_(ss) {
  var infos = listMonthSheetInfos_(ss);
  var rows = [];

  infos.forEach(function (info) {
    var values = info.sheet.getRange(2, 3, 31, 7).getValues(); // C..I
    var notes = info.sheet.getRange(2, 4, 31, 1).getNotes();   // Note D

    for (var i = 0; i < 31; i++) {
      var day = i + 1;
      var date = new Date(info.year, info.month, day);
      if (date.getMonth() !== info.month || date.getFullYear() !== info.year) continue;

      var noteData = parseNoteData_(notes[i][0]);
      if (!noteData.eventKey) continue;

      rows.push({
        sheet: info.sheet,
        row: day + 1,
        date: date,
        iso: toIsoDate_(date),
        noteData: noteData,
        evento: String(values[i][0] || "").trim(), // C
        tarifa: String(values[i][1] || "Ninguna"), // D
        extras: String(values[i][3] || "No"), // F
        mediaJornada: toBool_(values[i][4]), // G
        jefeOperador: toBool_(values[i][5]), // H
        dobleJornada: toBool_(values[i][6]) // I
      });
    }
  });

  rows.sort(function (a, b) { return a.date.getTime() - b.date.getTime(); });
  return rows;
}

function listMonthSheetInfos_(ss) {
  var infos = [];
  ss.getSheets().forEach(function (sheet) {
    var parsed = parseMonthSheetName_(sheet.getName());
    if (!parsed) return;
    infos.push({
      sheet: sheet,
      name: sheet.getName(),
      year: parsed.year,
      month: parsed.month
    });
  });

  infos.sort(function (a, b) {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
  return infos;
}

function parseMonthSheetName_(sheetName) {
  var parts = String(sheetName || "").split(" - ");
  if (parts.length !== 2) return null;
  var month = monthIndexFromText_(parts[0]);
  var year = parseInt(parts[1], 10);
  if (month < 0 || isNaN(year)) return null;
  return { month: month, year: year };
}

function buildSheetNameFromDate_(date) {
  return MONTH_NAMES[date.getMonth()] + " - " + date.getFullYear();
}

function getSheetByDate_(ss, date) {
  return ss.getSheetByName(buildSheetNameFromDate_(date));
}

function expandDateRange_(inicio, fin) {
  var out = [];
  var d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  var end = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());
  while (d.getTime() <= end.getTime()) {
    out.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function resolveCalendars_(props) {
  var calendarIds = [
    props.getProperty("CALENDAR_ID_1"),
    props.getProperty("CALENDAR_ID_2")
  ].filter(Boolean);

  return calendarIds
    .map(function (id) { return CalendarApp.getCalendarById(id); })
    .filter(Boolean);
}

function writeRow_(sheet, row, payload) {
  sheet.getRange(row, 3).setValue(payload.evento || ""); // C
  sheet.getRange(row, 4).setValue(payload.tarifa || "Ninguna"); // D
  sheet.getRange(row, 6).setValue(payload.extras || "No"); // F
  sheet.getRange(row, 7).setValue(toBool_(payload.mediaJornada)); // G
  sheet.getRange(row, 8).setValue(toBool_(payload.jefeOperador)); // H
  sheet.getRange(row, 9).setValue(toBool_(payload.dobleJornada)); // I
}

function clearRow_(sheet, row) {
  sheet.getRange(row, 3).clearContent(); // C
  sheet.getRange(row, 4).setValue("Ninguna"); // D
  sheet.getRange(row, 6).setValue("No"); // F
  sheet.getRange(row, 7).setValue(false); // G
  sheet.getRange(row, 8).setValue(false); // H
  sheet.getRange(row, 9).setValue(false); // I
  sheet.getRange(row, 4).setNote("");
}

function readRowState_(sheet, row) {
  return {
    evento: String(sheet.getRange(row, 3).getValue() || "").trim(),
    tarifa: String(sheet.getRange(row, 4).getValue() || "Ninguna"),
    extras: String(sheet.getRange(row, 6).getValue() || "No"),
    mediaJornada: toBool_(sheet.getRange(row, 7).getValue()),
    jefeOperador: toBool_(sheet.getRange(row, 8).getValue()),
    dobleJornada: toBool_(sheet.getRange(row, 9).getValue()),
    noteData: parseNoteData_(sheet.getRange(row, 4).getNote())
  };
}

function upsertEventoEnTodos_(calendars, noteData, titulo, fecha, tituloAnterior) {
  var idsOut = {};

  calendars.forEach(function (cal, idx) {
    var calId = String(cal.getId());
    var existingId = getExistingIdForCalendar_(noteData, calId, idx);
    var event = getEventoById_(cal, existingId);
    var removed = 0;

    if (event) {
      event.deleteEvent();
      removed++;
    }

    if (removed === 0 && tituloAnterior) {
      removed += borrarPorTituloEnCalendario_(cal, tituloAnterior, fecha);
    }
    if (removed === 0 && titulo && titulo !== tituloAnterior) {
      removed += borrarPorTituloEnCalendario_(cal, titulo, fecha);
    }
    if (removed === 0) {
      removed += borrarAllDayEnCalendarioPorDia_(cal, fecha);
    }

    var created = cal.createAllDayEvent(titulo, fecha);
    idsOut[calId] = created.getId();
  });

  return idsOut;
}

function borrarEventoEnTodos_(calendars, noteData, titulo, fecha) {
  calendars.forEach(function (cal, idx) {
    var calId = String(cal.getId());
    var existingId = getExistingIdForCalendar_(noteData, calId, idx);
    var removed = 0;
    var byId = getEventoById_(cal, existingId);
    if (byId) {
      byId.deleteEvent();
      removed++;
    }

    if (titulo) {
      removed += borrarPorTituloEnCalendario_(cal, titulo, fecha);
    }

    if (removed === 0) {
      borrarAllDayEnCalendarioPorDia_(cal, fecha);
    }
  });
}

function borrarPorTituloEnCalendario_(cal, titulo, fechaObjetivo) {
  var objetivo = String(titulo || "").trim().toLowerCase();
  if (!objetivo || !fechaObjetivo) return 0;

  var inicio = new Date(fechaObjetivo.getFullYear(), fechaObjetivo.getMonth(), fechaObjetivo.getDate() - 1);
  var fin = new Date(fechaObjetivo.getFullYear(), fechaObjetivo.getMonth(), fechaObjetivo.getDate() + 2);
  var base = new Date(fechaObjetivo.getFullYear(), fechaObjetivo.getMonth(), fechaObjetivo.getDate()).getTime();

  var removed = 0;
  cal.getEvents(inicio, fin).forEach(function (ev) {
    var title = String(ev.getTitle() || "").trim().toLowerCase();
    if (title !== objetivo) return;

    var dt = ev.isAllDayEvent() ? ev.getAllDayStartDate() : ev.getStartTime();
    var evDay = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
    var deltaDays = Math.abs((evDay - base) / 86400000);
    if (deltaDays <= 1) {
      ev.deleteEvent();
      removed++;
    }
  });

  return removed;
}

function borrarAllDayEnCalendarioPorDia_(cal, fechaObjetivo) {
  if (!fechaObjetivo) return 0;
  var inicio = new Date(fechaObjetivo.getFullYear(), fechaObjetivo.getMonth(), fechaObjetivo.getDate() - 1);
  var fin = new Date(fechaObjetivo.getFullYear(), fechaObjetivo.getMonth(), fechaObjetivo.getDate() + 2);
  var base = new Date(fechaObjetivo.getFullYear(), fechaObjetivo.getMonth(), fechaObjetivo.getDate()).getTime();

  var removed = 0;
  cal.getEvents(inicio, fin).forEach(function (ev) {
    if (!ev.isAllDayEvent()) return;
    var dt = ev.getAllDayStartDate();
    var evDay = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
    var deltaDays = Math.abs((evDay - base) / 86400000);
    if (deltaDays <= 1) {
      ev.deleteEvent();
      removed++;
    }
  });

  return removed;
}

function getEventoById_(cal, id) {
  if (!id) return null;
  try {
    return cal.getEventById(id) || null;
  } catch (err) {
    try {
      if (String(id).indexOf("@") === -1) {
        return cal.getEventById(String(id) + "@google.com") || null;
      }
    } catch (err2) {
      // no-op
    }
    return null;
  }
}

function parseNoteData_(rawNote) {
  var raw = String(rawNote || "").trim();
  var out = {
    ids: {},
    eventKey: "",
    eventName: "",
    startDate: "",
    endDate: "",
    legacyCal1: "",
    legacyCal2: ""
  };

  if (!raw) return out;
  if (raw.toLowerCase() === "evento creado") return out;

  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return out;

    if (parsed.ids && typeof parsed.ids === "object") out.ids = sanitizeIdMap_(parsed.ids);
    if (parsed.cal1) out.legacyCal1 = String(parsed.cal1);
    if (parsed.cal2) out.legacyCal2 = String(parsed.cal2);
    if (parsed.eventKey) out.eventKey = String(parsed.eventKey);
    if (parsed.eventName) out.eventName = String(parsed.eventName);
    if (parsed.startDate) out.startDate = String(parsed.startDate);
    if (parsed.endDate) out.endDate = String(parsed.endDate);

    return out;
  } catch (err) {
    return out;
  }
}

function buildNoteData_(idsMap, eventKey, eventName, startDate, endDate) {
  return {
    ids: sanitizeIdMap_(idsMap || {}),
    eventKey: String(eventKey || ""),
    eventName: String(eventName || ""),
    startDate: String(startDate || ""),
    endDate: String(endDate || ""),
    updatedAt: new Date().toISOString(),
    version: APP_VERSION
  };
}

function getExistingIdForCalendar_(noteData, calendarId, index) {
  if (!noteData) return "";
  if (noteData.ids && noteData.ids[calendarId]) return String(noteData.ids[calendarId]);
  if (index === 0 && noteData.legacyCal1) return String(noteData.legacyCal1);
  if (index === 1 && noteData.legacyCal2) return String(noteData.legacyCal2);
  return "";
}

function sanitizeIdMap_(idMap) {
  var out = {};
  Object.keys(idMap).forEach(function (k) {
    var key = String(k || "").trim();
    var val = String(idMap[k] || "").trim();
    if (key && val) out[key] = val;
  });
  return out;
}

function parseFechaDesdeMesYDia_(mesStr, diaNum) {
  var parts = String(mesStr || "").split(" - ");
  if (parts.length < 2) return null;
  var month = monthIndexFromText_(parts[0]);
  var year = parseInt(parts[1], 10);
  var day = parseInt(diaNum, 10);
  if (month < 0 || isNaN(year) || isNaN(day)) return null;
  return new Date(year, month, day);
}

function parseIsoDate_(value) {
  var s = String(value || "").trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  var year = parseInt(m[1], 10);
  var month = parseInt(m[2], 10) - 1;
  var day = parseInt(m[3], 10);
  var d = new Date(year, month, day);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
  return d;
}

function toIsoDate_(date) {
  return [
    date.getFullYear(),
    pad2_(date.getMonth() + 1),
    pad2_(date.getDate())
  ].join("-");
}

function pad2_(n) {
  return n < 10 ? "0" + n : String(n);
}

function monthIndexFromText_(value) {
  var norm = normalizeText_(value);
  for (var i = 0; i < MONTH_NAMES.length; i++) {
    if (normalizeText_(MONTH_NAMES[i]) === norm) return i;
  }
  return -1;
}

function normalizeText_(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function toBool_(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  var s = String(v).trim().toLowerCase();
  return s === "true" || s === "on" || s === "1" || s === "si" || s === "sí";
}

function hasText_(v) {
  return v != null && String(v).trim() !== "";
}

function hasParam_(params, key) {
  return Object.prototype.hasOwnProperty.call(params, key);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
