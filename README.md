# 👑 Raja Rani — Traditional Indian School Game (Online, 4–10 players)

The classic **Raja-Rani / Mantri-Chor-Sipahi** slip game — friends in different places can now play together with a room code.

- **Frontend (Netlify):** `frontend/` — pure static (HTML/CSS/JS + Socket.IO CDN). No build step.
- **Backend (Render):** `backend/` — Node.js + Express + Socket.IO. Rooms, secret slips, scoring, timer.
- **Offline:** `🤖 Practice (bots)` runs without a server — same rules with 3 bots.

## 🎴 Rules (school classic + 4–10 extension)

| Players | Slips in play |
|---|---|
| 4 | Raja 1000, Rani 800, **Sipahi 500 (guesser)**, Chor 0 |
| 5 | Raja 1000, Rani 800, **Mantri 700 (guesser)**, Senapati 600, Chor 0 |
| 6 | Raja 1000, Rani 800, **Mantri 700**, Senapati 600, Sipahi 500, Chor 0 |
| 7 | + Kotwal 400 |
| 8 | + Praja 300 |
| 9 | + Villager 200 |
| 10 | Raja 1000, Rani 800, Mantri 700, Senapati 600, Sipahi 500, Kotwal 400, Praja 300, Villager 200, Sahayak 100, Chor 0 |

How each round works:
1. Everyone gets a secret slip. The 👑 **Raja** reveals himself and calls *"Who is my Minister?"*
2. The 🔍 **Mantri** (Sipahi/Police with 4 players) steps forward and picks a suspect (60 sec timer).
3. ✅ Correct → Mantri keeps his points, Chor gets 0. ❌ Wrong → Mantri gets 0, and the **Chor steals the Mantri's points**.
4. Fixed roles (Rani, Senapati…) always keep their points.
5. After N rounds the highest total wins 🏆 **Raja of Rajas**.

## 🚀 Live links

- Game: https://raja-rani-game.netlify.app
- Backend health: https://raja-rani-server-8kjo.onrender.com/health

## 🖥️ Local test

```powershell
cd backend; npm install; npm start
# browser: open frontend/index.html, Server URL: http://localhost:3001
```
