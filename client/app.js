const API = "";

let socket;
let pc;
let stream;

/* ================= AUTH ================= */

async function register() {
  const email = emailInput.value;
  const password = passwordInput.value;

  await fetch("/rpc/register", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ email, password })
  });

  alert("Conta criada");
}

async function login() {
  const email = emailInput.value;
  const password = passwordInput.value;

  const res = await fetch("/rpc/login", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();

  localStorage.setItem("token", data.token);
  location.href = "/dashboard.html";
}

/* ================= SESSION ================= */

function checkAuth() {
  if (!localStorage.getItem("token")) {
    location.href = "/login.html";
  }
}

/* ================= ROOM ================= */

async function createRoom() {
  const res = await fetch("/rpc/create-room", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: localStorage.getItem("token")
    }
  });

  const data = await res.json();
  return data.roomId;
}

async function endRoom(roomId) {
  await fetch("/rpc/end-room", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ roomId })
  });
}

/* ================= BROADCAST ================= */

async function startBroadcast(roomId) {
  socket = new WebSocket(`ws://${location.host}`);

  socket.onopen = async () => {
    socket.send(JSON.stringify({ type: "join", roomId, role: "broadcaster" }));

    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = e => {
      if (e.candidate) {
        socket.send(JSON.stringify({ type: "ice", candidate: e.candidate }));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.send(JSON.stringify({ type: "offer", offer }));
  };

  socket.onmessage = async msg => {
    const data = JSON.parse(msg.data);

    if (data.type === "answer") {
      await pc.setRemoteDescription(data.answer);
    }

    if (data.type === "ice") {
      await pc.addIceCandidate(data.candidate);
    }
  };
}

function stopBroadcast() {
  stream?.getTracks().forEach(t => t.stop());
  pc?.close();
  socket?.close();
}

/* ================= VIEWER ================= */

function joinStream(roomId) {
  socket = new WebSocket(`ws://${location.host}`);

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "join", roomId, role: "viewer" }));
  };

  socket.onmessage = async msg => {
    const data = JSON.parse(msg.data);

    if (data.type === "offer") {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });

      pc.ontrack = e => {
        audio.srcObject = e.streams[0];
      };

      pc.onicecandidate = e => {
        if (e.candidate) {
          socket.send(JSON.stringify({ type: "ice", candidate: e.candidate }));
        }
      };

      await pc.setRemoteDescription(data.offer);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.send(JSON.stringify({ type: "answer", answer }));
    }

    if (data.type === "ice") {
      await pc.addIceCandidate(data.candidate);
    }

    if (data.type === "ended") {
      alert("Transmissão encerrada");
    }
  };
}
