# PulseVision

PulseVision es una plataforma web de acompañamiento comunitario que conecta a adultos mayores con estudiantes universitarios voluntarios. Facilita solicitar ayuda (compañía, compras, citas, etc.), hacer seguimiento del acompañamiento y que docentes o administradores validen la participación de los voluntarios.

## Cómo correrlo localmente

1. Instala las dependencias:

```bash
npm install
```

2. Configura Firebase en `src/firebase.js` con las credenciales de tu proyecto (Auth, Firestore y Storage).

3. Abre el proyecto con **Live Server** (extensión de VS Code/Cursor) apuntando a `index.html`, o sirve la carpeta del proyecto con cualquier servidor estático local.

La app es frontend estático (HTML/CSS/JS). No hay un comando `npm start` propio: el servidor local solo sirve los archivos y Firebase se usa desde el navegador.
