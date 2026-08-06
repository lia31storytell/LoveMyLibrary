// --- CONFIGURAZIONE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAfrBgWzeOxwfFhPt-X8nd1TRfFnomsJcU",
  authDomain: "lovemylibrary-96b76.firebaseapp.com",
  projectId: "lovemylibrary-96b76",
  storageBucket: "lovemylibrary-96b76.firebasestorage.app",
  messagingSenderId: "1016435693298",
  appId: "1:1016435693298:web:eca54c8af796f6a99ce26b",
  measurementId: "G-XV2NTV1MH7"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUserProfile = null;
let isRegisterMode = false;
let userBooks = [];
let library3DInstance = null;
let activeDMUserId = null;
let dmUnsubscribe = null;

// --- INIZIALIZZAZIONE RECAPTCHA PER SMS ---
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  
  // Inizializza reCAPTCHA invisibile per la verifica SMS
  window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
    'size': 'invisible'
  });

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      await fetchProfile(user.uid);
      checkEmailVerificationStatus(user);
    } else {
      showAuthScreen();
    }
  });
});

async function fetchProfile(uid) {
  const doc = await db.collection('profiles').doc(uid).get();
  if (doc.exists) {
    currentUserProfile = doc.data();
    showAppContent();
  } else {
    showAuthScreen();
  }
}

// --- 1. REGISTRAZIONE & VERIFICA EMAIL ALLA REGISTRAZIONE ---
async function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  const username = document.getElementById('auth-username').value.trim();

  if (isRegisterMode) {
    if (!username) return alert("Inserisci un Nickname!");

    const usernameQuery = await db.collection('profiles').where('username', '==', username).get();
    if (!usernameQuery.empty) {
      alert("Nickname occupato! Scegline un altro.");
      return;
    }

    try {
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;

      // Invia la mail di verifica indirizzo email
      auth.useDeviceLanguage();
      await user.sendEmailVerification();

      await db.collection('profiles').doc(user.uid).set({
        id: user.uid,
        username: username,
        email: email,
        avatarIcon: '📚',
        followers: [],
        following: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      alert("🎉 Account creato con successo! Ti abbiamo inviato una mail per verificare il tuo indirizzo email.");
    } catch (error) {
      alert("Errore registrazione: " + error.message);
    }
  } else {
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
      alert("Credenziali non valide: " + error.message);
    }
  }
}

function checkEmailVerificationStatus(user) {
  const banner = document.getElementById('email-verification-banner');
  if (banner) {
    banner.style.display = user.emailVerified ? 'none' : 'flex';
  }
}

async function resendVerificationEmail() {
  const user = auth.currentUser;
  if (user) {
    try {
      auth.useDeviceLanguage();
      await user.sendEmailVerification();
      alert("📧 Mail di verifica inviata nuovamente!");
    } catch (error) {
      alert("Errore: " + error.message);
    }
  }
}

// --- 2. REIMPOSTAZIONE PASSWORD ---
async function sendPasswordReset() {
  const email = document.getElementById('reset-email-input').value.trim();
  if (!email) return alert("Inserisci un'email valida.");
  
  try {
    auth.useDeviceLanguage();
    await auth.sendPasswordResetEmail(email);
    alert(`📧 Mail di reset inviata a: ${email}. Controlla la tua posta (anche in Spam)!`);
    closeForgotPasswordModal();
  } catch (error) {
    alert("Errore reset password: " + error.message);
  }
}

async function sendPasswordResetFromAccount() {
  if (!currentUserProfile) return;
  try {
    auth.useDeviceLanguage();
    await auth.sendPasswordResetEmail(currentUserProfile.email);
    alert(`📧 Mail di reset inviata a: ${currentUserProfile.email}`);
  } catch (error) {
    alert("Errore reset password: " + error.message);
  }
}

// --- 3. MODIFICA INDIRIZZO EMAIL UTENTE ---
async function requestEmailChange() {
  const newEmail = document.getElementById('new-email-input').value.trim();
  const user = auth.currentUser;
  if (!newEmail || !user) return alert("Inserisci una nuova email valida.");

  try {
    auth.useDeviceLanguage();
    await user.verifyBeforeUpdateEmail(newEmail);
    alert(`📩 Abbiamo inviato un link di conferma a ${newEmail}. L'indirizzo si aggiornerà non appena avrai fatto clic sul link!`);
  } catch (error) {
    if (error.code === 'auth/requires-recent-login') {
      alert("⚠️ Per sicurezza, disconnettiti ed effettua nuovamente il Login prima di cambiare la tua email.");
    } else {
      alert("Errore cambio email: " + error.message);
    }
  }
}

// --- 4. VERIFICA TRAMITE SMS (PHONE AUTH) ---
async function sendSMSCode() {
  const phoneNumber = document.getElementById('phone-number-input').value.trim();
  if (!phoneNumber) return alert("Inserisci un numero con prefisso internazionale (es. +393401234567)");

  const appVerifier = window.recaptchaVerifier;

  try {
    const confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, appVerifier);
    window.confirmationResult = confirmationResult;
    alert("📲 SMS inviato al tuo numero! Inserisci il codice a 6 cifre per confermare.");
  } catch (error) {
    alert("Errore invio SMS: " + error.message);
  }
}

async function confirmSMSCode() {
  const code = document.getElementById('sms-code-input').value.trim();
  if (!code || !window.confirmationResult) return alert("Invia prima l'SMS e inserisci il codice ricevuto.");

  try {
    const result = await window.confirmationResult.confirm(code);
    alert("✅ Numero di telefono verificato con successo: " + result.user.phoneNumber);
  } catch (error) {
    alert("❌ Codice SMS errato o scaduto: " + error.message);
  }
}

// --- VISUALIZZAZIONE SCHERMATE & UI ---
function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'block';
  document.getElementById('app-content').style.display = 'none';
  document.getElementById('user-menu-wrapper').style.display = 'none';
}

function showAppContent() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-content').style.display = 'block';
  document.getElementById('user-menu-wrapper').style.display = 'block';
  
  document.getElementById('user-badge').textContent = `@${currentUserProfile.username}`;
  document.getElementById('dropdown-user-email').textContent = currentUserProfile.email;

  loadUserBooks();
  loadCommunityUsers();
  loadPrivateChatUsers();

  if (!library3DInstance) {
    library3DInstance = new InteractiveLibrary3D('canvas-3d-container');
  }
}

function toggleDropdown(e) {
  e.stopPropagation();
  document.getElementById('user-dropdown').classList.toggle('show');
}

window.addEventListener('click', () => {
  const menu = document.getElementById('user-dropdown');
  if (menu && menu.classList.contains('show')) menu.classList.remove('show');
});

function openAccountModal() {
  document.getElementById('user-dropdown').classList.remove('show');
  document.getElementById('profile-username').value = currentUserProfile.username || '';
  document.getElementById('profile-age').value = currentUserProfile.age || '';
  document.getElementById('profile-bio').value = currentUserProfile.bio || '';
  document.getElementById('profile-photo-url').value = currentUserProfile.photoUrl || '';
  document.getElementById('account-modal').style.display = 'flex';
}

function closeAccountModal() {
  document.getElementById('account-modal').style.display = 'none';
}

async function saveProfileChanges(e) {
  e.preventDefault();
  const age = document.getElementById('profile-age').value;
  const bio = document.getElementById('profile-bio').value.trim();
  const photoUrl = document.getElementById('profile-photo-url').value.trim();

  try {
    await db.collection('profiles').doc(currentUserProfile.id).update({
      age: age ? parseInt(age) : null,
      bio: bio,
      photoUrl: photoUrl
    });
    alert("✅ Profilo aggiornato!");
    closeAccountModal();
  } catch (error) {
    alert("Errore salvataggio: " + error.message);
  }
}

// --- GESTIONE CHAT (DM + COMMUNITY) ---
function openChatZone() {
  document.getElementById('user-dropdown').classList.remove('show');
  const chatZone = document.getElementById('chat-zone-section');
  chatZone.style.display = 'block';
  chatZone.scrollIntoView({ behavior: 'smooth' });
}

function closeChatZone() {
  document.getElementById('chat-zone-section').style.display = 'none';
}

function switchChatTab(tabName) {
  const privateContent = document.getElementById('chat-tab-content-private');
  const communityContent = document.getElementById('chat-tab-content-community');
  const btnPrivate = document.getElementById('tab-btn-private');
  const btnCommunity = document.getElementById('tab-btn-community');

  if (tabName === 'private') {
    privateContent.style.display = 'block';
    communityContent.style.display = 'none';
    btnPrivate.classList.add('active');
    btnCommunity.classList.remove('active');
  } else {
    privateContent.style.display = 'none';
    communityContent.style.display = 'block';
    btnPrivate.classList.remove('active');
    btnCommunity.classList.add('active');
  }
}

async function loadPrivateChatUsers() {
  const container = document.getElementById('dm-users-list');
  if (!container) return;

  const snapshot = await db.collection('profiles').limit(20).get();
  let html = '';

  snapshot.forEach(doc => {
    const u = doc.data();
    if (u.id !== currentUserProfile.id) {
      html += `
        <div class="dm-user-item" id="dm-user-item-${u.id}" onclick="openPrivateChatWith('${u.id}', '${u.username}')">
          <strong>@${u.username}</strong>
        </div>
      `;
    }
  });

  container.innerHTML = html || '<p style="color:var(--text-secondary); padding:1rem;">Nessun utente.</p>';
}

function openPrivateChatWith(targetUserId, targetUsername) {
  openChatZone();
  switchChatTab('private');
  activeDMUserId = targetUserId;
  document.getElementById('dm-input-text').disabled = false;
  document.getElementById('dm-send-btn').disabled = false;
  document.getElementById('dm-chat-header').innerHTML = `💬 Chat con <strong>@${targetUsername}</strong>`;
  listenPrivateMessages(targetUserId);
}

function listenPrivateMessages(targetUserId) {
  if (dmUnsubscribe) dmUnsubscribe();

  const chatId = currentUserProfile.id < targetUserId ? `${currentUserProfile.id}_${targetUserId}` : `${targetUserId}_${currentUserProfile.id}`;
  const messagesBox = document.getElementById('dm-messages-container');

  dmUnsubscribe = db.collection('direct_chats').doc(chatId).collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot(snapshot => {
      messagesBox.innerHTML = '';
      snapshot.forEach(doc => {
        const m = doc.data();
        const bubble = document.createElement('div');
        bubble.className = `dm-message-bubble ${m.senderId === currentUserProfile.id ? 'mine' : 'other'}`;
        bubble.textContent = m.text;
        messagesBox.appendChild(bubble);
      });
      messagesBox.scrollTop = messagesBox.scrollHeight;
    });
}

async function sendPrivateMessage() {
  const input = document.getElementById('dm-input-text');
  const text = input.value.trim();
  if (!text || !activeDMUserId) return;

  const chatId = currentUserProfile.id < activeDMUserId ? `${currentUserProfile.id}_${activeDMUserId}` : `${activeDMUserId}_${currentUserProfile.id}`;

  await db.collection('direct_chats').doc(chatId).collection('messages').add({
    senderId: currentUserProfile.id,
    receiverId: activeDMUserId,
    text: text,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  input.value = '';
}

function sendChatMessage() {
  const input = document.getElementById('chat-input-text');
  const text = input.value.trim();
  if (!text) return;

  const box = document.getElementById('chat-messages-box');
  const msg = document.createElement('div');
  msg.style = 'margin-bottom: 6px; padding: 6px; background: var(--bg-surface); border-radius: 6px; font-size: 0.9rem; border: 1px solid var(--border-color);';
  msg.innerHTML = `<strong style="color: var(--accent-pink);">@${currentUserProfile.username}:</strong> ${text}`;
  box.appendChild(msg);
  box.scrollTop = box.scrollHeight;
  input.value = '';
}

// --- ALTRE UTILITÀ ---
function toggleAuthMode(e) {
  e.preventDefault();
  isRegisterMode = !isRegisterMode;
  document.getElementById('auth-title').textContent = isRegisterMode ? '📝 Registrati a LoveMyLibrary' : '🔐 Accedi a LoveMyLibrary';
  document.getElementById('auth-submit-btn').textContent = isRegisterMode ? 'Crea Account' : 'Accedi';
  document.getElementById('username-field-group').style.display = isRegisterMode ? 'block' : 'none';
}

function showForgotPasswordModal(e) {
  e.preventDefault();
  document.getElementById('forgot-modal').style.display = 'flex';
}

function closeForgotPasswordModal() {
  document.getElementById('forgot-modal').style.display = 'none';
}

async function logout() {
  await auth.signOut();
  showAuthScreen();
}

function loadUserBooks() {
  const saved = localStorage.getItem(`books_${currentUserProfile.id}`);
  userBooks = saved ? JSON.parse(saved) : [];
  renderBooksList();
  if (library3DInstance) library3DInstance.buildShelves();
}

function submitNewBook(e) {
  e.preventDefault();
  const title = document.getElementById('book-title').value.trim();
  const author = document.getElementById('book-author').value.trim();
  const rating = document.getElementById('book-rating').value;
  const spicy = document.getElementById('book-spicy').value;
  const cover = document.getElementById('book-cover-url').value.trim();

  userBooks.push({ id: Date.now(), title, author, rating, spicy, cover: cover || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=300' });
  localStorage.setItem(`books_${currentUserProfile.id}`, JSON.stringify(userBooks));
  document.getElementById('add-book-form').reset();
  renderBooksList();
  if (library3DInstance) library3DInstance.buildShelves();
}

function renderBooksList() {
  const container = document.getElementById('my-books-list');
  document.getElementById('books-count-badge').textContent = `${userBooks.length} Libri`;

  if (userBooks.length === 0) {
    container.innerHTML = '<p style="grid-column: 1/-1; color: var(--text-secondary);">Nessun libro salvato.</p>';
    return;
  }

  container.innerHTML = userBooks.map(b => `
    <div class="card" style="padding: 1rem; text-align: center; margin-bottom: 0;">
      <img src="${b.cover}" style="height: 110px; object-fit: cover; border-radius: 6px; margin-bottom: 0.5rem;">
      <h4 style="margin: 0.2rem 0;">${b.title}</h4>
      <small style="color: var(--text-secondary);">${b.author}</small>
    </div>
  `).join('');
}

async function loadCommunityUsers() {
  const container = document.getElementById('users-community-list');
  if (!container) return;

  const snapshot = await db.collection('profiles').limit(20).get();
  let html = '';
  snapshot.forEach(doc => {
    const u = doc.data();
    if (u.id !== currentUserProfile.id) {
      html += `
        <div class="card" style="text-align: center; padding: 1rem;">
          <strong>@${u.username}</strong>
          <button class="btn-primary" style="width:100%; margin-top:0.5rem; font-size:0.8rem;" onclick="openPrivateChatWith('${u.id}', '${u.username}')">💬 Messaggio Privato</button>
        </div>
      `;
    }
  });
  container.innerHTML = html;
}

function scrollToSection(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
  document.getElementById('user-dropdown').classList.remove('show');
}

function initTheme() {
  const toggleBtn = document.getElementById('theme-toggle');
  toggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    toggleBtn.textContent = nextTheme === 'dark' ? '☀️ Chiaro' : '🌙 Notturno';
  });
}

// THREE.JS 3D LIBRARY
class InteractiveLibrary3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.init();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x09090b);

    this.camera = new THREE.PerspectiveCamera(50, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 2.5, 7);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(this.renderer.domElement);

    const light = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(light);

    this.shelvesGroup = new THREE.Group();
    this.scene.add(this.shelvesGroup);
    this.buildShelves();
    this.animate();
  }

  buildShelves() {
    while (this.shelvesGroup.children.length > 0) {
      this.shelvesGroup.remove(this.shelvesGroup.children[0]);
    }

    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x27272a });
    const shelfGeo = new THREE.BoxGeometry(5, 0.1, 1);

    [0, 2].forEach(y => {
      const shelf = new THREE.Mesh(shelfGeo, shelfMat);
      shelf.position.y = y;
      this.shelvesGroup.add(shelf);
    });

    userBooks.forEach((book, index) => {
      const bookGeo = new THREE.BoxGeometry(0.3, 0.9, 0.7);
      const mat = new THREE.MeshStandardMaterial({ color: 0xec4899 });
      const bookMesh = new THREE.Mesh(bookGeo, mat);

      const shelfIndex = Math.floor(index / 8);
      const xPos = -1.8 + (index % 8) * 0.5;
      const yPos = shelfIndex * 2 + 0.5;

      bookMesh.position.set(xPos, yPos, 0);
      this.shelvesGroup.add(bookMesh);
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.renderer.render(this.scene, this.camera);
  }
}