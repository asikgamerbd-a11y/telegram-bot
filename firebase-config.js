// firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyAOdGh3BiTkm5TFlJdMuZLfFJoLB0Vs8L4",
    authDomain: "admin-asik.firebaseapp.com",
    projectId: "admin-asik",
    storageBucket: "admin-asik.firebasestorage.app",
    messagingSenderId: "492903103490",
    appId: "1:492903103490:web:1faca23621047abcbdbb1b",
    measurementId: "G-QGB6K6XGQV"
};

// Firebase modules
const { initializeApp } = require('firebase/app');
const { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    onSnapshot
} = require('firebase/firestore');
const {
    getAuth,
    signInWithEmailAndPassword,
    signOut
} = require('firebase/auth');

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

module.exports = { db, auth, collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, onSnapshot };
