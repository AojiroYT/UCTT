const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

console.log('Server file loaded');

app.use(express.static('public'));

const games = {};

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join', (roomId) => {
    socket.join(roomId);
    currentRoom = roomId;
    if (!games[roomId]) games[roomId] = { moves: [] };
    socket.emit('init', games[roomId].moves);
  });

  socket.on('move', (move) => {
    if (!currentRoom) return;
    games[currentRoom].moves.push(move);
    socket.to(currentRoom).emit('move', move);
  });

  socket.on('reset', () => {
    if (!currentRoom) return;
    games[currentRoom].moves = [];
    io.to(currentRoom).emit('reset');
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
