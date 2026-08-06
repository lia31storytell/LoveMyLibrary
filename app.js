// Inizializzazione Supabase per Vercel
const SUPABASE_URL = "https://xyzcompany.supabase.co"; // Sostituire con le proprie chiavi Supabase se abilitato
const SUPABASE_KEY = "public-anon-key";
let supabase = null;

if (window.supabase) {
  try { supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e){}
}

let activeRoom = 'global';
let currentUser = 'Lettore_' + Math.floor(Math.random() * 1000);
let currentRendition = null;
let library3DInstance;

// Toggle Tema Chiaro / Notturno
document.getElementById('theme-toggle').addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nextTheme);
  document.getElementById('theme-toggle').textContent = nextTheme === 'dark' ? '☀️ Chiaro' : '🌙 Notturno';
});

// 1. RICERCA GLOBALE (Google Books API + Vercel Serverless Function)
async function handleGlobalSearch() {
  const query = document.getElementById('global-search-input').value.trim();
  const container = document.getElementById('search-results-container');
  if (!query) return;

  container.innerHTML = '<p>Ricerca in corso...</p>';

  // Ricerca Utenti da Serverless Vercel
  let localData = { users: [] };
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    localData = await res.json();
  } catch(e) {}

  // Ricerca Google Books
  let googleItems = [];
  try {
    const gRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=4`);
    const gData = await gRes.json();
    if (gData.items) googleItems = gData.items;
  } catch(e) {}

  container.innerHTML = '<h3>Risultati:</h3>';

  if (localData.users && localData.users.length > 0) {
    localData.users.forEach(u => {
      container.innerHTML += `
        <div style="padding: 8px; border: 1px solid var(--border-color); margin-bottom: 5px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span>👤 <strong>@${u.username}</strong></span>
          <div>
            <button class="btn-primary" onclick="alert('Ora segui @${u.username}')">Segui</button>
            <button class="btn-pink" onclick="openDirectMessage('${u.username}')">Messaggio Privato</button>
          </div>
        </div>
      `;
    });
  }

  googleItems.forEach(item => {
    const info = item.volumeInfo;
    const title = (info.title || '').replace(/'/g, "\\'");
    const authors = info.authors ? info.authors.join(', ').replace(/'/g, "\\'") : 'Sconosciuto';
    const isbn = info.industryIdentifiers ? info.industryIdentifiers[0].identifier : '';
    const pages = info.pageCount || '';
    const year = info.publishedDate ? info.publishedDate.substring(0, 4) : '';
    const cover = info.imageLinks ? info.imageLinks.thumbnail : '';

    container.innerHTML += `
      <div style="padding: 10px; border: 1px solid var(--border-color); margin-bottom: 8px; border-radius: 8px; display: flex; gap: 10px; align-items: center;">
        ${cover ? `<img src="${cover}" style="height:50px;">` : ''}
        <div style="flex: 1;">
          <strong>📖 ${title}</strong><br>
          <small>${authors} (${year})</small>
        </div>
        <button class="btn-primary" onclick="autofillBook('${title}', '${authors}', '${isbn}', '${pages}', '${year}', '${cover}')">
          Compila Form
        </button>
      </div>
    `;
  });
}

function autofillBook(title, author, isbn, pages, year, cover) {
  document.getElementById('book-title').value = title;
  document.getElementById('book-author').value = author;
  document.getElementById('book-isbn').value = isbn;
  document.getElementById('book-pages').value = pages;
  document.getElementById('book-year').value = year;
  document.getElementById('book-cover-url').value = cover;
  alert('Form compilato con i dati trovati!');
}

// 2. AGGIUNTA LIBRO
function submitNewBook(e) {
  e.preventDefault();
  const title = document.getElementById('book-title').value;
  alert(`Libro "${title}" aggiunto con successo alla tua libreria!`);
  document.getElementById('add-book-form').reset();
}

// 3. LETTORE E-BOOK (ePUB.js)
function openEbookReader(epubUrl, title) {
  if (!epubUrl) {
    alert("Nessun link e-book (.epub) fornito per questo libro.");
    return;
  }
  document.getElementById('ebook-reader-modal').style.display = 'flex';
  document.getElementById('reader-title').textContent = title;

  const book = ePub(epubUrl);
  currentRendition = book.renderTo("viewer", { width: "100%", height: "100%" });
  currentRendition.display();
}

function nextEbookPage() { if(currentRendition) currentRendition.next(); }
function prevEbookPage() { if(currentRendition) currentRendition.prev(); }
function closeEbookReader() { document.getElementById('ebook-reader-modal').style.display = 'none'; }

// 4. CHAT SYSTEM
function switchChatRoom(roomId, roomTitle) {
  activeRoom = roomId;
  document.getElementById('current-chat-title').textContent = `💬 ${roomTitle}`;
  document.getElementById('chat-messages-box').innerHTML = `<p><em>Sei entrato in: ${roomTitle}</em></p>`;
}

function toggleAnonMode(checkbox) {
  const display = document.getElementById('sender-display');
  display.textContent = checkbox.checked ? '(Stai inviando come: Anonimo)' : `(Nome: ${currentUser})`;
}

function sendChatMessage() {
  const input = document.getElementById('chat-input-text');
  const isAnon = document.getElementById('anon-check').checked;
  const text = input.value.trim();

  if (text !== '') {
    const sender = isAnon ? 'Anonimo' : currentUser;
    appendChatMessage(sender, text, new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
    input.value = '';
  }
}

function appendChatMessage(sender, text, time) {
  const box = document.getElementById('chat-messages-box');
  const msg = document.createElement('div');
  msg.style = 'margin-bottom: 8px; padding: 6px 10px; background: var(--bg-primary); border-radius: 6px;';
  msg.innerHTML = `<small style="color:var(--accent-lilac);">${time}</small> <strong>${sender}:</strong> ${text}`;
  box.appendChild(msg);
  box.scrollTop = box.scrollHeight;
}

function openDirectMessage(username) {
  switchChatRoom(`dm_${username}`, `Messaggio Privato con @${username}`);
}

function createGroupModal() {
  const name = prompt("Nome del nuovo gruppo:");
  if (name) switchChatRoom(`group_${Date.now()}`, `Gruppo: ${name}`);
}

// 5. LIBRERIA 3D INTERATTIVA (Three.js Drag & Drop e Raycaster)
class InteractiveLibrary3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.shelvesCount = 3;
    this.shelfHeight = 2.2;
    this.books = [];
    this.init();
    this.setupInteractions();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x18181b);

    this.camera = new THREE.PerspectiveCamera(55, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 3, 8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(this.renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xc084fc, 1.2, 20);
    pointLight.position.set(2, 6, 6);
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
    this.books = [];

    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x3f2e56, roughness: 0.5 });
    const shelfGeo = new THREE.BoxGeometry(5, 0.12, 1.2);

    for (let i = 0; i < this.shelvesCount; i++) {
      const shelf = new THREE.Mesh(shelfGeo, shelfMat);
      shelf.position.y = i * this.shelfHeight;
      this.shelvesGroup.add(shelf);
      this.populateShelfWithBooks(shelf.position.y, i);
    }
  }

  populateShelfWithBooks(shelfY, shelfIndex) {
    const bookGeo = new THREE.BoxGeometry(0.25, 0.9, 0.7);
    const colors = [0xc084fc, 0xf472b6, 0x38bdf8, 0xfacc15];

    for (let x = -2; x <= 2; x += 0.5) {
      const mat = new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)] });
      const book = new THREE.Mesh(bookGeo, mat);
      
      book.position.set(x, shelfY + 0.51, 0);
      const bookId = Math.floor(Math.random() * 1000);
      book.userData = { id: bookId, title: `Libro #${bookId}` };
      
      this.shelvesGroup.add(book);
      this.books.push(book);
    }
  }

  addShelf() {
    this.shelvesCount++;
    this.buildShelves();
    this.camera.position.y = (this.shelvesCount * this.shelfHeight) / 2;
  }

  setupInteractions() {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedBook = null;
    let isDragging = false;
    const canvas = this.renderer.domElement;

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / canvas.clientHeight) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.books);

      if (intersects.length > 0) {
        const book = intersects[0].object;
        switchChatRoom(`book_${book.userData.id}`, `Chat Libro: ${book.userData.title}`);
      }
    });

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / canvas.clientHeight) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.books);

      if (intersects.length > 0) {
        isDragging = true;
        this.selectedBook = intersects[0].object;
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (isDragging && this.selectedBook) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = ((e.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
        this.selectedBook.position.x = mouseX * 2.2;
      }
    });

    canvas.addEventListener('mouseup', () => { isDragging = false; this.selectedBook = null; });
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.renderer.render(this.scene, this.camera);
  }
}

// Inizializzazione
window.addEventListener('DOMContentLoaded', () => {
  library3DInstance = new InteractiveLibrary3D('canvas-3d-container');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});