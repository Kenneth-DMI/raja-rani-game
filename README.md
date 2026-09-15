# 👑 Raja Rani — Traditional Indian School Game (Online, 4–10 players)

The classic **Raja-Rani room game** — friends in different places can now play together with a room code.

- **Frontend (Netlify):** `frontend/` — pure static (HTML/CSS/JS + Socket.IO CDN). No build step.
- **Backend (Render):** `backend/` — Node.js + Express + Socket.IO. Rooms, secret slips, scoring, timer.
- **Offline:** `🤖 Practice (bots)` runs without a server — same rules with 3 bots.

## 🎴 Rules (school classic + 4–10 extension)

| Players | Slips in play |
|---|---|
| 4 | Raja 1000, Rani 800, **Police 500 (guesser)**, Thief 0 |
| 5 | Raja 1000, Rani 800, **Minister 700 (guesser)**, Commander 600, Thief 0 |
| 6 | Raja 1000, Rani 800, **Minister 700**, Commander 600, Soldier 500, Thief 0 |
| 7 | + Guard 400 |
| 8 | + Citizen 300 |
| 9 | + Villager 200 |
| 10 | Raja 1000, Rani 800, Minister 700, Commander 600, Soldier 500, Guard 400, Citizen 300, Villager 200, Helper 100, Thief 0 |

How each round works:
1. Everyone gets a secret slip. The 👑 **Raja** reveals himself and calls *"Who is my Minister?"* (or *"Police, catch the thief!"* with 4 players).
2. The 🔍 **Minister** (Police with 4 players) steps forward and picks a suspect (60 sec timer).
3. ✅ Correct → Minister keeps his points, Thief gets 0. ❌ Wrong → Minister gets 0, and the **Thief steals the Minister's points**.
4. Fixed roles (Rani, Commander…) always keep their points.
5. After N rounds the highest total wins 🏆 **Raja of Rajas**.

## 🚀 Live links

- Game: https://raja-rani-game.netlify.app
- Backend health: https://raja-rani-server-8kjo.onrender.com/health

## 🖥️ Local test

```powershell
cd backend; npm install; npm start
# browser: open frontend/index.html, Server URL: http://localhost:3001
```
