// Replace with your Firebase config from https://console.firebase.google.com
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: "AIzaSyCDlZf-7nrIbZJl1xHD-kypDsY7jrQzLbE",
  authDomain: "play-tennis-ae365.firebaseapp.com",
  projectId: "play-tennis-ae365",
  storageBucket: "play-tennis-ae365.firebasestorage.app",
  messagingSenderId: "165430823769",
  appId: "1:165430823769:web:602759cda74b7a3b0d9a48",
  measurementId: "G-KFSNSVR2C1"
};

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
