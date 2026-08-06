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

// Inizializzazione Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUserProfile = null;
let isRegisterMode = false;
let userBooks = [];
let library3DInstance = null;
let selectedAvatarIcon = '👤';

// Variabili Gestione Chat
let activeDMUserId = null;
let dmUnsubscribe = null;

// --- INIZIALIZZAZIONE ---
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      await fetchProfile(user.uid);
    } else {
      showAuthScreen();
    }
  });
});

async function fetchProfile(uid) {
  const doc = await db.collection('profiles').doc(uid).get();
  if (doc.exists) {
    currentUserProfile = doc.data();
    
    if (!currentUserProfile.followers) currentUserProfile.followers = [];
    if (!currentUserProfile.following) currentUserProfile.following = [];

    showAppContent();
  } else {
    showAuthScreen();
  }
}

// --- VISUALIZZAZIONE SCHERMATE ---
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

  updateFollowersStatsUI();
  updateHeaderUserBadge();
  loadUserBooks();
  loadCommunityUsers();
  loadPrivateChatUsers();

  if (!library3DInstance) {
    library3DInstance = new InteractiveLibrary3D('canvas-3d-container');
  }
}

function updateFollowersStatsUI() {
  const followersCount = (currentUserProfile.followers || []).length;
  const followingCount = (currentUserProfile.following || []).length;

  document.getElementById('header-followers-count').textContent = followersCount;
  document.getElementById('header-following-count').textContent = followingCount;
  document.getElementById('modal-followers-count').textContent = followersCount;
  document.getElementById('modal-following-count').textContent = followingCount;
}

// --- MENU DROPDOWN & NAVIGAZIONE ---
function toggleDropdown(e) {
  e.stopPropagation();
  document.getElementById('user-dropdown').classList.toggle('show');
}

window.addEventListener('click', () => {
  const menu = document.getElementById('user-dropdown');
  if (menu && menu.classList.contains('show')) menu.classList.remove('show');
});

function scrollToSection(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
  document.getElementById('user-dropdown').classList.remove('show');
}

// --- GESTIONE ZONA CHAT (DM + COMMUNITY) ---
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

// --- MESSAGGI PRIVATI DIRETTI (DM) ---
async function loadPrivateChatUsers() {
  const container = document.getElementById('dm-users-list');
  if (!container) return;

  try {
    const snapshot = await db.collection('profiles').limit(30).get();
    let html = '';

    snapshot.forEach(doc => {
      const u = doc.data();
      if (u.id !== currentUserProfile.id) {
        const avatarDisplay = u.photoUrl 
          ? `<img src="${u.photoUrl}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">`
          : `<span style="font-size:1.2rem;">${u.avatarIcon || '👤'}</span>`;

        html += `
          <div class="dm-user-item" id="dm-user-item-${u.id}" onclick="openPrivateChatWith('${u.id}', '${u.username}')">
            ${avatarDisplay}
            <div>
              <strong style="font-size:0.85rem;">@${u.username}</strong>
            </div>
          </div>
        `;
      }
    });

    container.innerHTML = html || '<p style="color:var(--text-secondary); padding:1rem;">Nessun utente trovato.</p>';
  } catch (error) {
    console.error("Errore caricamento contatti:", error);
  }
}

function openPrivateChatWith(targetUserId, targetUsername) {
  openChatZone();
  switchChatTab('private');

  activeDMUserId = targetUserId;
  document.querySelectorAll('.dm-user-item').forEach(item => item.classList.remove('active'));
  const activeItem = document.getElementById(`dm-user-item-${targetUserId}`);
  if (activeItem) activeItem.classList.add('active');

  document.getElementById('dm-input-text').disabled = false;
  document.getElementById('dm-send-btn').disabled = false;
  document.getElementById('dm-chat-header').innerHTML = `💬 Conversazione privata con <strong>@${targetUsername}</strong>`;

  listenPrivateMessages(targetUserId);
}

function getChatDocId(uid1, uid2) {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

function listenPrivateMessages(targetUserId) {
  if (dmUnsubscribe) dmUnsubscribe();

  const chatId = getChatDocId(currentUserProfile.id, targetUserId);
  const messagesBox = document.getElementById('dm-messages-container');

  dmUnsubscribe = db.collection('direct_chats')
    .doc(chatId)
    .collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot(snapshot => {
      messagesBox.innerHTML = '';
      if (snapshot.empty) {
        messagesBox.innerHTML = '<div style="text-align: center; color: var(--text-secondary); margin-top: 3rem;">Nessun messaggio. Inizia la conversazione!</div>';
        return;
      }

      snapshot.forEach(doc => {
        const m = doc.data();
        const isMine = m.senderId === currentUserProfile.id;
        const bubble = document.createElement('div');
        bubble.className = `dm-message-bubble ${isMine ? 'mine' : 'other'}`;
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

  const chatId = getChatDocId(currentUserProfile.id, activeDMUserId);

  try {
    await db.collection('direct_chats').doc(chatId).collection('messages').add({
      senderId: currentUserProfile.id,
      receiverId: activeDMUserId,
      text: text,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    input.value = '';
  } catch (error) {
    alert("Errore invio messaggio: " + error.message);
  }
}

// --- CHAT COMMUNITY PUBBLICA ---
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

// --- FOLLOW / UNFOLLOW & COMMUNITY ---
async function toggleFollowUser(targetUserId) {
  if (!currentUserProfile) return;

  const targetDocRef = db.collection('profiles').doc(targetUserId);
  const myDocRef = db.collection('profiles').doc(currentUserProfile.id);
  const isFollowing = currentUserProfile.following.includes(targetUserId);

  try {
    if (isFollowing) {
      currentUserProfile.following = currentUserProfile.following.filter(id => id !== targetUserId);
      await myDocRef.update({ following: firebase.firestore.FieldValue.arrayRemove(targetUserId) });
      await targetDocRef.update({ followers: firebase.firestore.FieldValue.arrayRemove(currentUserProfile.id) });
    } else {
      currentUserProfile.following.push(targetUserId);
      await myDocRef.update({ following: firebase.firestore.FieldValue.arrayUnion(targetUserId) });
      await targetDocRef.update({ followers: firebase.firestore.FieldValue.arrayUnion(currentUserProfile.id) });
    }

    updateFollowersStatsUI();
    loadCommunityUsers();
  } catch (error) {
    alert("Errore durante l'azione di Follow: " + error.message);
  }
}

async function loadCommunityUsers() {
  const container = document.getElementById('users-community-list');
  if (!container) return;

  try {
    const snapshot = await db.collection('profiles').limit(20).get();
    let html = '';

    snapshot.forEach(doc => {
      const u = doc.data();
      if (u.id !== currentUserProfile.id) {
        const isFollowing = (currentUserProfile.following || []).includes(u.id);
        const avatarDisplay = u.photoUrl 
          ? `<img src="${u.photoUrl}" style="width:100%; height:100%; object-fit:cover;">`
          : (u.avatarIcon || '👤');

        const followerCount = (u.followers || []).length;

        html += `
          <div class="user-card">
            <div class="user-card-avatar">${avatarDisplay}</div>
            <strong style="font-size: 0.95rem;">@${u.username}</strong>
            <small style="color: var(--text-secondary); margin-bottom: 0.4rem;">${u.favoriteGenre || 'Lettore'} • ${followerCount} follower</small>
            
            <button class="btn-follow ${isFollowing ? 'following' : ''}" onclick="toggleFollowUser('${u.id}')">
              ${isFollowing ? '✓ Segui già' : '+ Segui'}
            </button>

            <button class="btn-primary" style="width:100%; margin-top:0.4rem; font-size:0.8rem; padding: 4px;" onclick="openPrivateChatWith('${u.id}', '${u.username}')">
              💬 Messaggio Privato
            </button>
          </div>
        `;
      }
    });

    container.innerHTML = html || '<p style="color:var(--text-secondary);">Nessun altro utente trovato.</p>';
  } catch (error) {
    console.error("Errore caricamento community:", error);
  }
}

// --- GESTIONE ACCOUNT & REALE LINK CAMBIO PASSWORD ---
function openAccountModal() {
  document.getElementById('user-dropdown').classList.remove('show');
  
  document.getElementById('profile-username').value = currentUserProfile.username || '';
  document.getElementById('profile-email').value = currentUserProfile.email || '';
  document.getElementById('profile-age').value = currentUserProfile.age || '';
  document.getElementById('profile-favorite-genre').value = currentUserProfile.favoriteGenre || '';
  document.getElementById('profile-favorite-author').value = currentUserProfile.favoriteAuthor || '';
  document.getElementById('profile-bio').value = currentUserProfile.bio || '';
  document.getElementById('profile-photo-url').value = currentUserProfile.photoUrl || '';

  selectedAvatarIcon = currentUserProfile.avatarIcon || '👤';
  updateAvatarPreview();

  document.getElementById('account-modal').style.display = 'flex';
}

function closeAccountModal() {
  document.getElementById('account-modal').style.display = 'none';
}

function selectAvatar(emoji) {
  selectedAvatarIcon = emoji;
  document.getElementById('profile-photo-url').value = '';
  updateAvatarPreview();
}

function previewPhotoUrl(url) {
  if (url.trim() !== '') selectedAvatarIcon = null;
  updateAvatarPreview();
}

function updateAvatarPreview() {
  const container = document.getElementById('profile-avatar-preview');
  const photoUrl = document.getElementById('profile-photo-url').value.trim();

  if (photoUrl) {
    container.innerHTML = `<img src="${photoUrl}" style="width:100%; height:100%; object-fit:cover;" onError="this.onerror=null; this.parentElement.innerHTML='👤';">`;
  } else {
    container.innerHTML = selectedAvatarIcon || '👤';
  }
}

function updateHeaderUserBadge() {
  const avatarBadge = document.getElementById('user-avatar-badge');
  if (currentUserProfile.photoUrl) {
    avatarBadge.innerHTML = `<img src="${currentUserProfile.photoUrl}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">`;
  } else {
    avatarBadge.textContent = currentUserProfile.avatarIcon || '👤';
  }
}

async function saveProfileChanges(e) {
  e.preventDefault();
  
  const age = document.getElementById('profile-age').value;
  const favoriteGenre = document.getElementById('profile-favorite-genre').value.trim();
  const favoriteAuthor = document.getElementById('profile-favorite-author').value.trim();
  const bio = document.getElementById('profile-bio').value.trim();
  const photoUrl = document.getElementById('profile-photo-url').value.trim();

  try {
    const updatedData = {
      age: age ? parseInt(age) : null,
      favoriteGenre: favoriteGenre,
      favoriteAuthor: favoriteAuthor,
      bio: bio,
      photoUrl: photoUrl,
      avatarIcon: selectedAvatarIcon
    };

    await db.collection('profiles').doc(currentUserProfile.id).update(updatedData);
    currentUserProfile = { ...currentUserProfile, ...updatedData };
    
    updateHeaderUserBadge();
    alert("✅ Profilo aggiornato con successo!");
    closeAccountModal();
  } catch (error) {
    alert("Errore salvataggio: " + error.message);
  }
}

// INVIO LINK DI RIPRISTINO PASSWORD UFFICIALE FIREBASE
async function sendPasswordResetFromAccount() {
  try {
    await auth.sendPasswordResetEmail(currentUserProfile.email);
    alert(`📧 Abbiamo inviato un'email ufficiale a: ${currentUserProfile.email}\n\nAll'interno troverai il link per reimpostare la password. Se vuoi mantenere la tua password attuale, è sufficiente ignorare il messaggio ricevuto!`);
  } catch (error) {
    alert("Errore nell'invio della mail: " + error.message);
  }
}

async function sendPasswordReset() {
  const email = document.getElementById('reset-email-input').value.trim();
  if (!email) {
    alert("Inserisci un'email valida.");
    return;
  }
  try {
    await auth.sendPasswordResetEmail(email);
    alert(`📧 Mail inviata a: ${email}\n\nClicca sul link ricevuto per reimpostare la password oppure ignora la mail per mantenere la tua password attuale.`);
    closeForgotPasswordModal();
  } catch (error) {
    alert("Errore: " + error.message);
  }
}

// --- AUTHENTICATION ---
function toggleAuthMode(e) {
  e.preventDefault();
  isRegisterMode = !isRegisterMode;
  
  document.getElementById('auth-title').textContent = isRegisterMode ? '📝 Registrati a LoveMyLibrary' : '🔐 Accedi a LoveMyLibrary';
  document.getElementById('auth-submit-btn').textContent = isRegisterMode ? 'Crea Account' : 'Accedi';
  document.getElementById('auth-toggle-link').textContent = isRegisterMode ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati';
  document.getElementById('username-field-group').style.display = isRegisterMode ? 'block' : 'none';
  document.getElementById('nickname-suggestions').innerHTML = '';
}

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

    const usernameQuery = await db.collection('profiles').where('username', '==', username).get();
    if (!usernameQuery.empty) {
      generateNicknameSuggestions(username);
      return;
    }

    try {
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;

      await db.collection('profiles').doc(user.uid).set({
        id: user.uid,
        username: username,
        email: email,
        avatarIcon: '📚',
        followers: [],
        following: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      alert("🎉 Account creato con successo!");
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

function generateNicknameSuggestions(baseName) {
  const suggestionsBox = document.getElementById('nickname-suggestions');
  const randNum = Math.floor(100 + Math.random() * 900);
  
  const alt1 = `${baseName}_${randNum}`;
  const alt2 = `${baseName}Book`;

  suggestionsBox.innerHTML = `
    ⚠️ Il nickname <strong>"${baseName}"</strong> è occupato.<br>
    Disponibili: 
    <a href="#" onclick="applySuggestion('${alt1}')" style="color:var(--accent-lilac);">${alt1}</a> | 
    <a href="#" onclick="applySuggestion('${alt2}')" style="color:var(--accent-lilac);">${alt2}</a>
  `;
}

function applySuggestion(suggestedName) {
  document.getElementById('auth-username').value = suggestedName;
  document.getElementById('nickname-suggestions').innerHTML = '✅ Nickname selezionato!';
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
  currentUserProfile = null;
  showAuthScreen();
}

// --- LIBRI & LIBRERIA 3D ---
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

// LIBRERIA 3D (THREE.JS)
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
