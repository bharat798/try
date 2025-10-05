// File Name: firebase-config.js

const firebaseConfig = {
  apiKey: "AIzaSyDVrmQg4ltrhqsKh3NbThno86lygnvGF64",
  authDomain: "trynew-6ec7a.firebaseapp.com",
  projectId: "trynew-6ec7a",
  storageBucket: "trynew-6ec7a.firebasestorage.app",
  messagingSenderId: "733032019749",
  appId: "1:733032019749:web:a14c934d4372e877368ccc",
  measurementId: "G-3EK5SJB4VN"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
