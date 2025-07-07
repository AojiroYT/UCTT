  const express = require('express');
  const http = require('http');
  const { Server } = require('socket.io');

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  console.log('Server file loaded');

  app.use(express.static('public'));

  const games = {};
  const rooms = {}; // { roomId: { host: socketId, players: [socketId, ...] } }

  io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('listRooms', () => {
      const publicRooms = Object.keys(rooms).map(name => ({
        name,
        hasPassword: false
      }));
      socket.emit('roomList', publicRooms);
    });

    socket.on('createRoom', ({ name, pass }) => {
      if (rooms[name]) {
        socket.emit('roomError', 'Room already exists.');
        return;
      }
      rooms[name] = { host: socket.id, players: [socket.id] };
      socket.emit('roomCreated', { name, hasPassword: !!pass, host: socket.id });
    });

    socket.on('joinRoom', ({ name, pass }) => {
      if (!rooms[name]) {
        socket.emit('roomError', 'Room does not exist.');
        return;
      }
      rooms[name].players.push(socket.id);
      socket.emit('roomJoined', { name, hasPassword: false, host: rooms[name].host });
    });

    socket.on('join', (roomId) => {
      socket.join(roomId);
      currentRoom = roomId;
      if (!rooms[roomId]) rooms[roomId] = { host: socket.id, players: [socket.id] };
      if (!rooms[roomId].players.includes(socket.id)) rooms[roomId].players.push(socket.id);
      console.log(`Socket ${socket.id} joined room ${roomId}`);

      // Wait for 2 players
      if (rooms[roomId].players.length === 2) {
        // Assign colors
        io.to(rooms[roomId].players[0]).emit('assignColor', 'white');
        io.to(rooms[roomId].players[1]).emit('assignColor', 'black');
        // Send current game state to both
        if (!games[roomId]) games[roomId] = { moves: [] };
        io.to(roomId).emit('init', games[roomId].moves);
      } else {
        // Tell the first player to wait
        socket.emit('waitingForOpponent');
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
      }
    });

    socket.on('roomCreated', (room) => {
      showGameUI();
      socket.emit('join', room.name);
      setupBoardEventsMultiplayer();
    });

    socket.on('roomJoined', (room) => {
      showGameUI();
      socket.emit('join', room.name);
      setupBoardEventsMultiplayer();
    });
  });

  const PORT = process.env.PORT || 10000;
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
