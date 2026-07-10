// =======================================================
// 獅子、町を行く
// =======================================================

const SG_W = 360;
const SG_H = 220;
const SG_GROUND = 168;
const SG_LION_X = 72;
const SG_GRAVITY = 0.58;
const SG_JUMP_VY = -11.5;

let sgGame = null;
let sgRankingLoaded = false;

// -------------------------------------------------------
// Entry
// -------------------------------------------------------

function openGameCard() {
    document.getElementById("gameCard").classList.add("active");
    if (!sgGame) {
        const canvas = document.getElementById("sgCanvas");
        setupGameCanvas(canvas);
    }
    showGameTab("game");
}

function setupGameCanvas(canvas) {
    canvas.width = SG_W;
    canvas.height = SG_H;
    sgGame = new ShishiGame(canvas, onGameOver);
    sgGame.drawIdle();

    canvas.addEventListener("click", () => sgHandleInput());
    canvas.addEventListener("touchstart", e => { e.preventDefault(); sgHandleInput(); }, { passive: false });
}

function sgHandleInput() {
    if (!sgGame) return;
    if (sgGame.dead || !sgGame.started) {
        sgGame.start();
    } else {
        sgGame.jump();
    }
}

document.addEventListener("keydown", e => {
    const card = document.getElementById("gameCard");
    if (!card || !card.classList.contains("active")) return;
    if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        sgHandleInput();
    }
});

async function onGameOver(score, bites) {
    const res = await callGasApi({ action: "saveGameScore", userId, score });
    if (res?.success && res.isHighScore) {
        document.getElementById("sgHighScoreBadge").style.display = "inline";
    } else {
        document.getElementById("sgHighScoreBadge").style.display = "none";
    }
    document.getElementById("sgFinalScore").textContent = score;
    document.getElementById("sgFinalBites").textContent = bites;
    document.getElementById("sgResultOverlay").style.display = "flex";
    sgRankingLoaded = false;
}

function sgRetry() {
    document.getElementById("sgResultOverlay").style.display = "none";
    if (sgGame) sgGame.start();
}

function showGameTab(tab) {
    document.getElementById("sgGamePane").style.display = tab === "game" ? "" : "none";
    document.getElementById("sgRankingPane").style.display = tab === "ranking" ? "" : "none";
    document.getElementById("sgTabGame").classList.toggle("active", tab === "game");
    document.getElementById("sgTabRanking").classList.toggle("active", tab === "ranking");
    if (tab === "ranking" && !sgRankingLoaded) loadGameRanking();
}

async function loadGameRanking() {
    const list = document.getElementById("sgRankingList");
    list.innerHTML = '<p class="sg-rank-loading">読み込み中…</p>';
    const res = await callGasApi({ action: "getGameRanking" });
    sgRankingLoaded = true;
    if (!res?.success) { list.innerHTML = '<p class="sg-rank-loading">取得失敗</p>'; return; }
    const ranking = res.ranking || [];
    if (!ranking.length) { list.innerHTML = '<p class="sg-rank-loading">まだ記録なし</p>'; return; }
    list.innerHTML = ranking.map((r, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
        const isMe = String(r.user_id) === String(userId);
        return `
        <div class="sg-rank-row${isMe ? " sg-rank-me" : ""}">
            <span class="sg-rank-pos">${medal}</span>
            <span class="sg-rank-name">${escHtml(r.user_name)}</span>
            <span class="sg-rank-score">${r.score.toLocaleString()}pt</span>
        </div>`;
    }).join("");
}

// -------------------------------------------------------
// Game Class
// -------------------------------------------------------

class ShishiGame {
    constructor(canvas, onOver) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.onOver = onOver;
        this.raf = null;
        this.dead = false;
        this.started = false;
        this._buildings = this._genBuildings();
        this._lionImg = new Image();
        this._lionImg.src = "images/game/shishi_sprite.png";
        this._init();
    }

    _init() {
        this.score = 0;
        this.bites = 0;
        this.dist = 0;
        this.speed = 4;
        this.frame = 0;
        this.dead = false;
        this.started = false;
        this.lion = { y: SG_GROUND, vy: 0, onGround: true };
        this.objects = [];
        this.particles = [];
        this.spawnCD = 80;
        this.bgX = 0;
    }

    _genBuildings() {
        const arr = [];
        let x = 0;
        while (x < SG_W * 3) {
            const w = 38 + Math.random() * 34;
            arr.push({ x, w, h: 36 + Math.random() * 55, hue: 200 + Math.random() * 40, light: 48 + Math.random() * 20 });
            x += w + 8 + Math.random() * 20;
        }
        return arr;
    }

    start() {
        this._init();
        if (this.raf) cancelAnimationFrame(this.raf);
        const loop = () => {
            this.update();
            this.draw();
            if (!this.dead) this.raf = requestAnimationFrame(loop);
        };
        this.started = true;
        loop();
    }

    drawIdle() {
        this._init();
        this.draw();
    }

    jump() {
        if (this.lion.onGround && !this.dead) {
            this.lion.vy = SG_JUMP_VY;
            this.lion.onGround = false;
        }
    }

    update() {
        this.frame++;
        this.dist++;
        this.speed = 4 + Math.floor(this.dist / 700) * 0.5;
        this.score = Math.floor(this.dist / 8) + this.bites * 100;

        // Lion physics
        this.lion.vy += SG_GRAVITY;
        this.lion.y += this.lion.vy;
        if (this.lion.y >= SG_GROUND) {
            this.lion.y = SG_GROUND;
            this.lion.vy = 0;
            this.lion.onGround = true;
        }

        // Background scroll (world moves left as lion advances)
        this.bgX += this.speed * 0.28;

        // Spawn
        this.spawnCD--;
        if (this.spawnCD <= 0) {
            const isChild = Math.random() < 0.38;
            this.objects.push({ type: isChild ? "child" : "car", x: SG_W + 20, scored: false, hit: false });
            this.spawnCD = 52 + Math.random() * 72;
        }

        // Objects
        for (const obj of this.objects) {
            obj.x -= this.speed;
            if (obj.type === "child" && !obj.scored) {
                if (Math.abs(obj.x - SG_LION_X) < 22 && this.lion.onGround) {
                    obj.scored = true;
                    this.bites++;
                    for (let i = 0; i < 8; i++) {
                        this.particles.push({
                            x: SG_LION_X + 18, y: SG_GROUND - 28,
                            vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 4 - 1,
                            life: 28, color: i % 2 === 0 ? "#FFD700" : "#FF6B6B"
                        });
                    }
                }
            }
            if (obj.type === "car" && !obj.hit) {
                const lx = SG_LION_X - 16, ly = this.lion.y - 42;
                const ox = obj.x - 22, oy = SG_GROUND - 34;
                if (lx < ox + 44 && lx + 32 > ox && ly < oy + 34 && ly + 42 > oy) {
                    obj.hit = true;
                    this.dead = true;
                    this.onOver && this.onOver(this.score, this.bites);
                    return;
                }
            }
        }

        // Particles
        this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life--; });
        this.particles = this.particles.filter(p => p.life > 0);
        this.objects = this.objects.filter(o => o.x > -80);
    }

    draw() {
        const ctx = this.ctx;
        const W = SG_W, H = SG_H;
        const f = this.frame;

        // Sky
        const sky = ctx.createLinearGradient(0, 0, 0, SG_GROUND);
        sky.addColorStop(0, "#6AADDA");
        sky.addColorStop(1, "#B8DCF0");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // Buildings
        const period = SG_W * 3;
        const bx = ((this.bgX % period) + period) % period;
        for (const b of this._buildings) {
            const dx = ((b.x - bx) % period + period) % period;
            if (dx > W + 80) continue;
            ctx.fillStyle = `hsl(${b.hue},18%,${b.light}%)`;
            ctx.fillRect(dx, SG_GROUND - b.h, b.w, b.h);
            ctx.fillStyle = "rgba(255,255,180,0.55)";
            for (let wy = SG_GROUND - b.h + 7; wy < SG_GROUND - 7; wy += 14) {
                for (let wx = dx + 5; wx < dx + b.w - 5; wx += 11) {
                    ctx.fillRect(wx, wy, 6, 7);
                }
            }
        }

        // Ground
        ctx.fillStyle = "#A0876A";
        ctx.fillRect(0, SG_GROUND + 2, W, H - SG_GROUND - 2);
        ctx.fillStyle = "#7A6248";
        ctx.fillRect(0, SG_GROUND, W, 3);

        // Road dashes
        ctx.fillStyle = "#8A7460";
        const dashOffset = (f * this.speed) % 50;
        for (let x = -dashOffset; x < W; x += 50) {
            ctx.fillRect(x, SG_GROUND + 8, 28, 3);
        }

        // Objects
        ctx.font = "28px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        for (const obj of this.objects) {
            if (obj.type === "child") {
                ctx.fillText(obj.scored ? "😵" : (Math.floor(f / 10) % 2 === 0 ? "🧒" : "👦"), obj.x, SG_GROUND + 4);
            } else {
                ctx.fillText("🚗", obj.x, SG_GROUND + 4);
            }
        }

        // Particles
        ctx.textBaseline = "alphabetic";
        for (const p of this.particles) {
            ctx.globalAlpha = p.life / 28;
            ctx.fillStyle = p.color;
            ctx.font = "bold 12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("✦", p.x, p.y);
        }
        ctx.globalAlpha = 1;

        // Lion
        this._drawLion(ctx, SG_LION_X, this.lion.y, f);

        // HUD
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`スコア: ${this.score}`, 8, 8);
        ctx.fillText(`噛み: ${this.bites}回`, 8, 26);
        const lv = Math.floor(this.dist / 700) + 1;
        ctx.textAlign = "right";
        ctx.fillText(`Lv.${lv}`, W - 8, 8);

        // Idle prompt
        if (!this.started) {
            ctx.fillStyle = "rgba(0,0,0,0.38)";
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = "white";
            ctx.font = "bold 17px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("タップ / スペースでスタート", W / 2, H / 2 + 10);
            ctx.font = "13px sans-serif";
            ctx.fillText("🚗 障害物を跳び越えよう！　🧒 子供の頭を噛もう！", W / 2, H / 2 + 36);
        }
    }

    // 実写の獅子舞画像を使用（頭が右＝進行方向）
    _drawLion(ctx, x, y, f) {
        ctx.save();
        ctx.translate(x, y);
        const leg = Math.floor(f / 7) % 2;
        const bob = Math.sin(f / 6) * 1.5; // 胴体の上下の揺れ

        // ---- 脚（画像の下に少しだけ覗かせる）----
        const legSets = leg === 0
            ? [[-14, 6, 10], [2, 6, 7]]
            : [[-12, 6, 7], [4, 6, 10]];
        legSets.forEach(([lx, lw, lh]) => {
            ctx.fillStyle = "#222";
            ctx.fillRect(lx, -lh, lw, lh);
            ctx.fillStyle = "#f4f4f0";
            ctx.fillRect(lx, -3, lw, 3);
        });

        ctx.save();
        ctx.translate(0, bob);

        const img = this._lionImg;
        if (img && img.complete && img.naturalWidth > 0) {
            const drawW = 110;
            const drawH = drawW * (img.naturalHeight / img.naturalWidth);
            // 画像は胴体が左・頭が右向きなので、原点(脚の付け根)を胴体後方に合わせる
            ctx.drawImage(img, -drawW + 28, -drawH + 8, drawW, drawH);
        }

        ctx.restore();
        ctx.restore();
    }
}
