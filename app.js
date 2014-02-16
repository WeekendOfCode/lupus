/**
 * Module dependencies.
 */

var express = require('express'),
    routes = require('./routes'),
    user = require('./routes/user'),
    http = require('http'),
    Cywolf = require('cywolf'),
    game = new Cywolf(),
    ids = 0,
    path = require('path');

var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);

// all environments
app.set('port', process.env.PORT || 6750);
server.listen(app.get('port'))
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
    app.use(express.errorHandler());
}

app.get('/', function (req, res) {
    res.redirect('/index.html');
});
io.set('log level', 1);
io.sockets.on('connection', function (socket) {
    if (game.phase == 'start') {
        ids = ids + 1;
        socket.pid = ids;
        socket.emit('joining', {
            id: socket.pid,
            players: []
        })
        socket.on('disconnect', function () {
            ids = ids - 1;
            if (game.phase == 'start') {
                game.emit('quit', {
                    player: 'P' + socket.pid
                })
            } else {
                game.kill('P' + socket.pid, ' disconnected.')
            }
        });
        game.emit('join', {
            player: 'P' + socket.pid
        });
        socket.join('players');
        socket.emit('joining', {
            id: socket.pid,
            players: Object.keys(game.players)
        });
        socket.on('start', function () {
            if (Object.keys(game.players).length >= 4) {
                game.emit('start');
            } else {
                socket.emit('notice', {
                    message: 'Four or more people are required to play.'
                })
            }
        });
        socket.on('act', function (data) {
            if (game.players['P' + socket.pid].role.canAct && !game.players['P' + socket.pid].role.acted) {
                console.log('P' + socket.pid + ' acts against ' + data.player);
                game.players['P' + socket.pid].role.act(data.player);
                var done = true
                Object.keys(game.players).forEach(function (player) {
                    if (!game.players[player].role.acted && game.players[player].role.canAct) {
                        done = false;
                        console.log(player + ' has not acted')
                    }
                });
                if (done) {
                    game.emit('day');
                    console.log('everyone has acted')
                }
            } else {
                socket.emit('notice', {
                    mesage: 'You have already acted.'
                })
            }
        });
        socket.on('lynch', function (data) {
            console.log('P' + socket.pid + ' lynches against ' + data.player);
            game.lynch(data.player, 'P' + socket.pid)
        });
    } else {
        socket.emit('full');
    }
});
game.on('joined', function (data) {
    io.sockets.clients('players').forEach(function (socket) {
        socket.emit('joining', {
            id: socket.pid,
            players: Object.keys(game.players)
        });
    });
    console.log('player', data.player, 'joined')
    console.log('players:', Object.keys(game.players).join(', '))
});
game.on('quitted', function (data) {
    io.sockets.clients('players').forEach(function (socket) {
        socket.emit('joining', {
            id: socket.pid,
            players: Object.keys(game.players)
        });
    });
    console.log('player', data.player, 'left')
    console.log('players:', Object.keys(game.players).join(', '))
});
game.on('pm', function (data) {
    console.log(data.message + ' -> ' + data.to)
    io.sockets.clients('players').forEach(function (socket) {
        if ('P' + socket.pid == data.to) {
            socket.emit('notice', {
                message: data.message
            });
        }
    });
});
game.on('starting', function () {
    console.log('the game is starting')
    io.sockets.clients('players').forEach(function (socket) {
        socket.emit('starting');
        socket.emit('players', {
            players: Object.keys(game.players)
        });
    });
});
game.on('night', function () {
    console.log('it is now night')
    io.sockets.clients('players').forEach(function (socket) {
        socket.emit('night', {
            role: game.players['P' + socket.pid].role,
            name: game.players['P' + socket.pid].role.toString()
        });

    });
});
game.on('day', function () {
    console.log('it is now day')
    io.sockets.clients('players').forEach(function (socket) {
        socket.emit('day');
    });
});
game.on('death', function (data) {
    console.log(data.player + ' died')
    io.sockets.clients('players').forEach(function (socket) {
        socket.emit('death', {
            player: data.player,
            role: data.role.toString(),
            reason: data.reason
        });
        setTimeout(function () {
            socket.emit('players', {
                players: Object.keys(game.players)
            });
        }, 1000);
    });
})
game.on('lynch', function (data) {
    io.sockets.clients('players').forEach(function (socket) {
        socket.emit('lynch', {
            from: data.from,
            to: data.to
        })
    });
});
game.on('gameover', function (data) {
    io.sockets.clients('players').forEach(function (socket) {
        socket.emit('gameover', {
            winners: data.win
        })
    });
});