var { Worker } = require('worker_threads');

var express = require('express');
var app = express();
app.use('/scripts', express.static(__dirname + '/node_modules/'));
app.use('/assets', express.static(__dirname + '/assets/'));

var server = require('http').createServer(app);

app.get('', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

console.log("Server started.");

SOCKET_LIST = {};

// Imports socket.io, one of the 2 (actually useful) libraries used
var io = require('socket.io')(server);
var userCount = 0;

// Since an indefinite simulation blocks all event listeners from functioning
// Another thread is created to run the game simulation (game.js)
// app.js is only responsible for sending to and receiving from cilent, and data is passed between the cilents and the game through
// Inter-thread messaging here
var game = new Worker(require.resolve('./game.js'));
game.on('message', data => {
    // Game instructs server to signal clients to play audio
    if (data.substring(0, 5) == 'audio') {
        for (var i in SOCKET_LIST) {
            SOCKET_LIST[i].emit('playAudio', data);
        }

    // Game instructs server to signal clients to end the game
    } else if (data.substring(0, 3) == 'end') {
        for (var i in SOCKET_LIST) {
            SOCKET_LIST[i].emit('endGame', data);
        }

    // Game instructs server to signal clients to update game state
    } else {
        for (var i in SOCKET_LIST) {
            SOCKET_LIST[i].emit('refreshGame', i + '|' + data);
        }
    }
});

// Handles player actions and pass them to game
io.sockets.on('connection', socket => {
    var socketId = userCount;
    SOCKET_LIST[socketId] = socket;
    ++userCount;
    console.log('User ' + socketId + ' connected');
    SOCKET_LIST[socketId].emit('connection', socketId);
    game.postMessage('connection ' + socketId + ' ' + 'placeholder');

    socket.on('startGame', data => {
        game.postMessage('startGame ' + data);
    });

    socket.on('startAction', data => {
        game.postMessage('startAction ' + socketId + ' ' + data);
    });

    socket.on('updateDirection', data => {
        game.postMessage('updateDirection ' + socketId + ' ' + data);
    });

    socket.on('endAction', data => {
        game.postMessage('endAction ' + socketId + ' ' + data);
    });

    socket.on('disconnect', () => {
        console.log('User ' + socketId + ' disconnected');
        delete SOCKET_LIST[socket.id];
    });
});

server.listen(4141);