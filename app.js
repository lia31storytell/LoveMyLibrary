// CONFIGURAZIONE FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyAfrBgWzeOxwfFhPt-X8nd1TRfFnomsJcU",
  authDomain: "lovemylibrary-96b76.firebaseapp.com",
  projectId: "lovemylibrary-96b76",
  storageBucket: "lovemylibrary-96b76.firebasestorage.app",
  messagingSenderId: "1016435693298",
  appId: "1:1016435693298:web:eca54c8af796f6a99ce26b"
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

// INIZIALIZZAZIONE
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  
  // Recaptcha invisibile per Phone Auth
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

// 1. GESTIONE AUTENTICAZIONE (EMAIL + NICKNAME)
async function handleAuth(e) {
  e.preventDefault();
  const identifier = document.getElementById('auth-identifier').value.trim();
  const password = document.getElementById('auth-password').value.trim();

  if (isRegisterMode) {
    const signupEmail = document.getElementById('auth-signup-email').value.trim();
    const username = identifier;

    if (!username || !signupEmail) return alert("Inserisci sia Nickname che Email!");

    // Controlla se il nickname è unico
    const usernameQuery = await db.collection('profiles')
      .where('username_lowercase', '==', username.toLowerCase()).get();

    if (!usernameQuery.empty) {
      alert("⚠️ Nickname già occupato! Scegline un altro.");
      return;
    }

    try {
      const userCredential = await auth.createUserWithEmailAndPassword(signupEmail, password);
      const user = userCredential.user;

      auth.useDeviceLanguage();
      await user.sendEmailVerification();

      // Salva profilo con nickname sia normale che minuscolo (per il login)
      await db.collection('profiles').doc(user.uid).set({
        id: user.uid,
        username: username,
        username_lowercase: username.toLowerCase(),
        email: signupEmail,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      alert("🎉 Account creato! Ti abbiamo inviato un'email di verifica.");
    } catch (error) {
      alert("Errore registrazione: " + error.message);
    }

  } else {
    // LOGIN (Con Email o con Nickname)
    let emailToUse = identifier;

    // Se l'utente ha inserito un Nickname invece dell'email (assenza della '@')
    if (!identifier.includes('@')) {
      try {
        const querySnapshot = await db.collection('profiles')
          .where('username_lowercase', '==', identifier.toLowerCase()).get();

        if (querySnapshot.empty) {
          alert("❌ Nessun utente trovato con questo nickname.");
          return;
        }

        emailToUse = querySnapshot.docs[0].data().email;
      } catch (err) {
        alert("Errore durante il recupero del nickname: " + err.message);
        return;
      }
    }

    try {
      await auth.signInWithEmailAndPassword(emailToUse, password);
    } catch (error) {
      alert("Credenziali errate: " + error.message);
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
      alert("📧 Mail di verifica reinviata!");
    } catch (error) {
      alert("Errore invio: " + error.message);
    }
  }
}

// 2. REIMPOSTAZIONE PASSWORD
async function sendPasswordReset() {
  const input = document.getElementById('reset-email-input').value.trim();
  if (!input) return alert("Inserisci un'email o un nickname.");

  let targetEmail = input;
  if (!input.includes('@')) {
    const q = await db.collection('profiles').where('username_lowercase', '==', input.toLowerCase()).get();
    if (q.empty) return alert("Nickname non trovato.");
    targetEmail = q.docs[0].data().email;
  }

  try {
    auth.useDeviceLanguage();
    await auth.sendPasswordResetEmail(targetEmail);
    alert(`📧 Mail per reimpostare la password inviata a: ${targetEmail}`);
    closeForgotPasswordModal();
  } catch (error) {
    alert("Errore reset: " + error.message);
  }
}

async function sendPasswordResetFromAccount() {
  if (!currentUserProfile) return;
  try {
    auth.useDeviceLanguage();
    await auth.sendPasswordResetEmail(currentUserProfile.email);
    alert(`📧 Mail di reset inviata a: ${currentUserProfile.email}`);
  } catch (error) {
    alert("Errore reset: " + error.message);
  }
}

// 3. CAMBIO EMAIL
async function requestEmailChange() {
  const newEmail = document.getElementById('new-email-input').value.trim();
  const user = auth.currentUser;
  if (!newEmail || !user) return alert("Inserisci una nuova email valida.");

  try {
    auth.useDeviceLanguage();
    await user.verifyBeforeUpdateEmail(newEmail);
    
    // Aggiorna anche il record su Firestore
    await db.collection('profiles').doc(user.uid).update({ email: newEmail });
    alert(`📩 Inviato link di conferma alla nuova email: ${newEmail}`);
  } catch (error) {
    alert("Errore aggiornamento email: " + error.message);
  }
}

// 4. VERIFICA SMS (PHONE AUTH)
async function sendSMSCode() {
  const phoneNumber = document.getElementById('phone-number-input').value.trim();
  if (!phoneNumber) return alert("Inserisci il numero con prefisso internazionale (+39...)");

  try {
    const confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, window.recaptchaVerifier);
    window.confirmationResult = confirmationResult;
    alert("📲 SMS inviato! Inserisci il codice a 6 cifre.");
  } catch (error) {
    alert("Errore invio SMS: " + error.message);
  }
}

async function confirmSMSCode() {
  const code = document.getElementById('sms-code-input').value.trim();
  if (!code || !window.confirmationResult) return alert("Fai prima clic su Invia SMS.");

  try {
    const result = await window.confirmationResult.confirm(code);
    alert("✅ Numero di telefono verificato: " + result.user.phoneNumber);
  } catch (error) {
    alert("❌ Codice SMS errato: " + error.message);
  }
}

// UI HELPERS
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
  document.getElementById('account-modal').style.display = 'flex';
}

function closeAccountModal() {
  document.getElementById('account-modal').style.display = 'none';
}

async function saveProfileChanges(e) {
  e.preventDefault();
  const age = document.getElementById('profile-age').value;
  const bio = document.getElementById('profile-bio').value.trim();

  try {
    await db.collection('profiles').doc(currentUserProfile.id).update({
      age: age ? parseInt(age) : null,
      bio: bio
    });
    alert("✅ Profilo aggiornato!");
    closeAccountModal();
  } catch (error) {
    alert("Errore: " + error.message);
  }
}

// CHAT DM
function openChatZone() {
  document.getElementById('user-dropdown').classList.remove('show');
  const chatZone = document.getElementById('chat-zone-section');
  chatZone.style.display = 'block';
  chatZone.scrollIntoView({ behavior: 'smooth' });
}

function closeChatZone() {
  document.getElementById('chat-zone-section').style.display = 'none';
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
        <div class="dm-user-item" onclick="openPrivateChatWith('${u.id}', '${u.username}')">
          <strong>@${u.username}</strong>
        </div>
      `;
    }
  });

  container.innerHTML = html || '<p style="padding:1rem;">Nessun utente.</p>';
}

function openPrivateChatWith(targetUserId, targetUsername) {
  openChatZone();
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

function toggleAuthMode(e) {
  e.preventDefault();
  isRegisterMode = !isRegisterMode;

  document.getElementById('auth-title').textContent = isRegisterMode ? '📝 Registrati a LoveMyLibrary' : '🔐 Accedi a LoveMyLibrary';
  document.getElementById('auth-submit-btn').textContent = isRegisterMode ? 'Crea Account' : 'Accedi';
  document.getElementById('auth-toggle-link').textContent = isRegisterMode ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati';
  
  document.getElementById('auth-identifier-label').textContent = isRegisterMode ? 'Nickname Unico *' : 'Email o Nickname *';
  document.getElementById('auth-identifier').placeholder = isRegisterMode ? 'Scegli un nickname' : 'Email o nickname';
  document.getElementById('signup-email-group').style.display = isRegisterMode ? 'block' : 'none';
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

  userBooks.push({ id: Date.now(), title, author });
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