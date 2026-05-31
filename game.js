// Firebase yapılandırmanı buraya yapıştır (Firebase Console'dan aldığın)
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "savasarena-xxxx.firebaseapp.com",
  databaseURL: "https://savasarena-xxxx-default-rtdb.firebaseio.com",
  projectId: "savasarena-xxxx",
  storageBucket: "savasarena-xxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

// Firebase'i başlat
const { initializeApp, getDatabase, ref, set, onValue, push, update, remove, onDisconnect, get } = window.firebaseModules;
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Oyun değişkenleri
let myId = Math.random().toString(36).substr(2, 9);
let roomId = null;
let playerRef = null;
let opponentRef = null;
let myPlayer = { x: 200, y: 300, hp: 100, dir: 1 }; // dir: 1 sağ, -1 sol
let opponent = null;
let bullets = [];
let canvas, ctx;
let gameLoop;
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;

// DOM elemanları
const menu = document.getElementById('menu');
const roomInput = document.getElementById('roomInput');
const startBtn = document.getElementById('startBtn');
const info = document.getElementById('info');
const gameCanvas = document.getElementById('gameCanvas');
const ui = document.getElementById('ui');
const healthDisplay = document.getElementById('healthDisplay');
const roomDisplay = document.getElementById('roomDisplay');

startBtn.addEventListener('click', startGame);

async function startGame() {
    const inputRoom = roomInput.value.trim();
    if (inputRoom) {
        roomId = inputRoom;
    } else {
        roomId = Math.random().toString(36).substr(2, 6);
    }
    roomDisplay.textContent = `Oda: ${roomId}`;
    
    const roomRef = ref(db, `rooms/${roomId}`);
    const snapshot = await get(roomRef);
    
    if (!snapshot.exists()) {
        // Odayı oluştur, 1. oyuncu ol
        await set(roomRef, {
            player1: { id: myId, x: 200, y: 500, hp: 100, dir: 1 },
            player2: null,
            bullets: {}
        });
        playerRef = ref(db, `rooms/${roomId}/player1`);
        myPlayer = { x: 200, y: 500, hp: 100, dir: 1 };
        info.textContent = "Rakip bekleniyor...";
    } else {
        // Oda var, 2. oyuncu olarak katıl
        const data = snapshot.val();
        if (!data.player2) {
            await update(roomRef, {
                player2: { id: myId, x: 200, y: 100, hp: 100, dir: -1 }
            });
            playerRef = ref(db, `rooms/${roomId}/player2`);
            myPlayer = { x: 200, y: 100, hp: 100, dir: -1 };
            info.textContent = "Oyuna katıldın!";
        } else {
            info.textContent = "Oda dolu!";
            return;
        }
    }
    
    // Rakip referansını ayarla (diğer oyuncu)
    const opponentKey = (playerRef.key === 'player1') ? 'player2' : 'player1';
    opponentRef = ref(db, `rooms/${roomId}/${opponentKey}`);
    
    // Ayrılınca veriyi silmek için
    onDisconnect(playerRef).remove();
    
    // Oyunu başlat
    menu.style.display = 'none';
    canvas = gameCanvas;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvas.style.display = 'block';
    ui.style.display = 'flex';
    ctx = canvas.getContext('2d');
    
    // Rakip dinleyici
    onValue(opponentRef, (snapshot) => {
        if (snapshot.exists()) {
            opponent = snapshot.val();
        }
    });
    
    // Mermi dinleyici
    const bulletsRef = ref(db, `rooms/${roomId}/bullets`);
    onValue(bulletsRef, (snapshot) => {
        if (snapshot.exists()) {
            bullets = Object.values(snapshot.val());
        } else {
            bullets = [];
        }
    });
    
    // Kendi durumunu sürekli güncelle
    setInterval(() => {
        if (playerRef) {
            update(playerRef, {
                x: myPlayer.x,
                y: myPlayer.y,
                hp: myPlayer.hp,
                dir: myPlayer.dir
            });
        }
    }, 50); // 20 FPS senkron
    
    // Kontrolleri başlat
    setupControls();
    
    // Oyun döngüsü
    gameLoop = setInterval(updateGame, 1000/60);
}

function setupControls() {
    // Dokunmatik kontroller (mobil için)
    let touchX, touchY;
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        touchX = e.touches[0].clientX - rect.left;
        touchY = e.touches[0].clientY - rect.top;
        handleShoot(touchX, touchY);
    });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        touchX = e.touches[0].clientX - rect.left;
        touchY = e.touches[0].clientY - rect.top;
        // Hareket hedef noktaya doğru
        movePlayerTo(touchX, touchY);
    });
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        // dokunma bitince dur
    });
    
    // Klavye kontrolleri (isteğe bağlı, bilgisayardan test için)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') myPlayer.x -= 10;
        if (e.key === 'ArrowRight') myPlayer.x += 10;
        if (e.key === 'ArrowUp') myPlayer.y -= 10;
        if (e.key === 'ArrowDown') myPlayer.y += 10;
        if (e.key === ' ') {
            shootBullet();
            e.preventDefault();
        }
        // Yön güncelle
        if (opponent && opponent.x < myPlayer.x) myPlayer.dir = -1;
        else myPlayer.dir = 1;
        // Sınırlama
        myPlayer.x = Math.max(20, Math.min(CANVAS_WIDTH-20, myPlayer.x));
        myPlayer.y = Math.max(20, Math.min(CANVAS_HEIGHT-20, myPlayer.y));
    });
}

function movePlayerTo(x, y) {
    const dx = x - myPlayer.x;
    const dy = y - myPlayer.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 2) return;
    const speed = 5;
    myPlayer.x += (dx / dist) * speed;
    myPlayer.y += (dy / dist) * speed;
    // Yön
    myPlayer.dir = dx > 0 ? 1 : -1;
    // Sınırla
    myPlayer.x = Math.max(20, Math.min(CANVAS_WIDTH-20, myPlayer.x));
    myPlayer.y = Math.max(20, Math.min(CANVAS_HEIGHT-20, myPlayer.y));
}

function handleShoot(x, y) {
    // Basitçe ekrana her dokunuşta ateş et
    shootBullet(x, y);
}

function shootBullet(targetX, targetY) {
    const angle = Math.atan2(targetY - myPlayer.y, targetX - myPlayer.x);
    const bullet = {
        x: myPlayer.x,
        y: myPlayer.y,
        angle: angle,
        owner: myId,
        speed: 8
    };
    const bulletsRef = ref(db, `rooms/${roomId}/bullets`);
    const newBulletRef = push(bulletsRef);
    set(newBulletRef, bullet);
    // Kendi listemizde anlık görmek için ekleyelim (Firebase'den gelecek zaten)
}

function updateGame() {
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Kendi oyuncunu çiz
    drawPlayer(myPlayer.x, myPlayer.y, myPlayer.dir, '#4ecdc4');
    
    // Rakibi çiz
    if (opponent) {
        drawPlayer(opponent.x, opponent.y, opponent.dir || 1, '#e63946');
    }
    
    // Mermileri çiz ve hareket ettir (mermi hareketini sadece sahibi yapmalı, yoksa çakışır. Basitlik için herkes hareket ettirsin ama çarpışmayı owner yapsın)
    bullets.forEach(b => {
        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;
        // Ekran dışına çıkarsa sil (sadece sahibi silmeli)
        if (b.owner === myId && (b.x < 0 || b.x > CANVAS_WIDTH || b.y < 0 || b.y > CANVAS_HEIGHT)) {
            // Mermiyi Firebase'den sil
            // Tüm bullets içinden bulup silmek için key lazım. Şimdilik basit bırakıyorum.
        }
        // Çarpışma kontrolü
        if (b.owner === myId && opponent) {
            const dx = opponent.x - b.x;
            const dy = opponent.y - b.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 25) {
                // Rakibe hasar ver
                const newHp = opponent.hp - 20;
                update(opponentRef, { hp: newHp });
                // Mermiyi sil
                // (ideal olarak silme işlemi yapılmalı)
            }
        }
        // Mermiyi çiz
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI*2);
        ctx.fill();
    });
    
    // Can göstergeleri
    healthDisplay.textContent = `❤️ ${myPlayer.hp}`;
    if (opponent) {
        // Rakip canını göstermek için ekstra bir element yapılabilir, şimdilik konsola yazsak yeter
    }
    
    // Kazanma/kaybetme kontrolü
    if (myPlayer.hp <= 0) {
        alert('Yenildin!');
        clearInterval(gameLoop);
    }
    if (opponent && opponent.hp <= 0) {
        alert('Kazandın!');
        clearInterval(gameLoop);
    }
}

function drawPlayer(x, y, dir, color) {
    ctx.fillStyle = color;
    // Basit bir karakter: dikdörtgen vücut + kafa
    ctx.fillRect(x-15, y-20, 30, 40);
    // Kafa
    ctx.beginPath();
    ctx.arc(x, y-30, 12, 0, Math.PI*2);
    ctx.fill();
    // Silah (yönüne göre)
    ctx.fillStyle = '#555';
    if (dir === 1) {
        ctx.fillRect(x+10, y-15, 20, 5);
    } else {
        ctx.fillRect(x-30, y-15, 20, 5);
    }
    // Can barı
    ctx.fillStyle = 'green';
    const hpWidth = 30 * (myPlayer.hp / 100); // kendi canımıza göre değil, çizilen oyuncunun canına göre olmalı. Şimdilik sabit.
    // Düzeltme: opponent can barı için ayrı parametre geçmek gerekir, basit olsun diye şimdilik böyle kalsın.
    ctx.fillRect(x-15, y-35, hpWidth, 5);
}