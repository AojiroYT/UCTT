const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

console.log('Server file loaded');

app.use(express.static('public'));

const games = {};
const rooms = {}; // { roomId: { host, players, hostNickname, guestNickname } }

io.on('connection', (socket) => {
console.log(`[Socket.IO] 🔌 Client connected: ${socket.id}`);

socket.onAny((event, ...args) => {
  console.log(`[Socket.IO] 📩 Received event: ${event}`, args);
});
  let currentRoom = null;

  socket.on('listRooms', () => {
    const publicRooms = Object.keys(rooms).map(name => ({
      name,
      hasPassword: false
    }));
    socket.emit('roomList', publicRooms);
  });

  socket.on('createRoom', ({ name, pass, nickname }) => {
    if (rooms[name]) {
      socket.emit('roomError', 'Room already exists.');
      return;
    }
    rooms[name] = {
      host: socket.id,
      players: [socket.id],
      hostNickname: nickname || 'Player',
      guestNickname: null
    };
    socket.emit('roomCreated', {
      name,
      hasPassword: !!pass,
      host: socket.id,
      hostNickname: nickname || 'Player',
      guestNickname: null
    });
  });
  
  socket.on('joinRoom', ({ name, pass, nickname }) => {
    if (!rooms[name]) {
      socket.emit('roomError', 'Room does not exist.');
      return;
    }
    rooms[name].players.push(socket.id);
    rooms[name].guestNickname = nickname || 'Player';
    socket.emit('roomJoined', {
      name,
      hasPassword: false,
      host: rooms[name].host,
      hostNickname: rooms[name].hostNickname,
      guestNickname: rooms[name].guestNickname
    });
    // Notify both players of nicknames
    io.to(name).emit('playerInfo', {
      whiteNickname: rooms[name].hostNickname,
      blackNickname: rooms[name].guestNickname || '-'
    });
  });

  socket.on('join', (roomId) => {
    socket.join(roomId);
    currentRoom = roomId;
  
    // ルームがなければ初期化
    if (!rooms[roomId]) {
      rooms[roomId] = {
        host: socket.id,
        players: [socket.id],
        hostNickname: 'Player',
        guestNickname: null
      };
    } else if (!rooms[roomId].players.includes(socket.id)) {
      rooms[roomId].players.push(socket.id);
    }
  
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  
    // プレイヤーが2人揃ったら色を割り当ててゲーム開始
    if (rooms[roomId].players.length === 2) {
      const whiteSocketId = rooms[roomId].players[0];
      const blackSocketId = rooms[roomId].players[1];
  
      // ✅ 色割り当てを送信
      io.to(whiteSocketId).emit('assignColor', 'white');
      io.to(blackSocketId).emit('assignColor', 'black');
  
      // ゲーム状態がなければ初期化
      if (!games[roomId]) {
        games[roomId] = { moves: [] };
      }
  
      // ✅ ゲーム状態を送信
      io.to(roomId).emit('init', games[roomId].moves);
  
      // ✅ ニックネームを送信
      io.to(roomId).emit('playerInfo', {
        whiteNickname: rooms[roomId].hostNickname,
        blackNickname: rooms[roomId].guestNickname || '-'
  });

  } else {
    // プレイヤーが1人しかいない場合
    socket.emit('waitingForOpponent');

    // ✅ 既にいるプレイヤーにニックネーム情報を更新
    io.to(roomId).emit('playerInfo', {
      whiteNickname: rooms[roomId].hostNickname,
      blackNickname: rooms[roomId].guestNickname || '-'
    });
  }
});


  // Host starts the game
  socket.on('startGame', (roomName) => {
    if (rooms[roomName] && rooms[roomName].host === socket.id) {
      io.to(roomName).emit('gameStarted');
    }
  });

  socket.on('move', (move) => {
    console.log(`Received move from ${socket.id} in room ${currentRoom}`);
    console.log('Move data:', move);  // ← これ追加して深く見る！
    if (!currentRoom) return;
    games[currentRoom].moves.push(move);
    io.to(currentRoom).emit('move', move);
  });

  socket.on('reset', () => {
    if (!currentRoom) return;
    games[currentRoom].moves = [];
    io.to(currentRoom).emit('reset');
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].players = rooms[currentRoom].players.filter(id => id !== socket.id);
      // Optionally notify the other player
      socket.to(currentRoom).emit('opponentLeft');
      // If host leaves, optionally assign a new host or close the room
      if (rooms[currentRoom].host === socket.id) {
        // Host left: Optionally handle room closure or host reassignment
        // For now, just leave the room as is
      } else {
        // Guest left: clear guestNickname
        rooms[currentRoom].guestNickname = null;
        io.to(currentRoom).emit('playerInfo', {
          whiteNickname: rooms[currentRoom].hostNickname,
          blackNickname: '-'
        });
      }
    }
  });

  socket.on('roomCreated', (room) => {
    console.log('roomCreated event received', room, socket.id);
    setupBoardEventsMultiplayer();
    isHost = (room.host === socket.id);
    currentRoomName = room.name;
    playBtn.disabled = !isHost;
    playBtn.style.opacity = isHost ? 1 : 0.5;
    playBtn.style.display = '';
    // Optionally, hide the lobby and show the Play button
    if (lobbyDiv) lobbyDiv.style.display = 'none';
    if (playBtn) playBtn.style.display = '';
  });

  socket.on('roomJoined', (room) => {
    console.log('roomJoined event received', room, socket.id);
    setupBoardEventsMultiplayer();
    isHost = (room.host === socket.id);
    currentRoomName = room.name;
    playBtn.disabled = !isHost;
    playBtn.style.opacity = isHost ? 1 : 0.5;
    playBtn.style.display = '';
    if (lobbyDiv) lobbyDiv.style.display = 'none';
    if (playBtn) playBtn.style.display = '';
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
