  const express = require('express');
  const http = require('http');
  const { Server } = require('socket.io');

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  console.log('Server file loaded');

  app.use(express.static('public'));

  const games = {}; // { roomId: { moves: [], turn: 'white'|'black', sockets: {white: socketId, black: socketId} } }
  const rooms = {}; // { roomId: [socketId1, socketId2] }

  io.on('connection', (socket) => {
    let currentRoom = null;
    let myColor = null;

    socket.on('join', (roomId) => {
      socket.join(roomId);
      currentRoom = roomId;
      if (!rooms[roomId]) rooms[roomId] = [];
      if (!rooms[roomId].includes(socket.id)) rooms[roomId].push(socket.id);

      // Wait for 2 players
      if (rooms[roomId].length === 2) {
        // Assign colors
        if (!games[roomId]) games[roomId] = { moves: [], turn: 'white', sockets: {} };
        games[roomId].sockets.white = rooms[roomId][0];
        games[roomId].sockets.black = rooms[roomId][1];
        io.to(rooms[roomId][0]).emit('assignColor', 'white');
        io.to(rooms[roomId][1]).emit('assignColor', 'black');
        // Send current game state to both
        io.to(roomId).emit('init', games[roomId].moves);
      } else {
        socket.emit('waitingForOpponent');
      }
    });

    socket.on('move', (move) => {
      if (!currentRoom || !games[currentRoom]) return;
      const game = games[currentRoom];
      // Only accept move from correct player
      const expectedSocket = game.sockets[game.turn];
      if (socket.id !== expectedSocket) return;
      // Save move
      game.moves.push(move);
      // Switch turn
      game.turn = (game.turn === 'white' ? 'black' : 'white');
      // Broadcast move to both players, include nextTurn
      io.to(currentRoom).emit('move', { ...move, nextTurn: game.turn });
    });

    socket.on('reset', () => {
      if (!currentRoom || !games[currentRoom]) return;
      games[currentRoom].moves = [];
      games[currentRoom].turn = 'white';
      io.to(currentRoom).emit('reset');
    });

    socket.on('disconnect', () => {
      if (currentRoom && rooms[currentRoom]) {
        rooms[currentRoom] = rooms[currentRoom].filter(id => id !== socket.id);
        if (games[currentRoom]) delete games[currentRoom];
        socket.to(currentRoom).emit('opponentLeft');
      }
    });
  });

  const PORT = process.env.PORT || 10000;
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
