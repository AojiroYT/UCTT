  const express = require('express');
  const http = require('http');
  const { Server } = require('socket.io');

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  console.log('Server file loaded');

  app.use(express.static('public'));

  const games = {}; // { roomId: { moves: [], turn: 'white'|'black', sockets: {white: socketId, black: socketId}, pass: string|null, public: bool } }
  const rooms = {}; // { roomId: [socketId1, socketId2] }

  io.on('connection', (socket) => {
    let currentRoom = null;
    let myColor = null;

    socket.on('createRoom', ({ name, pass }) => {
      if (rooms[name]) {
        socket.emit('roomError', 'Room already exists!');
        return;
      }
      rooms[name] = [socket.id];
      games[name] = { moves: [], turn: 'white', sockets: {}, pass: pass || null, public: true };
      currentRoom = name;
      socket.join(name);
      socket.emit('roomCreated', name);
    });

    socket.on('joinRoom', ({ name, pass }) => {
      if (!rooms[name]) {
        socket.emit('roomError', 'Room does not exist!');
        return;
      }
      if (rooms[name].length >= 2) {
        socket.emit('roomError', 'Room is full!');
        return;
      }
      if (games[name].pass && games[name].pass !== pass) {
        socket.emit('roomError', 'Incorrect password!');
        return;
      }
      rooms[name].push(socket.id);
      currentRoom = name;
      socket.join(name);
      socket.emit('roomJoined', name);
      // Assign colors if two players
      if (rooms[name].length === 2) {
        games[name].sockets.white = rooms[name][0];
        games[name].sockets.black = rooms[name][1];
        io.to(rooms[name][0]).emit('assignColor', 'white');
        io.to(rooms[name][1]).emit('assignColor', 'black');
        io.to(name).emit('init', games[name].moves);
      }
    });

    socket.on('listRooms', () => {
      // List public rooms with <2 players
      const publicRooms = Object.keys(games).filter(r => games[r].public && rooms[r] && rooms[r].length < 2).map(r => ({ name: r }));
      socket.emit('publicRooms', publicRooms);
    });

    socket.on('join', (roomId) => {
      socket.join(roomId);
      currentRoom = roomId;
      if (!rooms[roomId]) rooms[roomId] = [];
      if (!rooms[roomId].includes(socket.id)) rooms[roomId].push(socket.id);
      if (rooms[roomId].length === 2) {
        if (!games[roomId]) games[roomId] = { moves: [], turn: 'white', sockets: {}, public: true };
        games[roomId].sockets.white = rooms[roomId][0];
        games[roomId].sockets.black = rooms[roomId][1];
        io.to(rooms[roomId][0]).emit('assignColor', 'white');
        io.to(rooms[roomId][1]).emit('assignColor', 'black');
        io.to(roomId).emit('init', games[roomId].moves);
      } else {
        socket.emit('waitingForOpponent');
      }
    });

    socket.on('move', (move) => {
      if (!currentRoom || !games[currentRoom]) return;
      const game = games[currentRoom];
      const expectedSocket = game.sockets[game.turn];
      if (socket.id !== expectedSocket) return;
      game.moves.push(move);
      game.turn = (game.turn === 'white' ? 'black' : 'white');
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
