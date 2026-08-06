// --- STATO DELL'APPLICAZIONE ---
let currentUser = localStorage.getItem('mylibrary_user') || null;
let isRegisterMode = false;
let userBooks = JSON.parse(localStorage.getItem('mylibrary_books') || '[]');
let library3DInstance = null;
let deferredPrompt = null;

// --- GESTIONE PWA (INSTALLAZIONE APP) ---
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) {
    installBtn.style.display = 'block';
    installBtn.addEventListener('click', () => {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => {
        installBtn.style.display = 'none';
        deferredPrompt = null;
      });
    });
  }
});

// --- INIZIALIZZAZIONE ---
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAuthState();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});

// --- TEMA CHIARO / SCURO ---
function initTheme() {
  const toggleBtn = document.getElementById('theme-toggle');
  toggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    toggleBtn.textContent = nextTheme === 'dark' ? '☀️ Chiaro' : '🌙 Notturno';
  });
}

// --- AUTENTICAZIONE (LOGIN / REGISTRAZIONE) ---
function toggleAuthMode(e) {
  e.preventDefault();
  isRegisterMode = !isRegisterMode;
  document.getElementById('auth-title').textContent = isRegisterMode ? '📝 Registrati a LoveMyLibrary' : '🔐 Accedi a LoveMyLibrary';
  document.getElementById('auth-submit-btn').textContent = isRegisterMode ? 'Registrati' : 'Accedi';
  document.getElementById('auth-toggle-text').textContent = isRegisterMode ? 'Hai già un account?' : 'Non hai un account?';
  document.getElementById('auth-toggle-link').textContent = isRegisterMode ? 'Accedi qui' : 'Registrati qui';
}

function handleAuth(e) {
  e.preventDefault();
  const username = document.getElementById('auth-username').value.trim();
  if (!username) return;

  currentUser = username;
  localStorage.setItem('mylibrary_user', currentUser);
  checkAuthState();
}

function logout() {
  currentUser = null;
  localStorage.removeItem('mylibrary_user');
  checkAuthState();
}

function checkAuthState() {
  const authScreen = document.getElementById('auth-screen');
  const appContent = document.getElementById('app-content');
  const userBadge = document.getElementById('user-badge');
  const logoutBtn = document.getElementById('logout-btn');

  if (currentUser) {
    authScreen.style.display = 'none';
    appContent.style.display = 'block';
    userBadge.textContent = `👤 ${currentUser}`;
    logoutBtn.style.display = 'block';

    // Inizializza o aggiorna la Libreria 3D e i libri
    renderBooksList();
    if (!library3DInstance) {
      library3DInstance = new InteractiveLibrary3D('canvas-3d-container');
    } else {
      library3DInstance.buildShelves();
    }
  } else {
    authScreen.style.display = 'block';
    appContent.style.display = 'none';
    userBadge.textContent = '';
    logoutBtn.style.display = 'none';
  }
}

// --- GESTIONE LIBRI ---
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
  localStorage.setItem('mylibrary_books', JSON.stringify(userBooks));

  document.getElementById('add-book-form').reset();
  alert(`🎉 "${title}" salvato con successo!`);

  renderBooksList();
  if (library3DInstance) library3DInstance.buildShelves();
}

function renderBooksList() {
  const container = document.getElementById('my-books-list');
  const countBadge = document.getElementById('books-count-badge');
  countBadge.textContent = `${userBooks.length} Libri`;

  if (userBooks.length === 0) {
    container.innerHTML = '<p style="grid-column: 1/-1; color: var(--text-secondary);">Nessun libro salvato. Aggiungine uno usando il modulo sopra!</p>';
    return;
  }

  container.innerHTML = userBooks.map(b => `
    <div class="card" style="padding: 1rem; text-align: center; margin-bottom: 0;">
      <img src="${b.cover}" style="height: 120px; object-fit: cover; border-radius: 6px; margin-bottom: 0.5rem;" onError="this.src='https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=300'">
      <h4 style="margin: 0.3rem 0; font-size: 1rem;">${b.title}</h4>
      <small style="color: var(--text-secondary);">${b.author}</small><br>
      <div style="margin-top: 0.5rem; font-size: 0.8rem;">
        ${'⭐'.repeat(b.rating)} ${'🌶️'.repeat(b.spicy)}
      </div>
      <button class="btn-primary" style="margin-top: 0.5rem; width: 100%; font-size: 0.8rem;" onclick="deleteBook(${b.id})">Elimina</button>
    </div>
  `).join('');
}

function deleteBook(id) {
  userBooks = userBooks.filter(b => b.id !== id);
  localStorage.setItem('mylibrary_books', JSON.stringify(userBooks));
  renderBooksList();
  if (library3DInstance) library3DInstance.buildShelves();
}

// --- RICERCA GOOGLE BOOKS ---
async function handleGlobalSearch() {
  const query = document.getElementById('global-search-input').value.trim();
  const container = document.getElementById('search-results-container');
  if (!query) return;

  container.innerHTML = '<p>Ricerca in corso...</p>';

  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3`);
    const data = await res.json();
    
    container.innerHTML = '';
    if (data.items) {
      data.items.forEach(item => {
        const info = item.volumeInfo;
        const title = (info.title || '').replace(/'/g, "\\'");
        const author = info.authors ? info.authors[0].replace(/'/g, "\\'") : 'Sconosciuto';
        const cover = info.imageLinks ? info.imageLinks.thumbnail : '';

        container.innerHTML += `
          <div style="padding: 8px; border: 1px solid var(--border-color); margin-bottom: 8px; border-radius: 8px; display: flex; gap: 10px; align-items: center;">
            ${cover ? `<img src="${cover}" style="height:40px;">` : ''}
            <div style="flex:1;">
              <strong>${title}</strong><br><small>${author}</small>
            </div>
            <button class="btn-pink" onclick="autofill('${title}', '${author}', '${cover}')">Importa</button>
          </div>
        `;
      });
    } else {
      container.innerHTML = '<p>Nessun libro trovato.</p>';
    }
  } catch(e) {
    container.innerHTML = '<p>Errore durante la ricerca.</p>';
  }
}

function autofill(title, author, cover) {
  document.getElementById('book-title').value = title;
  document.getElementById('book-author').value = author;
  document.getElementById('book-cover-url').value = cover;
  alert('Dati importati nel modulo!');
}

// --- CHAT ---
function sendChatMessage() {
  const input = document.getElementById('chat-input-text');
  const text = input.value.trim();
  if (!text) return;

  const box = document.getElementById('chat-messages-box');
  const msg = document.createElement('div');
  msg.style = 'margin-bottom: 6px; padding: 6px; background: var(--bg-primary); border-radius: 6px; font-size: 0.9rem;';
  msg.innerHTML = `<strong>${currentUser}:</strong> ${text}`;
  box.appendChild(msg);
  box.scrollTop = box.scrollHeight;
  input.value = '';
}

// --- LIBRERIA 3D REALE ---
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

    // Crea 2 scaffali
    [0, 2].forEach(y => {
      const shelf = new THREE.Mesh(shelfGeo, shelfMat);
      shelf.position.y = y;
      this.shelvesGroup.add(shelf);
    });

    // Disegna 1 libro 3D per ogni libro reale inserito dall'utente!
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