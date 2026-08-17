// Comparacion de la nomina en PDF (Fluge) contra el Sheet de Registro Jornadas.
// El usuario manda el PDF por Telegram como documento; se convierte a texto via
// Drive (Advanced Service), se extraen las filas fecha+importe y se comparan
// contra la columna K "Total" (tarifa + extra) de la hoja del mes correspondiente.
//
// NOTA: Drive.Files.insert requiere el scope de Drive. Si falla con un error de
// permisos, hay que ejecutar la funcion probarPermisoDrive_ una vez manualmente
// desde el editor de Apps Script para que salga el dialogo de autorizacion.

function handleTelegramDocument_(props, ss, chatId, document) {
  var mime = String(document.mime_type || "");
  var fileName = String(document.file_name || "");
  if (mime.indexOf("pdf") === -1 && !/\.pdf$/i.test(fileName)) {
    sendTelegramMessage_(props, chatId, "Solo puedo comparar archivos PDF de nómina.", TECLADO_PRINCIPAL_);
    return json_({ ok: true });
  }

  sendTelegramMessage_(props, chatId, "Recibido, comparando la nómina con el Sheet...");

  try {
    var texto = extraerTextoPdf_(props, document.file_id, fileName);
    guardarDebugNomina_(props, texto);

    var filas = parseNominaPdf_(texto);
    if (filas.length === 0) {
      sendTelegramMessage_(props, chatId, "No he podido leer ninguna fila de la nómina. Puede que el formato haya cambiado.", TECLADO_PRINCIPAL_);
      return json_({ ok: true });
    }

    var reporte = compararNominaConSheet_(ss, filas);
    sendTelegramMessage_(props, chatId, reporte, TECLADO_PRINCIPAL_);
  } catch (err) {
    sendTelegramMessage_(props, chatId, "Error comparando la nómina: " + toErrorMessage_(err), TECLADO_PRINCIPAL_);
  }

  return json_({ ok: true });
}

function extraerTextoPdf_(props, fileId, fileName) {
  var token = props.getProperty("TELEGRAM_TOKEN");
  var infoResp = UrlFetchApp.fetch(
    "https://api.telegram.org/bot" + token + "/getFile?file_id=" + encodeURIComponent(fileId),
    { muteHttpExceptions: true }
  );
  var info = JSON.parse(infoResp.getContentText());
  if (!info.ok) throw new Error("No se pudo obtener el archivo de Telegram");
  var filePath = info.result.file_path;

  var fileResp = UrlFetchApp.fetch(
    "https://api.telegram.org/file/bot" + token + "/" + filePath,
    { muteHttpExceptions: true }
  );
  var blob = fileResp.getBlob().setName(fileName || "nomina.pdf").setContentType("application/pdf");
  var blobInfo = "blob: " + blob.getContentType() + ", " + blob.getBytes().length + " bytes";

  // Sin ocr:true a proposito: esta nomina es texto digital nativo (no un PDF
  // escaneado), y el OCR de Drive tiene una cuota por usuario muy restrictiva.
  // La conversion normal ya extrae el texto embebido del PDF sin pasar por esa cuota.
  var resource = { title: "tmp_nomina_" + new Date().getTime() };
  var docFile;
  try {
    docFile = Drive.Files.insert(resource, blob, { convert: true });
  } catch (err) {
    throw new Error(toErrorMessage_(err) + " [" + blobInfo + "]");
  }
  try {
    var doc = DocumentApp.openById(docFile.id);
    return doc.getBody().getText();
  } finally {
    Drive.Files.remove(docFile.id);
  }
}

// Funcion de un solo uso: ejecutar manualmente desde el editor para forzar el
// dialogo de autorizacion del scope de Drive (igual que se hizo con UrlFetchApp).
// OJO: sin guion bajo al final a proposito -- Apps Script oculta del desplegable
// "Ejecutar" cualquier funcion cuyo nombre termine en "_" (las trata como privadas),
// asi que con guion bajo esta funcion nunca podria lanzarse a mano desde el editor.
function probarPermisoDrive() {
  var resource = { title: "tmp_permiso_drive", mimeType: MimeType.GOOGLE_DOCS };
  var blob = Utilities.newBlob("prueba", "text/plain", "prueba.txt");
  var docFile = Drive.Files.insert(resource, blob);
  var doc = DocumentApp.openById(docFile.id);
  doc.getBody().getText();
  Drive.Files.remove(docFile.id);
  Logger.log("Permisos de Drive y Documentos concedidos correctamente");
}

function parseNominaPdf_(texto) {
  var filas = [];
  var reFecha = /(\d{2})-(\d{2})-(\d{2})\b/g;
  var indices = [];
  var match;
  while ((match = reFecha.exec(texto)) !== null) {
    indices.push({ index: match.index, dia: match[1], mes: match[2], anio: match[3] });
  }

  for (var i = 0; i < indices.length; i++) {
    var start = indices[i].index;
    var end = (i + 1 < indices.length) ? indices[i + 1].index : texto.length;
    var chunk = texto.slice(start, Math.min(end, start + 400));

    var reImporte = /(\d{1,3}(?:\.\d{3})*,\d{2})/g;
    var importes = [];
    var am;
    while ((am = reImporte.exec(chunk)) !== null) importes.push(am[1]);
    if (importes.length === 0) continue;

    // El Importe y el Subtotal son el mismo valor repetido; si aparece
    // repetido usamos ese, si no el primero que encontremos.
    var importeStr = importes[0];
    for (var j = 0; j < importes.length - 1; j++) {
      if (importes[j] === importes[j + 1]) { importeStr = importes[j]; break; }
    }
    var importe = parseFloat(importeStr.replace(/\./g, "").replace(",", "."));
    if (isNaN(importe)) continue;

    var categoriaMatch = chunk.match(/\d{2}-\d{2}-\d{2}\s+([A-Z]{2}\s*-\s*[^\d]{3,60}?)(?:\s+Plantilla|\s+\d)/);
    var categoria = categoriaMatch ? categoriaMatch[1].replace(/\s+/g, " ").trim() : "";

    filas.push({
      dia: parseInt(indices[i].dia, 10),
      mes: parseInt(indices[i].mes, 10),
      anio: 2000 + parseInt(indices[i].anio, 10),
      importe: importe,
      categoria: categoria
    });
  }
  return filas;
}

function leerDiasSheetNomina_(ss, sheetName) {
  var hoja = ss.getSheetByName(sheetName);
  if (!hoja) return null;
  var values = hoja.getRange(2, 3, 31, 9).getValues(); // C evento .. K total
  var dias = {};
  for (var i = 0; i < values.length; i++) {
    dias[i + 1] = {
      evento: String(values[i][0] || "").trim(),
      tarifa: String(values[i][1] || "Ninguna"),
      importe: Number(values[i][8]) || 0
    };
  }
  return dias;
}

function compararNominaConSheet_(ss, filas) {
  var porMes = {};
  filas.forEach(function (f) {
    var key = f.anio + "-" + f.mes;
    (porMes[key] = porMes[key] || []).push(f);
  });

  var bloques = [];
  Object.keys(porMes).forEach(function (key) {
    var grupo = porMes[key];
    var f0 = grupo[0];
    var sheetName = MONTH_NAMES[f0.mes - 1] + " - " + f0.anio;
    var dias = leerDiasSheetNomina_(ss, sheetName);

    if (!dias) {
      bloques.push('⚠️ No encuentro la hoja "' + sheetName + '" para comparar esos días.');
      return;
    }

    var faltan = [];
    var distintos = [];
    var vistos = {};

    grupo.forEach(function (f) {
      vistos[f.dia] = true;
      var fechaTxt = formatFechaDisplay_(f.anio + "-" + pad2_(f.mes) + "-" + pad2_(f.dia));
      var d = dias[f.dia];
      if (!d || !d.evento) {
        faltan.push(fechaTxt + " (" + f.importe.toFixed(2).replace(".", ",") + " €" + (f.categoria ? ", " + f.categoria : "") + ")");
        return;
      }
      var diff = Math.abs(d.importe - f.importe);
      if (diff > 0.01) {
        distintos.push(
          fechaTxt + ': nómina ' + f.importe.toFixed(2).replace(".", ",") + ' € vs Sheet ' +
          d.importe.toFixed(2).replace(".", ",") + ' € ("' + d.evento + '")'
        );
      }
    });

    var sobran = [];
    Object.keys(dias).forEach(function (diaStr) {
      var dia = Number(diaStr);
      if (vistos[dia]) return;
      var d = dias[dia];
      if (d.importe > 0) {
        var fechaTxt2 = formatFechaDisplay_(f0.anio + "-" + pad2_(f0.mes) + "-" + pad2_(dia));
        sobran.push(fechaTxt2 + ": Sheet " + d.importe.toFixed(2).replace(".", ",") + ' € ("' + d.evento + '") sin fila en la nómina');
      }
    });

    var partes = ["📄 " + sheetName + " — " + grupo.length + " días en la nómina."];
    if (faltan.length) partes.push("❌ En la nómina pero no en el Sheet:\n" + faltan.map(function (x) { return "• " + x; }).join("\n"));
    if (distintos.length) partes.push("💶 Importe distinto:\n" + distintos.map(function (x) { return "• " + x; }).join("\n"));
    if (sobran.length) partes.push("❓ En el Sheet pero no en la nómina:\n" + sobran.map(function (x) { return "• " + x; }).join("\n"));
    if (!faltan.length && !distintos.length && !sobran.length) partes.push("✅ Todo cuadra.");
    bloques.push(partes.join("\n\n"));
  });

  return bloques.join("\n\n———\n\n");
}

function guardarDebugNomina_(props, texto) {
  props.setProperty("NOMINA_DEBUG_TEXTO", String(texto || "").slice(0, 8000));
}
