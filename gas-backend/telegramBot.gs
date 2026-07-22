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
  '"15/08 al 17/08", o "15 de agosto al 5 de septiembre" si dura varias semanas) ' +
  'o días de la semana que viene (ej: "lunes a miércoles"). ' +
  'Si no tienes nada, responde "no". (Para editar un bolo ya guardado, usa /editar)';

// Misma lista y misma lógica de filtrado por tarifa que index.html (extras).
var EXTRAS_OPCIONES_ = [
  { valor: "No" },
  { valor: "12 - Normal - Bolo", rol: "normal", tipo: "bolo" },
  { valor: "13 - Normal - Bolo", rol: "normal", tipo: "bolo" },
  { valor: "14 - Normal - Bolo", rol: "normal", tipo: "bolo" },
  { valor: "15 - Normal - Bolo", rol: "normal", tipo: "bolo" },
  { valor: "16 - Normal - Bolo", rol: "normal", tipo: "bolo" },
  { valor: "12 - Op/JE - Bolo", rol: "opje", tipo: "bolo" },
  { valor: "13 - Op/JE - Bolo", rol: "opje", tipo: "bolo" },
  { valor: "14 - Op/JE - Bolo", rol: "opje", tipo: "bolo" },
  { valor: "15 - Op/JE - Bolo", rol: "opje", tipo: "bolo" },
  { valor: "16 - Op/JE - Bolo", rol: "opje", tipo: "bolo" },
  { valor: "12 - Op/JE - GF", rol: "opje", tipo: "gf" },
  { valor: "13 - Op/JE - GF", rol: "opje", tipo: "gf" },
  { valor: "14 - Op/JE - GF", rol: "opje", tipo: "gf" },
  { valor: "15 - Op/JE - GF", rol: "opje", tipo: "gf" },
  { valor: "13 - JE - Directo", rol: "je", tipo: "directo" },
  { valor: "14 - JE - Directo", rol: "je", tipo: "directo" },
  { valor: "15 - JE - Directo", rol: "je", tipo: "directo" },
  { valor: "16 - JE - Directo", rol: "je", tipo: "directo" },
  { valor: "17 - JE - Directo", rol: "je", tipo: "directo" },
  { valor: "18 - JE - Directo", rol: "je", tipo: "directo" },
  { valor: "19 - JE - Directo", rol: "je", tipo: "directo" },
  { valor: "20 - JE - Directo", rol: "je", tipo: "directo" },
  { valor: "13 - Op - Directo", rol: "op", tipo: "directo" },
  { valor: "14 - Op - Directo", rol: "op", tipo: "directo" },
  { valor: "15 - Op - Directo", rol: "op", tipo: "directo" },
  { valor: "16 - Op - Directo", rol: "op", tipo: "directo" },
  { valor: "17 - Op - Directo", rol: "op", tipo: "directo" },
  { valor: "18 - Op - Directo", rol: "op", tipo: "directo" },
  { valor: "19 - Op - Directo", rol: "op", tipo: "directo" },
  { valor: "20 - Op - Directo", rol: "op", tipo: "directo" },
  { valor: "13 - Tec - Directo", rol: "tec", tipo: "directo" },
  { valor: "14 - Tec - Directo", rol: "tec", tipo: "directo" },
  { valor: "15 - Tec - Directo", rol: "tec", tipo: "directo" },
  { valor: "16 - Tec - Directo", rol: "tec", tipo: "directo" },
  { valor: "17 - Tec - Directo", rol: "tec", tipo: "directo" },
  { valor: "18 - Tec - Directo", rol: "tec", tipo: "directo" },
  { valor: "19 - Tec - Directo", rol: "tec", tipo: "directo" },
  { valor: "20 - Tec - Directo", rol: "tec", tipo: "directo" }
];

function rolDesdeTarifa_(tarifa) {
  var v = String(tarifa || "");
  if (v.indexOf("Tec.") !== -1 || v.indexOf("Tec ") !== -1) return "tec";
  if (v.indexOf("JE") === 0) return "je";
  if (v.indexOf("Op") === 0) return "op";
  return "ninguno";
}

function tipoTrabajoDesdeTarifa_(tarifa) {
  var v = String(tarifa || "");
  if (v.indexOf("Directo") !== -1) return "directo";
  if (v.indexOf("Gran Formato") !== -1) return "gf";
  if (v.indexOf("Bolo") !== -1) return "bolo";
  return "ninguno";
}

function extrasDisponiblesParaTarifa_(tarifa) {
  var rol = rolDesdeTarifa_(tarifa);
  var tipo = tipoTrabajoDesdeTarifa_(tarifa);
  return EXTRAS_OPCIONES_.filter(function (opt) {
    if (!opt.rol) return true; // "No"
    if (rol === "tec") return opt.rol === "normal" || opt.rol === "tec";
    if ((rol === "op" || rol === "je") && (tipo === "bolo" || tipo === "gf")) {
      return opt.rol === "opje" && opt.tipo === tipo;
    }
    if ((rol === "op" || rol === "je") && tipo === "directo") {
      return opt.rol === rol && opt.tipo === "directo";
    }
    return false;
  });
}

function buildExtrasMenu_(tarifa) {
  var opciones = extrasDisponiblesParaTarifa_(tarifa);
  var lines = opciones.map(function (o, i) { return (i + 1) + ". " + o.valor; });
  return "Elige las horas extra (responde con el número):\n" + lines.join("\n");
}

function resolveExtraFromText_(tarifa, text) {
  var opciones = extrasDisponiblesParaTarifa_(tarifa);
  var trimmed = String(text || "").trim();
  var num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= opciones.length) {
    return opciones[num - 1].valor;
  }
  var norm = normalizeSimple_(trimmed);
  for (var i = 0; i < opciones.length; i++) {
    if (normalizeSimple_(opciones[i].valor) === norm) return opciones[i].valor;
  }
  return null;
}

// ---- Trigger semanal (proactivo) ----

// Teclado fijo (no va pegado a un mensaje concreto, se queda siempre visible
// debajo de donde se escribe) para no tener que teclear /cuadrante o /editar.
var TECLADO_PRINCIPAL_ = { keyboard: [["📅 Cuadrante", "✏️ Editar"]], resize_keyboard: true };

function enviarPreguntaCuadrante() {
  var props = PropertiesService.getScriptProperties();
  var chatId = props.getProperty("TELEGRAM_CHAT_ID");
  if (!chatId) {
    Logger.log("Falta TELEGRAM_CHAT_ID en Script Properties");
    return;
  }
  saveTelegramState_(props, telegramStateKey_(chatId), { step: "awaiting_days" });
  sendTelegramMessage_(props, chatId, MENSAJE_PIDE_DIAS_, TECLADO_PRINCIPAL_);
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
    if (data && (data.message || data.edited_message || data.callback_query)) return data;
    return null;
  } catch (err) {
    return null;
  }
}

function handleTelegramUpdate_(ss, props, update) {
  var chatId, text;

  if (update.callback_query) {
    responderCallback_(props, update.callback_query.id);
    if (!update.callback_query.message || !update.callback_query.message.chat) return json_({ ok: true });
    chatId = String(update.callback_query.message.chat.id);
    text = String(update.callback_query.data || "").trim();
  } else {
    var msg = update.message || update.edited_message;
    if (!msg || !msg.chat || msg.text === undefined) return json_({ ok: true });
    chatId = String(msg.chat.id);
    text = String(msg.text || "").trim();
  }

  var stateKey = telegramStateKey_(chatId);

  if (/^\/(start|cuadrante)\b/i.test(text) || text === "📅 Cuadrante") {
    var freshState = { step: "awaiting_days" };
    saveTelegramState_(props, stateKey, freshState);
    sendTelegramMessage_(props, chatId, MENSAJE_PIDE_DIAS_, TECLADO_PRINCIPAL_);
    return json_({ ok: true });
  }

  if (/^\/(cancelar|cancel)\b/i.test(text)) {
    props.deleteProperty(stateKey);
    sendTelegramMessage_(props, chatId, "Vale, cancelado.", TECLADO_PRINCIPAL_);
    return json_({ ok: true });
  }

  if (/^\/(editar|buscar)\b/i.test(text) || text === "✏️ Editar") {
    saveTelegramState_(props, stateKey, { step: "editar_buscar" });
    sendTelegramMessage_(props, chatId, '¿Qué evento quieres editar? Dime parte del nombre (ej: "Netflix").', TECLADO_PRINCIPAL_);
    return json_({ ok: true });
  }

  var state = readTelegramState_(props, stateKey) || { step: "awaiting_days" };

  if (state.step === "editar_buscar") {
    handleEditarBuscar_(props, ss, chatId, stateKey, state, text);
  } else if (state.step === "editar_elegir") {
    handleEditarElegir_(props, ss, chatId, stateKey, state, text);
  } else if (state.step === "editar_campo") {
    handleEditarCampo_(props, chatId, stateKey, state, text);
  } else if (state.step === "editar_dia") {
    handleEditarDia_(props, chatId, stateKey, state, text);
  } else if (state.step === "editar_valor") {
    handleEditarValor_(props, ss, chatId, stateKey, state, text);
  } else if (state.step === "awaiting_evento") {
    handleAwaitingEvento_(props, chatId, stateKey, state, text);
  } else if (state.step === "awaiting_tarifa") {
    handleAwaitingTarifa_(props, ss, chatId, stateKey, state, text);
  } else {
    handleAwaitingDias_(props, chatId, stateKey, state, text);
  }

  return json_({ ok: true });
}

// ---- Edición de un evento ya guardado ----

function handleEditarBuscar_(props, ss, chatId, stateKey, state, text) {
  var query = String(text || "").trim();
  var eventos = buscarEventos_(ss, query).slice(0, 10);
  if (!eventos.length) {
    sendTelegramMessage_(props, chatId, 'No he encontrado ningún evento con "' + query + '". Prueba con otro texto, o /cancelar.');
    return;
  }

  state.opciones = eventos.map(function (ev) {
    return { eventKey: ev.eventKey, evento: ev.evento, fechaInicio: ev.fechaInicio, fechaFin: ev.fechaFin };
  });
  state.step = "editar_elegir";
  saveTelegramState_(props, stateKey, state);

  var lines = state.opciones.map(function (o, i) {
    var rango = o.fechaInicio === o.fechaFin ? o.fechaInicio : (o.fechaInicio + " a " + o.fechaFin);
    return (i + 1) + ". " + o.evento + " (" + rango + ")";
  });
  sendTelegramMessage_(props, chatId, "Elige el evento (responde con el número):\n" + lines.join("\n"), tecladoEventos_(state.opciones));
}

function handleEditarElegir_(props, ss, chatId, stateKey, state, text) {
  var opciones = state.opciones || [];
  var num = parseInt(String(text || "").trim(), 10);
  if (isNaN(num) || num < 1 || num > opciones.length) {
    sendTelegramMessage_(props, chatId, "Responde con el número de la lista.");
    return;
  }

  var evento = obtenerEvento_(ss, opciones[num - 1].eventKey);
  if (!evento) {
    props.deleteProperty(stateKey);
    sendTelegramMessage_(props, chatId, "No he podido recuperar ese evento. Prueba de nuevo con /editar.", TECLADO_PRINCIPAL_);
    return;
  }

  state.eventKey = evento.eventKey;
  state.eventoActual = evento;
  state.step = "editar_campo";
  saveTelegramState_(props, stateKey, state);

  var rango = evento.fechaInicio === evento.fechaFin ? evento.fechaInicio : (evento.fechaInicio + " a " + evento.fechaFin);
  sendTelegramMessage_(props, chatId,
    'Editando "' + evento.evento + '" (' + rango + '). Tarifa: ' + evento.tarifa + '. Extras: ' + (evento.extras || "No") +
    '. Media jornada: ' + siNo_(evento.mediaJornada) + '. Jefe+Operador: ' + siNo_(evento.jefeOperador) +
    '. Doble jornada: ' + siNo_(evento.dobleJornada) + '.\n' +
    '¿Qué quieres cambiar?',
    tecladoCampos_()
  );
}

// Campos que viven en una celda por día (columna en collectAllEventRows_) y por
// tanto se pueden cambiar solo para un día del evento, no para el rango entero.
var CAMPOS_POR_DIA_ = { extras: 6, mediaJornada: 7, jefeOperador: 8 };
CAMPOS_POR_DIA_["Doble jornada"] = 9;

function handleEditarCampo_(props, chatId, stateKey, state, text) {
  var campo = normalizeSimple_(text);

  if (campo === "extras") {
    iniciarEdicionCampoConDia_(props, chatId, stateKey, state, "extras", buildExtrasMenu_(state.eventoActual.tarifa));
    return;
  }
  if (campo === "tarifa") {
    state.campo = "tarifa";
    state.step = "editar_valor";
    saveTelegramState_(props, stateKey, state);
    sendTelegramMessage_(props, chatId, buildTarifaMenu_(), tecladoTarifa_());
    return;
  }
  if (campo === "nombre") {
    state.campo = "evento";
    state.step = "editar_valor";
    saveTelegramState_(props, stateKey, state);
    sendTelegramMessage_(props, chatId, "¿Nuevo nombre del evento?");
    return;
  }
  if (campo === "media jornada" || campo === "mediajornada") {
    iniciarEdicionCampoConDia_(props, chatId, stateKey, state, "mediaJornada", "¿Media jornada? Responde sí o no.");
    return;
  }
  if (campo === "jefe operador" || campo === "jefe y operador" || campo === "jefeoperador" || campo === "jefe+operador") {
    iniciarEdicionCampoConDia_(props, chatId, stateKey, state, "jefeOperador", "¿Jefe + Operador? Responde sí o no.");
    return;
  }
  if (campo === "doble jornada" || campo === "doblejornada") {
    iniciarEdicionCampoConDia_(props, chatId, stateKey, state, "Doble jornada", "¿Doble jornada? Responde sí o no.");
    return;
  }

  sendTelegramMessage_(props, chatId, 'No entendido. Responde "extras", "tarifa", "nombre", "media jornada", "jefe operador" o "doble jornada".');
}

// Para los campos por-día, si el evento dura más de un día hay que preguntar
// si el cambio es para todo el rango o solo para una fecha concreta dentro de él.
function iniciarEdicionCampoConDia_(props, chatId, stateKey, state, campoInterno, mensajeValor) {
  state.campo = campoInterno;
  var dias = (state.eventoActual && state.eventoActual.dias) || [];

  if (dias.length > 1) {
    state.mensajeValorPendiente = mensajeValor;
    state.step = "editar_dia";
    saveTelegramState_(props, stateKey, state);
    sendTelegramMessage_(props, chatId,
      'Ese evento dura varios días (' + dias[0] + ' a ' + dias[dias.length - 1] + '). ' +
      '¿Lo cambio para todos los días, o solo para uno? Responde "todos" o dime la fecha (ej: "16/07").',
      tecladoDia_(dias)
    );
    return;
  }

  state.diaEspecifico = dias[0] || null;
  state.step = "editar_valor";
  saveTelegramState_(props, stateKey, state);
  sendTelegramMessage_(props, chatId, mensajeValor, tecladoParaCampo_(campoInterno, state.eventoActual.tarifa));
}

function handleEditarDia_(props, chatId, stateKey, state, text) {
  var norm = normalizeSimple_(text);
  if (norm === "todos" || norm === "todo") {
    state.diaEspecifico = null;
    state.step = "editar_valor";
    saveTelegramState_(props, stateKey, state);
    sendTelegramMessage_(props, chatId, state.mensajeValorPendiente, tecladoParaCampo_(state.campo, state.eventoActual.tarifa));
    return;
  }

  var isoDirecto = parseIsoDate_(String(text || "").trim());
  var dias = isoDirecto ? [isoDirecto] : parseFechas_(text);
  if (!dias || dias.length !== 1) {
    sendTelegramMessage_(props, chatId, 'Responde "todos" o una única fecha (ej: "16/07").', tecladoDia_(state.eventoActual.dias));
    return;
  }

  var iso = toIsoDate_(dias[0]);
  if ((state.eventoActual.dias || []).indexOf(iso) === -1) {
    sendTelegramMessage_(props, chatId, "Esa fecha no pertenece a este evento. Prueba con otra, o \"todos\".", tecladoDia_(state.eventoActual.dias));
    return;
  }

  state.diaEspecifico = iso;
  state.step = "editar_valor";
  saveTelegramState_(props, stateKey, state);
  sendTelegramMessage_(props, chatId, state.mensajeValorPendiente, tecladoParaCampo_(state.campo, state.eventoActual.tarifa));
}

function siNo_(valor) {
  return valor ? "sí" : "no";
}

function resolveSiNo_(text) {
  var norm = normalizeSimple_(text);
  if (["si", "s", "true", "activar", "on", "1", "yes"].indexOf(norm) !== -1) return true;
  if (["no", "n", "false", "desactivar", "off", "0"].indexOf(norm) !== -1) return false;
  return null;
}

function handleEditarValor_(props, ss, chatId, stateKey, state, text) {
  var campo = state.campo;
  var valor;

  if (campo === "extras") {
    valor = resolveExtraFromText_(state.eventoActual.tarifa, text);
    if (!valor) {
      sendTelegramMessage_(props, chatId, "No he reconocido esa opción.\n" + buildExtrasMenu_(state.eventoActual.tarifa), tecladoExtras_(state.eventoActual.tarifa));
      return;
    }
  } else if (campo === "tarifa") {
    valor = resolveTarifaFromText_(text);
    if (!valor) {
      sendTelegramMessage_(props, chatId, "No he reconocido esa tarifa.\n" + buildTarifaMenu_(), tecladoTarifa_());
      return;
    }
  } else if (campo === "evento") {
    valor = String(text || "").trim();
    if (!valor) {
      sendTelegramMessage_(props, chatId, "Necesito un nombre.");
      return;
    }
  } else if (campo === "mediaJornada" || campo === "jefeOperador" || campo === "Doble jornada") {
    var boolValor = resolveSiNo_(text);
    if (boolValor === null) {
      sendTelegramMessage_(props, chatId, "Responde sí o no.", tecladoSiNo_());
      return;
    }
    valor = boolValor;
  } else {
    props.deleteProperty(stateKey);
    return;
  }

  if (state.diaEspecifico && CAMPOS_POR_DIA_[campo]) {
    try {
      actualizarCampoDia_(ss, state.eventKey, state.diaEspecifico, campo, valor);
      props.deleteProperty(stateKey);
      sendTelegramMessage_(props, chatId, "✅ Actualizado el día " + state.diaEspecifico + ".", TECLADO_PRINCIPAL_);
    } catch (err) {
      props.deleteProperty(stateKey);
      sendTelegramMessage_(props, chatId, "⚠️ No se pudo actualizar: " + toErrorMessage_(err), TECLADO_PRINCIPAL_);
    }
    return;
  }

  var calendars = resolveCalendars_(props);
  if (calendars.length === 0) {
    props.deleteProperty(stateKey);
    sendTelegramMessage_(props, chatId, "⚠️ No hay calendarios configurados en Script Properties (CALENDAR_ID_1 / CALENDAR_ID_2).", TECLADO_PRINCIPAL_);
    return;
  }

  var params = { eventKey: state.eventKey };
  params[campo] = valor;

  var resultado;
  try {
    resultado = handleActualizarEvento_(ss, calendars, params);
  } catch (err) {
    props.deleteProperty(stateKey);
    sendTelegramMessage_(props, chatId, "⚠️ No se pudo actualizar: " + toErrorMessage_(err), TECLADO_PRINCIPAL_);
    return;
  }

  props.deleteProperty(stateKey);
  var data = JSON.parse(resultado.getContent());
  if (data && data.error) {
    sendTelegramMessage_(props, chatId, "⚠️ No se pudo actualizar: " + data.error, TECLADO_PRINCIPAL_);
    return;
  }
  sendTelegramMessage_(props, chatId, "✅ Actualizado.", TECLADO_PRINCIPAL_);
}

function actualizarCampoDia_(ss, eventKey, iso, campo, valor) {
  var col = CAMPOS_POR_DIA_[campo];
  if (!col) throw new Error("Campo no editable por día: " + campo);

  var filas = collectAllEventRows_(ss).filter(function (r) {
    return r.noteData.eventKey === eventKey && r.iso === iso;
  });
  if (!filas.length) throw new Error("No se encontró el día " + iso + " en ese evento.");

  var valorCelda = campo === "extras" ? String(valor) : toBool_(valor);
  filas[0].sheet.getRange(filas[0].row, col).setValue(valorCelda);
}

function buscarEventos_(ss, query) {
  var output = handleListarEventos_(ss, { q: query });
  var data = JSON.parse(output.getContent());
  return (data && data.events) || [];
}

function obtenerEvento_(ss, eventKey) {
  var output = handleObtenerEvento_(ss, { eventKey: eventKey });
  var data = JSON.parse(output.getContent());
  if (!data || data.error) return null;
  return data.event;
}

function handleAwaitingDias_(props, chatId, stateKey, state, text) {
  var norm = normalizeSimple_(text);
  if (["no", "nada", "ninguno", "ninguna", "libre", "sin bolos"].indexOf(norm) !== -1) {
    props.deleteProperty(stateKey);
    sendTelegramMessage_(props, chatId, "Vale, semana libre 👍", TECLADO_PRINCIPAL_);
    return;
  }

  var dias = parseFechas_(text);
  if (!dias || dias.length === 0) {
    sendTelegramMessage_(props, chatId,
      'No he entendido esas fechas. Prueba con algo como "15 de agosto", "15/08 al 17/08", ' +
      '"15 de agosto al 5 de septiembre" o "lunes a miércoles".'
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
  sendTelegramMessage_(props, chatId, buildTarifaMenu_(), tecladoTarifa_());
}

function handleAwaitingTarifa_(props, ss, chatId, stateKey, state, text) {
  var tarifa = resolveTarifaFromText_(text);
  if (!tarifa) {
    sendTelegramMessage_(props, chatId, "No he reconocido esa tarifa.\n" + buildTarifaMenu_(), tecladoTarifa_());
    return;
  }

  var fechas = (state.dias || [])
    .map(parseIsoDate_)
    .filter(Boolean)
    .sort(function (a, b) { return a.getTime() - b.getTime(); });
  var runs = agruparDiasConsecutivos_(fechas);

  var calendars = resolveCalendars_(props);
  if (calendars.length === 0) {
    sendTelegramMessage_(props, chatId, "⚠️ No hay calendarios configurados en Script Properties (CALENDAR_ID_1 / CALENDAR_ID_2).", TECLADO_PRINCIPAL_);
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
  sendTelegramMessage_(props, chatId, mensaje.trim() || "Listo.", TECLADO_PRINCIPAL_);
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

  // "15 de agosto al 5 de septiembre[ de 2026]" (rango que cruza de mes)
  var dosMeses = seg.match(/^(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?\s+al\s+(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?$/);
  if (dosMeses) {
    var mesInicio = monthIndexFromText_(dosMeses[2]);
    var mesFin = monthIndexFromText_(dosMeses[5]);
    if (mesInicio < 0 || mesFin < 0) return null;
    var inicioDosMeses = construirFechaConMes_(dosMeses[1], mesInicio, dosMeses[3]);
    var finDosMeses = construirFechaConMes_(dosMeses[4], mesFin, dosMeses[6] || dosMeses[3]);
    if (!inicioDosMeses || !finDosMeses || finDosMeses.getTime() < inicioDosMeses.getTime()) return null;
    return expandDateRange_(inicioDosMeses, finDosMeses);
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

function sendTelegramMessage_(props, chatId, text, replyMarkup) {
  var token = props.getProperty("TELEGRAM_TOKEN");
  if (!token) {
    Logger.log("Falta TELEGRAM_TOKEN en Script Properties");
    return;
  }
  var payload = { chat_id: chatId, text: text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function responderCallback_(props, callbackId) {
  var token = props.getProperty("TELEGRAM_TOKEN");
  if (!token) return;
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/answerCallbackQuery", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ callback_query_id: callbackId }),
    muteHttpExceptions: true
  });
}

// ---- Botones (inline keyboards) ----
// El callback_data de cada botón es exactamente el mismo texto que se
// aceptaría si el usuario lo escribiera a mano, así que los handlers de
// cada paso no necesitan saber si vino de un botón o de texto libre.

function teclado_(botones, columnas) {
  columnas = columnas || 1;
  var filas = [];
  for (var i = 0; i < botones.length; i += columnas) {
    filas.push(botones.slice(i, i + columnas).map(function (b) {
      return { text: b.text, callback_data: b.data };
    }));
  }
  return { inline_keyboard: filas };
}

function tecladoTarifa_() {
  return teclado_(
    TARIFAS_DISPONIBLES.map(function (t, i) { return { text: t, data: String(i + 1) }; }),
    2
  );
}

function tecladoExtras_(tarifa) {
  var opciones = extrasDisponiblesParaTarifa_(tarifa);
  return teclado_(
    opciones.map(function (o, i) { return { text: o.valor, data: String(i + 1) }; }),
    2
  );
}

function tecladoSiNo_() {
  return teclado_([{ text: "Sí", data: "si" }, { text: "No", data: "no" }], 2);
}

function tecladoCampos_() {
  return teclado_([
    { text: "Extras", data: "extras" },
    { text: "Tarifa", data: "tarifa" },
    { text: "Nombre", data: "nombre" },
    { text: "Media jornada", data: "media jornada" },
    { text: "Jefe + Operador", data: "jefe operador" },
    { text: "Doble jornada", data: "doble jornada" }
  ], 1);
}

function tecladoEventos_(opciones) {
  return teclado_(
    opciones.map(function (o, i) {
      var rango = o.fechaInicio === o.fechaFin ? o.fechaInicio : (o.fechaInicio + " a " + o.fechaFin);
      return { text: o.evento + " (" + rango + ")", data: String(i + 1) };
    }),
    1
  );
}

function tecladoDia_(dias) {
  dias = dias || [];
  var botones = [{ text: "Todos los días", data: "todos" }];
  // Si el evento dura muchas semanas, listar un botón por día sería enorme:
  // se deja solo el botón "todos" y el usuario escribe la fecha a mano.
  if (dias.length <= 20) {
    botones = botones.concat(dias.map(function (iso) { return { text: iso, data: iso }; }));
  }
  return teclado_(botones, 1);
}

function tecladoParaCampo_(campo, tarifa) {
  if (campo === "extras") return tecladoExtras_(tarifa);
  if (campo === "mediaJornada" || campo === "jefeOperador" || campo === "Doble jornada") return tecladoSiNo_();
  return null;
}
