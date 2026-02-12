function actualizarFormulaPorMes() {
  // Lista de meses
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", 
    "Junio", "Julio", "Agosto", "Septiembre", 
    "Octubre", "Noviembre", "Diciembre"
  ];
  
  // Obtener la hoja activa
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Define el rango donde pondrás las fórmulas (ajusta este rango según tus necesidades)
  const rango = hoja.getRange("B1:B12");  // Cambia el rango según el área donde deseas poner las fórmulas
  
  // Iterar sobre los meses y crear la fórmula correspondiente para cada mes
  for (let i = 0; i < meses.length; i++) {
    const mes = meses[i];
    const formula = `=COUNTIF('${mes} - 2026'!C:C;"Vacaciones")`;
    
    // Establecer la fórmula en la celda correspondiente
    rango.getCell(i + 1, 1).setFormula(formula);
  }
  
  // Mostrar un mensaje cuando las fórmulas se actualicen
  SpreadsheetApp.getUi().alert("Fórmulas actualizadas con los meses correctamente.");
}
