import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDmo3mG8hvyHWzE_k7U-uPfo6nJQ-qY5BU",
  authDomain: "pulsevision-60fee.firebaseapp.com",
  projectId: "pulsevision-60fee",
  storageBucket: "pulsevision-60fee.firebasestorage.app",
  messagingSenderId: "784410702285",
  appId: "1:784410702285:web:f2a5d44f86eb0d811f1484"
};

const app = initializeApp(firebaseConfig);

window.auth = getAuth(app);
window.db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true
});
window.storage = getStorage(app);