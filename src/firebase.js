import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDmo3mG8hvyHWzE_k7U-uPfo6nJQ-qY5BU",
  authDomain: "pulsevision-60fee.firebaseapp.com",
  projectId: "pulsevision-60fee",
  storageBucket: "pulsevision-60fee.firebasestorage.app",
  messagingSenderId: "784410702285",
  appId: "1:784410702285:web:f2a5d44f86eb0d811f1484"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);