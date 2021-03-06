
const { removePlayer, randomIntFromInterval, getRoomBySocket } = require('../utils')
const Room = require('../domain/game/Room')
const Player = require('../domain/game/Player')
const Star = require('../domain/game/Star')
const Powerup = require('../domain/game/Powerup')
const Heart = require('../domain/game/Heart')
const HitterMapper = require('../domain/game/hitters/HitterMapper')

const colors = ['0bed07', '200ee8', 'ed2009', 'db07eb', 'f56d05']

const rooms = {
    debug: new Room({
        name: 'debug',
        admin: 'gonzalo',
        time: 320000,
        width: 1000,
        colors
    }),
    d_m: new Room({
        name: 'd_m',
        admin: 'gonzalo',
        quantityPlayers: 2,
        time: 320000,
        width: 1000,
        colors
    })
}

const removeARoom = (room) => {
    delete rooms[room]
}

/**
 * Returns a room.
 * @param {string} roomKey - the key of the room.
 * @returns {object} Room class
 */
const getRoomObject = (roomKey) => rooms[roomKey]

module.exports = (server) => {
    const io = require('socket.io').listen(server);
    rooms.debug.io = io // debug line
    rooms.d_m.io = io // debug line
    io.on('connection', function (socket) {
        console.log('a user connected');

        // User create a game 
        socket.on('createGame', ({ room, time, admin, width }) => {
            rooms[room] = new Room({
                io,
                name: room,
                admin,
                time: Number.parseFloat(time, 10) * 60000,
                colors: colors,
                width
            })
        })

        // User enter into the game
        socket.on('enterGame', ({ playerName, room }) => {
            // create a new player and add it to our players object
            const roomObject = rooms[room]

            const newPlayer = new Player({
                playerName,
                room,
                playerId: socket.id,
                color: colors[randomIntFromInterval(0, colors.length - 1)],
            })

            roomObject.addPlayer(newPlayer);

            socket.join(room);

            // send the players object to the new player
            socket.emit('currentPlayers', roomObject.players);

            // update all other players of the new player
            socket.in(room).emit('newPlayer', newPlayer);
        })

        socket.on('initGame', ({ playerName, room }) => {
            const currentRoom = getRoomObject(room)
            if (currentRoom.isGameReady() && currentRoom.isAdmin(playerName)) {
                currentRoom.initGame(() => {
                    removeARoom(room)
                })
            }
        })

        socket.on('sendPing', (id) => {
            socket.emit('getPong', id)
        })

        socket.on('playerMovement', function ({ x, y, rotation, acceleration, velocity, maxSpeed, playerName, room }) {
            const roomObject = rooms[room]
            if (roomObject) { // This if a player makes a movement when the game has already finish
                roomObject.updatePlayer(playerName, (player) => {
                    player.x = x;
                    player.y = y;
                    player.rotation = rotation;
                    player.acceleration = acceleration;
                    player.velocity = velocity;
                    player.maxSpeed = maxSpeed;
                })

                // emit a message to all players about the player that moved
                socket.to(room).emit('playerMoved', roomObject.getPlayer(playerName));
            }
        });

        socket.on('shoot', function ({ room, lasers }) {
            socket.to(room).emit('playerShooted', { lasers });
        });

        socket.on('starCollected', function ({ playerName, room }) {
            const roomObject = rooms[room]
            roomObject.updatePlayer(playerName, (player) => {
                player.score += 50
            })
            const star = new Star()
            io.emit('starLocation', star);
            io.emit('scoreUpdate', roomObject.getScores());
        });

        socket.on('heartCollected', function ({ playerName, room }) {
            const roomObject = getRoomObject(room)
            const currentPlayer = roomObject.getPlayer(playerName)
            const heart = new Heart()
            currentPlayer.collect(heart)

            io.emit('heartLocation', heart);
            io.in(room).emit('updateHp', { playerName: playerName, hp: currentPlayer.hp });
        });

        socket.on('powerupCollected', function ({ playerName, room, powerup }) {
            const powerUp = new Powerup()
            socket.to(room).emit('powerupCollected', { playerName, powerup })
            io.in(room).emit('renderPowerup', powerUp);
        });

        socket.on('powerupActivated', function ({ playerName, room, powerup }) {
            socket.to(room).emit('powerupActivated', { playerName, powerup })
        });

        socket.on('playerHitted', ({ hitted, hitter, hitterMetadata, room }) => {
            const currentRoom = getRoomObject(room)
            const currentPlayer = currentRoom.getPlayer(hitted.playerName)
            const currentHitter = HitterMapper(hitter, { hitter: hitterMetadata, hitted: currentPlayer })
            if (!currentPlayer.isDead()) {
                currentRoom.hitPlayerWith({ playerName: hitted.playerName, hitter: currentHitter })
            }
        })

        // Disconnect action
        socket.on('disconnect', function () {
            console.log('user disconnected', socket.id);
            // remove this player from our players object
            const currentRoom = getRoomBySocket(rooms, socket.id)
            removePlayer(rooms, socket.id)
            if (currentRoom) {
                if (currentRoom.isEmpty()) {
                    currentRoom.clearIntervalMeteorInterval()
                    removeARoom(currentRoom.name)
                } else {
                    // emit a message to all players to remove this player
                    io.in(currentRoom.name).emit('disconnect', socket.id);
                }
            }
        });

    });

    return {
        getRooms: () => rooms
    }
}