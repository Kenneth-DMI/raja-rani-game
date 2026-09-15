# 👑 Raja Rani — Traditional Indian School Game (Online, 4–10 players)

Wahi classic **Raja-Rani / Mantri-Chor-Sipahi** chit game — ab dost alag-alag jagah se khel sakte hain, room code se.

- **Frontend (Netlify):** `frontend/` — pure static (HTML/CSS/JS + Socket.IO CDN). No build step.
- **Backend (Render):** `backend/` — Node.js + Express + Socket.IO. Rooms, secret chits, scoring, timer.
- **Offline:** `🤖 Practice (bots)` bina server ke chalta hai — demo/testing ke liye.

## 🎴 Rules (school classic + 4–10 extension)

| Players | Chits in play |
|---|---|
| 4 | Raja 1000, Rani 800, **Sipahi 500 (guesser)**, Chor 0 |
| 5 | Raja 1000, Rani 800, **Mantri 700 (guesser)**, Sipahi 500, Chor 0 |
| 6 | Raja 1000, Rani 800, **Mantri 700**, Senapati 600, Sipahi 500, Chor 0 |
| 7 | + Praja 300 |
| 8 | + Kotwal 400, Praja 300 |
| 9 | + Villager 200 |
| 10 | Raja 1000, Rani 800, Mantri 700, Senapati 600, Sipahi 500, Kotwal 400, Praja 300, Villager 200, Sahayak 100, Chor 0 |

## 🚀 Live links

- Game: https://raja-rani-game.netlify.app
- Backend health: `https://<your-render-service>.onrender.com/health`

## 🖥️ Local test

```powershell
cd backend; npm install; npm start
# browser: open frontend/index.html, Server URL: http://localhost:3001
```
