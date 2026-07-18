// Asistente de Telegram para el cuadrante semanal.
// Reutiliza handleGuardarEventoRango_, resolveCalendars_, toIsoDate_, parseIsoDate_,
// isConsecutiveDate_, addDays_, pad2_, toErrorMessage_ y json_ definidos en formularioweb.gs.

var TARIFAS_DISPONIBLES = [
  "Ninguna", "Tec.Madrid", "Tec.Finde", "Tec.Fuera",
  "Conductor - 400", "Conductor + 400", "Op.Med", "Op.Bolo",
  "Op. Gran Formato", "Op.Directo", "JE/Op Plato", "Tec.Plato",
  "JE.Bolo", "JE.Gran Formato", "JE.Directo", "Dia OFF"
];

var DIAS_SEMANA_ = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

var MENSAJE_PIDE_DIAS_ =
  '¿Qué días tienes bolo? Puedes darme fechas concretas (ej: "15 de agosto", ' +
  '"15/08 al 17/08") o días de la semana que viene (ej: "lunes a miércoles"). ' +
  'Si no tienes nada, responde "no".';

// ---- Trigger semanal (proactivo) ----

function enviarPreguntaCuadrante() {
  var props = PropertiesService.getScriptProperties();
  var chatId = props.getProperty("TELEGRAM_CHAT_ID");
  if (!chatId) {
    Logger.log("Falta TELEGRAM_CHAT_ID en Script Properties");
    return;
  }
  saveTelegramState_(props, telegramStateKey_(chatId), { step: "awaiting_days" });
  sendTelegramMessage_(props, chatId, MENSAJE_PIDE_DIAS_);
}

// Ejecutar una vez a mano desde el editor de Apps Script para instalar el trigger.
function crearTriggerViernes() {
  eliminarTriggerViernes_();
  ScriptApp.newTrigger("enviarPreguntaCuadrante")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(20)
    .create();
}

function eliminarTriggerViernes_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "enviarPreguntaCuadrante") {
      ScriptApp.deleteTrigger(t);
    }
  });
}

// ---- Webhook: recepción de mensajes ----

function parseTelegramUpdate_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  var contentType = String(e.postData.type || "");
  if (contentType.indexOf("json") === -1) return null;
  try {
    var data = JSON.parse(e.postData.contents);
    if (data && (data.message || data.edited_message)) return data;
    return null;
  } catch (err) {
    return null;
  }
}

function handleTelegramUpdate_(ss, props, update) {
  var msg = update.message || update.edited_message;
  if (!msg || !msg.chat || msg.text === undefined) return json_({ ok: true });

  var chatId = String(msg.chat.id);
  var text = String(msg.text || "").trim();
  var stateKey = telegramStateKey_(chatId);

  if (/^\/(start|cuadrante)\b/i.test(text)) {
    var freshState = { step: "awaiting_days" };
    saveTelegramState_(props, stateKey, freshState);
    sendTelegramMessage_(props, chatId, MENSAJE_PIDE_DIAS_);
    return json_({ ok: true });
  }

  if (/^\/(cancelar|cancel)\b/i.test(text)) {
    props.deleteProperty(stateKey);
    sendTelegramMessage_(props, chatId, "Vale, cancelado.");
    return json_({ ok: true });
  }

  var state = readTelegramState_(props, stateKey) || { step: "awaiting_days" };

  if (state.step === "awaiting_evento") {
    handleAwaitingEvento_(props, chatId, stateKey, state, text);
  } else if (state.step === "awaiting_tarifa") {
    handleAwaitingTarifa_(props, ss, chatId, stateKey, state, text);
  } else {
    handleAwaitingDias_(props, chatId, stateKey, state, text);
  }

  return json_({ ok: true });
}

function handleAwaitingDias_(props, chatId, stateKey, state, text) {
  var norm = normalizeSimple_(text);
  if (["no", "nada", "ninguno", "ninguna", "libre", "sin bolos"].indexOf(norm) !== -1) {
    props.deleteProperty(stateKey);
    sendTelegramMessage_(props, chatId, "Vale, semana libre 👍");
    return;
  }

  var dias = parseFechas_(text);
  if (!dias || dias.length === 0) {
    sendTelegramMessage_(props, chatId,
      'No he entendido esas fechas. Prueba con algo como "15 de agosto", "15/08 al 17/08" o "lunes a miércoles".'
    );
    return;
  }

  state.dias = dias.map(function (d) { return toIsoDate_(d); });
  state.step = "awaiting_evento";
  saveTelegramState_(props, stateKey, state);
  sendTelegramMessage_(props, chatId, "¿Nombre del evento/cliente para esos días?");
}

function handleAwaitingEvento_(props, chatId, stateKey, state, text) {
  if (!text) {
    sendTelegramMessage_(props, chatId, "Necesito un nombre para el evento. ¿Cómo se llama?");
    return;
  }
  state.evento = text;
  state.step = "awaiting_tarifa";
  saveTelegramState_(props, stateKey, state);
  sendTelegramMessage_(props, chatId, buildTarifaMenu_());
}

function handleAwaitingTarifa_(props, ss, chatId, stateKey, state, text) {
  var tarifa = resolveTarifaFromText_(text);
  if (!tarifa) {
    sendTelegramMessage_(props, chatId, "No he reconocido esa tarifa.\n" + buildTarifaMenu_());
    return;
  }

  var fechas = (state.dias || [])
    .map(parseIsoDate_)
    .filter(Boolean)
    .sort(function (a, b) { return a.getTime() - b.getTime(); });
  var runs = agruparDiasConsecutivos_(fechas);

  var calendars = resolveCalendars_(props);
  if (calendars.length === 0) {
    sendTelegramMessage_(props, chatId, "⚠️ No hay calendarios configurados en Script Properties (CALENDAR_ID_1 / CALENDAR_ID_2).");
    props.deleteProperty(stateKey);
    return;
  }

  var guardados = [];
  var errores = [];

  runs.forEach(function (run) {
    var params = {
      evento: state.evento,
      fechaInicio: toIsoDate_(run.inicio),
      fechaFin: toIsoDate_(run.fin),
      tarifa: tarifa
    };
    try {
      handleGuardarEventoRango_(ss, calendars, params);
      guardados.push(formatRangoLegible_(run.inicio, run.fin));
    } catch (err) {
      errores.push(formatRangoLegible_(run.inicio, run.fin) + ": " + toErrorMessage_(err));
    }
  });

  props.deleteProperty(stateKey);

  var mensaje = "";
  if (guardados.length) {
    mensaje += '✅ Guardado "' + state.evento + '" (' + tarifa + ') para: ' + guardados.join(", ") + "\n";
  }
  if (errores.length) {
    mensaje += "⚠️ No se pudo guardar: " + errores.join("; ");
  }
  sendTelegramMessage_(props, chatId, mensaje.trim() || "Listo.");
}

function buildTarifaMenu_() {
  var lines = TARIFAS_DISPONIBLES.map(function (t, i) { return (i + 1) + ". " + t; });
  return "Elige la tarifa (responde con el número):\n" + lines.join("\n");
}

function resolveTarifaFromText_(text) {
  var trimmed = String(text || "").trim();
  var num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= TARIFAS_DISPONIBLES.length) {
    return TARIFAS_DISPONIBLES[num - 1];
  }
  var norm = normalizeSimple_(trimmed);
  for (var i = 0; i < TARIFAS_DISPONIBLES.length; i++) {
    if (normalizeSimple_(TARIFAS_DISPONIBLES[i]) === norm) return TARIFAS_DISPONIBLES[i];
  }
  return null;
}

// ---- Parseo de fechas en español ----
// Acepta, por segmento separado por comas o " y ": fechas concretas
// ("15 de agosto", "15 al 17 de agosto", "15/08", "15/08 al 17/08[/2026]")
// o nombres de días de la semana ("lunes", "lunes a miércoles"), que se
// resuelven sobre la semana que viene.

function parseFechas_(text) {
  var norm = normalizeSimple_(text).replace(/\by\b/g, ",");
  var segments = norm.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  if (!segments.length) return null;

  var fechas = [];
  for (var i = 0; i < segments.length; i++) {
    var parsed = parseSegmentoFecha_(segments[i]);
    if (!parsed || !parsed.length) return null;
    fechas = fechas.concat(parsed);
  }

  var seen = {};
  var out = [];
  fechas.forEach(function (f) {
    var key = toIsoDate_(f);
    if (!seen[key]) {
      seen[key] = true;
      out.push(f);
    }
  });
  out.sort(function (a, b) { return a.getTime() - b.getTime(); });
  return out;
}

function parseSegmentoFecha_(seg) {
  // "15/08[/2026]" o "15/08[/2026] al 17/08[/2026]"
  var slash = seg.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s+al\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?)?$/);
  if (slash) {
    var d1 = construirFechaSlash_(slash[1], slash[2], slash[3]);
    if (!d1) return null;
    if (!slash[4]) return [d1];
    var d2 = construirFechaSlash_(slash[4], slash[5], slash[6] || slash[3]);
    if (!d2 || d2.getTime() < d1.getTime()) return null;
    return expandDateRange_(d1, d2);
  }

  // "15 de agosto[ de 2026]" o "15 al 17 de agosto[ de 2026]"
  var conMes = seg.match(/^(\d{1,2})(?:\s*(?:al|-)\s*(\d{1,2}))?\s+de\s+([a-z]+)(?:\s+(?:de\s+)?(\d{4}))?$/);
  if (conMes) {
    var mes = monthIndexFromText_(conMes[3]);
    if (mes < 0) return null;
    var inicio = construirFechaConMes_(conMes[1], mes, conMes[4]);
    if (!inicio) return null;
    if (!conMes[2]) return [inicio];
    var fin = construirFechaConMes_(conMes[2], mes, conMes[4]);
    if (!fin || fin.getTime() < inicio.getTime()) return null;
    return expandDateRange_(inicio, fin);
  }

  return parseSegmentoDiaSemana_(seg);
}

function parseSegmentoDiaSemana_(seg) {
  var rangeMatch = seg.match(/^(?:de\s+)?(\S+)\s+a\s+(\S+)$/);
  if (rangeMatch) {
    var startIdx = diaIndex_(rangeMatch[1]);
    var endIdx = diaIndex_(rangeMatch[2]);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;
    var monday = proximoLunes_();
    return expandDateRange_(addDays_(monday, startIdx), addDays_(monday, endIdx));
  }

  var monday2 = proximoLunes_();
  var out = [];
  seg.split(/\s+/).forEach(function (token) {
    var idx = diaIndex_(token);
    if (idx !== -1) out.push(addDays_(monday2, idx));
  });
  return out.length ? out : null;
}

function construirFechaSlash_(diaStr, mesStr, anioStr) {
  var dia = parseInt(diaStr, 10);
  var mes = parseInt(mesStr, 10) - 1;
  if (isNaN(dia) || isNaN(mes) || mes < 0 || mes > 11) return null;
  var anio = anioStr ? normalizarAnio_(anioStr) : new Date().getFullYear();
  var d = new Date(anio, mes, dia);
  if (d.getMonth() !== mes || d.getDate() !== dia) return null;
  return d;
}

function construirFechaConMes_(diaStr, mesIndex, anioStr) {
  var dia = parseInt(diaStr, 10);
  if (isNaN(dia)) return null;
  var anio = anioStr ? parseInt(anioStr, 10) : new Date().getFullYear();
  var d = new Date(anio, mesIndex, dia);
  if (d.getMonth() !== mesIndex || d.getDate() !== dia) return null;
  return d;
}

function normalizarAnio_(anioStr) {
  var anio = parseInt(anioStr, 10);
  return anio < 100 ? anio + 2000 : anio;
}

function diaIndex_(token) {
  return DIAS_SEMANA_.indexOf(normalizeSimple_(token));
}

function proximoLunes_(fromDate) {
  var base = fromDate || new Date();
  var day = base.getDay(); // 0=domingo .. 6=sabado
  var offset = (1 - day + 7) % 7;
  if (offset === 0) offset = 7; // si hoy es lunes, la semana que viene empieza en 7 dias
  var d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + offset);
  return d;
}

function agruparDiasConsecutivos_(fechasOrdenadas) {
  var runs = [];
  fechasOrdenadas.forEach(function (fecha) {
    var last = runs[runs.length - 1];
    if (last && isConsecutiveDate_(last.fin, fecha)) {
      last.fin = fecha;
    } else {
      runs.push({ inicio: fecha, fin: fecha });
    }
  });
  return runs;
}

function formatRangoLegible_(inicio, fin) {
  var f1 = pad2_(inicio.getDate()) + "/" + pad2_(inicio.getMonth() + 1);
  if (inicio.getTime() === fin.getTime()) return f1;
  return f1 + "–" + pad2_(fin.getDate()) + "/" + pad2_(fin.getMonth() + 1);
}

function normalizeSimple_(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// ---- Estado de conversación (por chat, en Script Properties) ----

function telegramStateKey_(chatId) {
  return "TG_STATE_" + chatId;
}

function readTelegramState_(props, key) {
  var raw = props.getProperty(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function saveTelegramState_(props, key, state) {
  props.setProperty(key, JSON.stringify(state));
}

function sendTelegramMessage_(props, chatId, text) {
  var token = props.getProperty("TELEGRAM_TOKEN");
  if (!token) {
    Logger.log("Falta TELEGRAM_TOKEN en Script Properties");
    return;
  }
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text: text }),
    muteHttpExceptions: true
  });
}
