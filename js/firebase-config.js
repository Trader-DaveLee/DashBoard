import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

/**
 * Firebase Configuration
 * Firebase 콘솔에서 프로젝트 설정 > 내 앱 > 웹 앱의 설정을 아래에 복사해 넣으세요.
 */
const firebaseConfig = {
  apiKey: "AIzaSyDu29B200b29tL9zVN5ceYoaO8LIz0C49k",
  authDomain: "trading-dashboard-davelee.firebaseapp.com",
  projectId: "trading-dashboard-davelee",
  storageBucket: "trading-dashboard-davelee.firebasestorage.app",
  messagingSenderId: "204979000518",
  appId: "1:204979000518:web:c2f401e8815bee538273c7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export instances
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
