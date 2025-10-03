// File Name: firebase-config.js

const firebaseConfig = {
  apiKey: "AIzaSyB33CLb3Wyicw2axjCC8QnF0wo5qo0CuGs", 
  authDomain: "employee-portal-app-41780.firebaseapp.com", 
  projectId: "employee-portal-app-41780", 
  storageBucket: "employee-portal-app-41780.firebasestorage.app", 
  messagingSenderId: "823578602169", 
  appId: "1:823578602169:web:0dc4dfadd7ac63f7f68968" 
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth(); // Added auth initialization