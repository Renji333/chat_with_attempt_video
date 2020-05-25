require('colors');

var yturl= /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([\w\-]{10,12})(?:&feature=related)?(?:[\w\-]{0})?/g;
var ytplayer= '<iframe  height="inherit" width="270" src="http://www.youtube.com/embed/$1" frameborder="0" allowfullscreen></iframe>';

var express = require('express');
var app = express();

const http = require('http').createServer(app),
    io = require('socket.io')(http),
    redis = require("redis"),
    requestIp = require('request-ip');

app.use('/css', express.static('css'));

const client = redis.createClient();

function consoleLog(event, method, msg = undefined) {
    console.log(event.red + '.' + method.yellow + (msg !== undefined ? (' => ' + msg) : ''));
}

app.get('/', (req, res) => {
    res.sendFile(`${__dirname}/index.html`);
});

io.on('connection', (socket) => {

    socket.on("call-user", data => {

        socket.emit("call-made", {
            offer: data.offer,
            socket: socket.id
        });

    });

    socket.on("make-answer", data => {
        socket.emit("answer-made", {
            socket: socket.id,
            answer: data.answer
        });
    });

    socket.on('chat.join', (data) => {
        const reception = JSON.parse(data);
        socket.ip = requestIp.getClientIp(socket.request);
        socket.username = reception.username;
        socket.room = reception.room;
        socket.token = reception.token;

        consoleLog('chat', 'join', `[${socket.username}]`.bold + ' join channel '+ `[${socket.room}]` + ' with IP ' + `${socket.ip}`.yellow);
        const json = JSON.stringify({username: socket.username, token : socket.token, ip : socket.ip});

        //rejoin le channel
        socket.join(socket.room);

        // Emit event "chat.join" to connected users (without the current one)
        socket.broadcast.to(socket.room).emit("chat.join", json);
        socket.emit('chat.NoUser');
        socket.emit('chat.NoMsg');

        // Retrieve all users from the SET "users"
        client.smembers(socket.room+':users', (err, replies) => {

            if(!err){
                replies.forEach(user => {
                    socket.emit('chat.join', user);
                });
            }
        });

        // Retrieve all messages of the LIST "messages"
        client.lrange(socket.room+':msg', 0, 20, (err, replies) => {
            if(!err) {
                replies.reverse().forEach((msg) => {
                    msg.replace(yturl, ytplayer);
                    socket.emit('chat.add_msg', msg);
                });
            }
        });
        client.sadd(socket.room+':users', json);
    });

    socket.on('chat.typing', () => {
        socket.broadcast.to(socket.room).emit('chat.typing', socket.token);
    });

    socket.on('chat.add_msg', (msg) => {
        const json = JSON.stringify({username: socket.username, token: socket.token, content: msg.replace(yturl, ytplayer)});
        client.lpush(socket.room+':msg', json , (err, replies) =>
        {
        });

        socket.broadcast.to(socket.room).emit('chat.add_msg', json);
        socket.emit('chat.add_msg', json);
    });

    socket.on('chat.leaveChannel', () => {
        if (socket.room !== undefined) {
            const json = JSON.stringify({username: socket.username, token : socket.token, ip : socket.ip});
            client.srem(socket.room+':users', json);
            socket.broadcast.to(socket.room).emit('chat.out', socket.token);
            socket.emit('chat.channelChanged');
        }
    });

    socket.on('disconnect', () => {
        if (socket.room !== undefined) {
            const json = JSON.stringify({username: socket.username, token : socket.token, ip : socket.ip});
            socket.broadcast.to(socket.room).emit('chat.out', socket.token);
            client.srem(socket.room+':users', json);
        }
    });
});

http.listen(3000, () => console.log('Listening on ' + 'http://localhost:3000\n'.green));
