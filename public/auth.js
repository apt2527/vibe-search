// auth.js
import { supabase } from "./supabaseClient.js";

const hero = document.querySelector(".hero");

const authBox = document.createElement("div");
authBox.className = "auth-box";

authBox.innerHTML = `
  <h3 style="color:white;">Login / Signup</h3>
  <input id="authEmail" type="email" placeholder="Email" />
  <input id="authPassword" type="password" placeholder="Password" />
  <button id="signupBtn">Sign up</button>
  <button id="loginBtn">Login</button>
  <button id="logoutBtn" style="display:none;">Logout</button>
  <span id="authStatus" style="color:#ccc;font-size:0.9rem;margin-left:8px;"></span>
`;

hero.insertAdjacentElement("afterend", authBox);

const emailInput = document.getElementById("authEmail");
const passInput = document.getElementById("authPassword");
const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authStatus = document.getElementById("authStatus");

async function updateAuthUI() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (user) {
    // Logged in: show email + logout, hide signup/login fields
    emailInput.style.display = "none";
    passInput.style.display = "none";
    signupBtn.style.display = "none";
    loginBtn.style.display = "none";

    logoutBtn.style.display = "inline-block";
    authStatus.textContent = `Logged in as ${user.email}`;
  } else {
    // Not logged in: show login/signup, hide logout
    emailInput.style.display = "inline-block";
    passInput.style.display = "inline-block";
    signupBtn.style.display = "inline-block";
    loginBtn.style.display = "inline-block";

    logoutBtn.style.display = "none";
    authStatus.textContent = "";
  }
}

async function handleSignup() {
  const email = emailInput.value.trim();
  const password = passInput.value.trim();
  if (!email || !password) return;

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    authStatus.textContent = "Signup error: " + error.message;
  } else {
    authStatus.textContent = "Signup successful. Now click Login.";
  }
}

async function handleLogin() {
  const email = emailInput.value.trim();
  const password = passInput.value.trim();
  if (!email || !password) return;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    authStatus.textContent = "Login error: " + error.message;
  } else {
    authStatus.textContent = "";
    await updateAuthUI();

    // 🔹 NEW: load saved trips right after login
    if (window.loadMyTrips) {
      window.loadMyTrips(email);
    }
  }
}


async function handleLogout() {
  await supabase.auth.signOut();
  await updateAuthUI();
}

signupBtn.onclick = handleSignup;
loginBtn.onclick = handleLogin;
logoutBtn.onclick = handleLogout;

// Expose helper for app.js
window.getCurrentUser = async function () {
  const { data } = await supabase.auth.getUser();
  return data.user || null;
};

// Initial UI state
updateAuthUI();

// Also react to auth state changes (optional but nice)
supabase.auth.onAuthStateChange((_event, _session) => {
  updateAuthUI();
});
