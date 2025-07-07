  const express = require('express');
  const http = require('http');
  const { Server } = require('socket.io');

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  console.log('Server file loaded');

  app.use(express.static('public'));

  const games = {};
  const rooms = {}; // { roomId: [socketId1, socketId2] }

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
      rooms[name] = [];
      socket.emit('roomCreated', { name, hasPassword: !!pass });
    });

    socket.on('joinRoom', ({ name, pass }) => {
      if (!rooms[name]) {
        socket.emit('roomError', 'Room does not exist.');
        return;
      }
      socket.emit('roomJoined', { name, hasPassword: false });
    });

    socket.on('join', (roomId) => {
      socket.join(roomId);
      currentRoom = roomId;
      if (!rooms[roomId]) rooms[roomId] = [];
      if (!rooms[roomId].includes(socket.id)) rooms[roomId].push(socket.id);
      console.log(`Socket ${socket.id} joined room ${roomId}`);

      // Wait for 2 players
      if (rooms[roomId].length === 2) {
        // Assign colors
        io.to(rooms[roomId][0]).emit('assignColor', 'white');
        io.to(rooms[roomId][1]).emit('assignColor', 'black');
        // Send current game state to both
        if (!games[roomId]) games[roomId] = { moves: [] };
        io.to(roomId).emit('init', games[roomId].moves);
      } else {
        // Tell the first player to wait
        socket.emit('waitingForOpponent');
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
        rooms[currentRoom] = rooms[currentRoom].filter(id => id !== socket.id);
        // Optionally notify the other player
        socket.to(currentRoom).emit('opponentLeft');
      }
    });
  });

  const PORT = process.env.PORT || 10000;
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
