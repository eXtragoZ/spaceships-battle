var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io').listen(server);
const { removePlayer } = require('./utils')
const port = process.env.PORT || 8081
var players = {};
var lasers = {

}
var star = {
  x: Math.floor(Math.random() * 700) + 50,
  y: Math.floor(Math.random() * 500) + 50
};
var scores = {};

const rooms = {

}

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});


const createStar = () => ({
  x: Math.floor(Math.random() * 700) + 50,
  y: Math.floor(Math.random() * 500) + 50
})
io.on('connection', function (socket) {
  console.log('a user connected');

  // User create a game 
  socket.on('createGame', ({ room, quantityPlayers, time }) => {
    rooms[room] = {
      quantityPlayers: Number.parseInt(quantityPlayers, 10),
      time: Number.parseFloat(time, 10) * 60000
    }
  })

  // User enter into the game
  socket.on('enterGame', ({ playerName, room }) => {
    // create a new player and add it to our players object
    console.log("EnterGame", playerName, room, 'room', rooms, 'currentPlayers', players)
    players[room] = players[room] ? players[room] : {}
    players[room][playerName] = {
      socketId: socket.id,
      playerName,
      room,
      rotation: 0,
      x: Math.floor(Math.random() * 700) + 50,
      y: Math.floor(Math.random() * 500) + 50,
      playerId: socket.id,
    };

    socket.join(room);
    scores[playerName] = 0

    const roomPlayers = players[room]
    // send the players object to the new player
    socket.emit('currentPlayers', roomPlayers);

    // update all other players of the new player
    socket.in(room).emit('newPlayer', roomPlayers[playerName]);
    const roomData = rooms[room]
    const quantityPlayers = roomData.quantityPlayers
    const currentPlayers = Object.keys(roomPlayers).length

    if (currentPlayers === quantityPlayers) {
      const time = roomData.time
      // Send to the users the real time, to manage in the client
      io.in(room).emit('initTimmer', { time });

      // send the current scores
      io.in(room).emit('scoreUpdate', scores);

      console.log('The game will finish in', time)
      // Calculate the finish of the game
      setTimeout(() => {
        io.in(room).emit('finishGame');
        delete rooms[room]
        scores = {}
      }, time)

      // send the star object to the new player
      setTimeout(() => {
        io.in(room).emit('starLocation', createStar());
      }, 3000)
    }
  })

  socket.on('playerMovement', function ({ x, y, rotation, playerName, room }) {
    // console.log(players, room, playerName)
    players[room][playerName].x = x;
    players[room][playerName].y = y;
    players[room][playerName].rotation = rotation;
    // emit a message to all players about the player that moved
    socket.in(room).emit('playerMoved', players[room][playerName]);
  });

  socket.on('shoot', function (shootData) {
    // console.log("Shoot", shootData)
    //TODO: .in(players[playerName].room)
    socket.broadcast.emit('playerShooted', shootData);
  });

  socket.on('starCollected', function ({ playerName, room }) {
    scores[playerName] += 10
    const star = createStar()
    io.emit('starLocation', star);
    io.emit('scoreUpdate', scores);
  });

  socket.on('killed', function ({ killer, playerName, room }) {
    scores[killer] += 20
    const newScore = scores[playerName] - 20
    scores[playerName] = (newScore >= 0) ? newScore : 0
    players[room][playerName].x = Math.floor(Math.random() * 700) + 50
    players[room][playerName].y = Math.floor(Math.random() * 500) + 50
    io.emit('scoreUpdate', scores);
    io.in(room).emit('playerMoved', players[room][playerName]);
  });



  // Disconnect action
  socket.on('disconnect', function () {
    console.log('user disconnected', players, socket.id);
    // remove this player from our players object
    // TODO: find in sockets
    removePlayer(players, scores, socket.id)
    console.log('current players', players, scores);
    // emit a message to all players to remove this player
    io.emit('disconnect', socket.id);
  });

});

server.listen(port, function () {
  console.log(`Listening on ${server.address().port}`);
});