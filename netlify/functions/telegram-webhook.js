// Relé entre el webhook de Telegram y el Web App de Apps Script.
//
// Las URLs /exec de Apps Script siempre responden con un 302 (redirigen a
// script.googleusercontent.com para servir el contenido), y Telegram
// rechaza cualquier respuesta de webhook que no sea 200. Apps Script ya
// ejecuta doPost() (guarda en Sheet, contesta por Telegram, etc.) en el
// momento de recibir el POST, antes de generar ese 302, así que basta con
// reenviar la petición y devolver 200 a Telegram sin esperar el redirect.

const GAS_WEBAPP_URL =
  process.env.GAS_WEBAPP_URL ||
  "https://script.google.com/macros/s/AKfycbwrgAgbS8C4TqhU5Uw-MFHAbb9moH8c9Mlnh4Rjv7XNiUNlRdYYQCap-PUTDXe9RcI/exec";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 200, body: "ok" };
  }

  try {
    await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: event.body,
      redirect: "manual",
    });
  } catch (error) {
    console.error("Error reenviando el update de Telegram a Apps Script:", error);
  }

  return { statusCode: 200, body: "ok" };
};
