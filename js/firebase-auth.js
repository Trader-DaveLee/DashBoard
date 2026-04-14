import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { auth, googleProvider } from "./firebase-config.js";

/**
 * Google 로그인 실행
 */
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("[Firebase Login Error]", error);
    throw error;
  }
}

/**
 * 로그아웃 실행
 */
export async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("[Firebase Logout Error]", error);
    throw error;
  }
}

/**
 * 인증 상태 변화 감지 리스너 등록
 */
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
}
