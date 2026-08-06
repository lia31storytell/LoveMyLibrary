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

// Inizializzazione Firebase & Firestore
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUserProfile = null;
let isRegisterMode = false;
let userBooks = [];
let library3DInstance = null;

// --- INIZIALIZZAZIONE ---
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  
  // Ascolta lo stato dell'autenticazione in tempo reale
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      await fetchProfile(user.uid);
    } else {
      showAuthScreen();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
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

// --- VISUALIZZAZIONE SCHERMATE ---
function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'block';
  document.getElementById('app-content').style.display = 'none';
  document.getElementById('logout-btn').style.display = 'none';
  document.getElementById('user-badge').textContent = '';
}

function showAppContent() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-content').style.display = 'block';
  document.getElementById('logout-btn').style.display = 'block';
  document.getElementById('user-badge').textContent = `👤 @${currentUserProfile.username}`;

  loadUserBooks();
  if (!library3DInstance) {
    library3DInstance = new InteractiveLibrary3D('canvas-3d-container');
  }
}

function toggleAuthMode(e) {
  e.preventDefault();
  isRegisterMode = !isRegisterMode;
  
  document.getElementById('auth-title').textContent = isRegisterMode ? '📝 Registrati a LoveMyLibrary' : '🔐 Accedi a LoveMyLibrary';
  document.getElementById('auth-submit-btn').textContent = isRegisterMode ? 'Crea Account' : 'Accedi';
  document.getElementById('auth-toggle-link').textContent = isRegisterMode ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati';
  document.getElementById('username-field-group').style.display = isRegisterMode ? 'block' : 'none';
  document.getElementById('nickname-suggestions').innerHTML = '';
}

// --- GESTIONE LOGIN & REGISTRAZIONE ---
async function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  const username = document.getElementById('auth-username').value.trim();

  if (isRegisterMode) {
    if (!username) {
      alert("Inserisci un Nickname!");
      return;
    }

    // 1. Verifica univocità Nickname su Firestore
    const usernameQuery = await db.collection('profiles').where('username', '==', username).get();
    
    if (!usernameQuery.empty) {
      generateNicknameSuggestions(username);
      return;
    }

    try {
      // 2. Registrazione utente Firebase
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;

      // 3. Salva il profilo nel database
      await db.collection('profiles').doc(user.uid).set({
        id: user.uid,
        username: username,
        email: email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      alert("🎉 Registrazione completata con successo!");
    } catch (error) {
      alert("Errore registrazione: " + error.message);
    }

  } else {
    // LOGIN
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
      alert("Credenziali non valide: " + error.message);
    }
  }
}

// --- SUGGERIMENTO NICKNAME SE OCCUPATO ---
function generateNicknameSuggestions(baseName) {
  const suggestionsBox = document.getElementById('nickname-suggestions');
  const randNum = Math.floor(100 + Math.random() * 900);
  
  const alt1 = `${baseName}_${randNum}`;
  const alt2 = `${baseName}Book`;
  const alt3 = `Real_${baseName}`;

  suggestionsBox.innerHTML = `
    ⚠️ Il nickname <strong>"${baseName}"</strong> è già preso.<br>
    Prova uno di questi disponibili:<br>
    👉 <a href="#" onclick="applySuggestion('${alt1}')" style="color:var(--accent-lilac);">${alt1}</a> | 
    <a href="#" onclick="applySuggestion('${alt2}')" style="color:var(--accent-lilac);">${alt2}</a> | 
    <a href="#" onclick="applySuggestion('${alt3}')" style="color:var(--accent-lilac);">${alt3}</a>
  `;
}

function applySuggestion(suggestedName) {
  document.getElementById('auth-username').value = suggestedName;
  document.getElementById('nickname-suggestions').innerHTML = '✅ Nickname selezionato!';
}

// --- RECUPERO PASSWORD VIA EMAIL ---
function showForgotPasswordModal(e) {
  e.preventDefault();
  document.getElementById('forgot-modal').style.display = 'flex';
}
function closeForgotPasswordModal() {
  document.getElementById('forgot-modal').style.display = 'none';
}

async function sendPasswordReset() {
  const email = document.getElementById('reset-email-input').value.trim();
  if (!email) {
    alert("Inserisci un'email valida.");
    return;
  }

  try {
    await auth.sendPasswordResetEmail(email);
    alert("📧 Link di ripristino inviato! Controlla la tua casella di posta.");
    closeForgotPasswordModal();
  } catch (error) {
    alert("Errore: " + error.message);
  }
}

// --- LOGOUT ---
async function logout() {
  await auth.signOut();
  currentUserProfile = null;
  showAuthScreen();
}

// --- GESTIONE LIBRI & LIBRERIA 3D ---
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

  const newBook = {
    id: Date.now(),
    title,
    author,
    rating,
    spicy,
    cover: cover || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=300'
  };

  userBooks.push(newBook);
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
      <img src="${b.cover}" style="height: 110px; object-fit: cover; border-radius: 6px; margin-bottom: 0.5rem;" onError="this.src='https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=300'">
      <h4 style="margin: 0.2rem 0;">${b.title}</h4>
      <small style="color: var(--text-secondary);">${b.author}</small>
      <div style="margin-top: 0.4rem; font-size: 0.8rem;">${'⭐'.repeat(b.rating)} ${'🌶️'.repeat(b.spicy)}</div>
    </div>
  `).join('');
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

function sendChatMessage() {
  const input = document.getElementById('chat-input-text');
  const text = input.value.trim();
  if (!text) return;

  const box = document.getElementById('chat-messages-box');
  const msg = document.createElement('div');
  msg.style = 'margin-bottom: 6px; padding: 6px; background: var(--bg-primary); border-radius: 6px; font-size: 0.9rem;';
  msg.innerHTML = `<strong>@${currentUserProfile.username}:</strong> ${text}`;
  box.appendChild(msg);
  box.scrollTop = box.scrollHeight;
  input.value = '';
}

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

    const pointLight = new THREE.PointLight(0xc084fc, 1.5, 20);
    pointLight.position.set(0, 5, 5);
    this.scene.add(pointLight);

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

    const colors = [0xc084fc, 0xf472b6, 0x38bdf8, 0x4ade80, 0xfacc15];
    userBooks.forEach((book, index) => {
      const bookGeo = new THREE.BoxGeometry(0.3, 0.9, 0.7);
      const mat = new THREE.MeshStandardMaterial({ color: colors[index % colors.length] });
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