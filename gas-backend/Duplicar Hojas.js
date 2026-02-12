function duplicarHojasDesdeBase() {
  // Nombre de la hoja base
  const nombreHojaBase = "Base"; // Cambia esto si tu hoja base tiene otro nombre
  const anio = "2026"; // Año que deseas incluir en los nombres
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", 
    "Junio", "Julio", "Agosto", "Septiembre", 
    "Octubre", "Noviembre", "Diciembre"
  ];
  
  // Acceder al libro activo
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaBase = ss.getSheetByName(nombreHojaBase);
  
  if (!hojaBase) {
    throw new Error("No se encontró la hoja base con el nombre: " + nombreHojaBase);
  }
  
  // Crear hojas duplicadas
  meses.forEach(mes => {
    const nombreNuevaHoja = `${mes} - ${anio}`;
    if (!ss.getSheetByName(nombreNuevaHoja)) { // Evitar duplicados
      const nuevaHoja = hojaBase.copyTo(ss);
      nuevaHoja.setName(nombreNuevaHoja);
    }
  });
  
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert("Hojas duplicadas y renombradas exitosamente.");
}
