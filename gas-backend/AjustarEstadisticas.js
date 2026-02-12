function actualizarFormulasMeses_TablaCompleta() {
  const OLD_YEAR = 2025;
  const NEW_YEAR = 2026;

  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo",
    "Junio", "Julio", "Agosto", "Septiembre",
    "Octubre", "Noviembre", "Diciembre"
  ];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getActiveSheet();

  const rango = hoja.getRange("B2:M6"); // tu rango
  const formulas = rango.getFormulas();
  const faltan = [];

  for (let col = 0; col < meses.length; col++) {
    const mes = meses[col];

    // ✅ Orden correcto: "Mes - 2026"
    const nombreHojaNueva = `${mes} - ${NEW_YEAR}`;

    // Solo comprueba (NO crea hojas)
    if (!ss.getSheetByName(nombreHojaNueva)) faltan.push(nombreHojaNueva);

    // Reemplazos que soporta:
    const viejo1 = `'${mes} - ${OLD_YEAR}'`; // "Enero - 2025"
    const viejo2 = `'${OLD_YEAR} - ${mes}'`; // por si alguna fórmula antigua lo tenía al revés
    const nuevo  = `'${mes} - ${NEW_YEAR}'`; // "Enero - 2026"

    for (let row = 0; row < formulas.length; row++) {
      let f = formulas[row][col];
      if (!f) continue;

      if (f.includes(viejo1)) f = f.split(viejo1).join(nuevo);
      if (f.includes(viejo2)) f = f.split(viejo2).join(nuevo);

      formulas[row][col] = f;
    }
  }

  rango.setFormulas(formulas);

  if (faltan.length) {
    SpreadsheetApp.getUi().alert(
      "Fórmulas actualizadas en B2:M6, pero faltan estas hojas:\n\n" +
      [...new Set(faltan)].join("\n")
    );
  } else {
    SpreadsheetApp.getUi().alert("Fórmulas actualizadas correctamente para 2026 en B2:M6.");
  }
}
