// Producción: cambia apiUrl por la URL pública de tu backend (Render, Azure, etc.)
export const environment = {
  production: true,
  apiUrl: 'https://martillo-autos-api.onrender.com/api',
  rtdbRoot: 'subastas',
  firebase: {
    // Consola Firebase > Configuración del proyecto > Tus apps > App web
    apiKey: 'TU_API_KEY',
    authDomain: 'fir-signos-vitales.firebaseapp.com',
    databaseURL: 'https://fir-signos-vitales-default-rtdb.firebaseio.com',
    projectId: 'fir-signos-vitales',
    storageBucket: 'fir-signos-vitales.appspot.com',
    messagingSenderId: 'TU_SENDER_ID',
    appId: 'TU_APP_ID',
  },
};
