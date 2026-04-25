const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("../client"));

const SECRET = "secret123";
const DB_FILE = "./users.json";

/* ================= DATABASE ================= */

function loadUsers() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveUsers(users) {
  fs.writeFileSync(DB_FILE, JSON.stringify(users));
}

let users = loadUsers();
const rooms = {};

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* ================= AUTH ================= */

app.post("/rpc/register", (req, res) => {
  const { email, password } = req.body;

  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: "User exists" });
  }

  users.push({ email, password });
  saveUsers(users);

  res.json({ success: true });
});

app.post("/rpc/login", (req, res) => {
  const { email, password } = req.body;

  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: "Invalid login" });

  const token = jwt.sign({ email }, SECRET, { expiresIn: "7d" });
  res.json({ token });
});

/* ================= ROOMS ================= */

app.post("/rpc/create-room", (req, res) => {
  const token = req.headers.authorization;

  try {
    jwt.verify(token, SECRET);

    const id = uuidv4();
    rooms[id] = {
      broadcaster: null,
      viewers: []
    };

    res.json({ roomId: id });
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
});

app.post("/rpc/end-room", (req, res) => {
  const { roomId } = req.body;

  if (rooms[roomId]) {
    delete rooms[roomId];
  }

  res.json({ success: true });
});

/* ================= WEBSOCKET ================= */

wss.on("connection", ws => {
  ws.on("message", message => {
    const data = JSON.parse(message);

    switch (data.type) {
      case "join":
        ws.roomId = data.roomId;
        ws.role = data.role;

        if (!rooms[data.roomId]) return;

        if (data.role === "broadcaster") {
          rooms[data.roomId].broadcaster = ws;
        } else {
          rooms[data.roomId].viewers.push(ws);
        }
        break;

      case "offer":
        rooms[ws.roomId]?.viewers.forEach(v =>
          v.send(JSON.stringify({ type: "offer", offer: data.offer }))
        );
        break;

      case "answer":
        rooms[ws.roomId]?.broadcaster?.send(
          JSON.stringify({ type: "answer", answer: data.answer })
        );
        break;

      case "ice":
        const targets =
          ws.role === "broadcaster"
            ? rooms[ws.roomId]?.viewers
            : [rooms[ws.roomId]?.broadcaster];

        targets?.forEach(t =>
          t?.send(JSON.stringify({ type: "ice", candidate: data.candidate }))
        );
        break;
    }
  });

  ws.on("close", () => {
    if (!ws.roomId || !rooms[ws.roomId]) return;

    if (ws.role === "viewer") {
      rooms[ws.roomId].viewers =
        rooms[ws.roomId].viewers.filter(v => v !== ws);
    }

    if (ws.role === "broadcaster") {
      rooms[ws.roomId].viewers.forEach(v =>
        v.send(JSON.stringify({ type: "ended" }))
      );
      delete rooms[ws.roomId];
    }
  });
});

server.listen(3000, () => console.log("http://localhost:3000"));
