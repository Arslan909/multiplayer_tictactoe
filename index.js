import express from "express"
import http from 'http'
import { Server } from "socket.io"
import cors from "cors";
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';



import { config } from 'dotenv';
config({ path: './config.env' });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


let app = express();
app.use(express.json());
app.use(cors());
const server = http.createServer(app)
const io = new Server(server);

let games = []
let userGame = {}


let createGame = (userId, userName) => {
  let game = {
    gameId: uuidv4(),
    connectedUsers: [{ "userId": userId, "userName": userName }],
    gameBoard: new Array(9).fill(null),
    playerTurn: "X",
    userTurn: null,
  }
  games.push(game)
  return game.gameId
}


io.on('connection', (socket) => {

  socket.on("register", (data, callback) => {
    let { userName } = data
    const userId = uuidv4()
    // const userId = socket.id

    if (!userName || userName === "") {
      return callback({ message: "Please provide a username", success: false });
    }


    let existingGame = games.find(game => game.connectedUsers.length < 2);
    if (existingGame) {
      existingGame.connectedUsers.push({ userId: userId, userName: userName })
      userGame[userId] = existingGame.gameId
    } else {
      let gameId = createGame(userId, userName)
      userGame[userId] = gameId
    }

    return callback({ message: "User registered successfully", success: true, userId: userId });
  })

  socket.on('registerRoom', (data) => {
    let { userId } = data
    let gameId = userGame[userId];
    socket.join(gameId)
    console.log("user registered to room");

  })

  socket.on('submitMove', (data) => {
    let { userId, move } = data;
    let gameId = userGame[userId];

    if (!gameId) {
      socket.emit("error", { message: "Please join a game", success: false });
      return;
    }
    // socket.join(gameId)

    let currentGame = games.find(game => game.gameId === gameId);
    if (!currentGame) {
      socket.emit("error", { message: "Game not found", success: false });
      return;
    }

    let { connectedUsers, gameBoard, playerTurn, userTurn } = currentGame;

    if (!move || move === "" || !userId || userId === "") {
      return;
    }

    if (connectedUsers.length < 2) {
      socket.emit("error", { message: "Not enough players to start game", success: false });
      return;
    }

    if (userTurn === userId) {
      socket.emit("error", { message: "Not your turn", success: false });
      return;
    }

    if (gameBoard[parseInt(move)] === "X" || gameBoard[parseInt(move)] === "O") {
      socket.emit("error", { message: "Invalid move", success: false });
      return;
    }

    gameBoard[parseInt(move)] = playerTurn;

    if (checkWin(gameBoard)) {
      const winnerName = connectedUsers.find(user => user.userId === userId).userName;
      io.to(gameId).emit('makeMove', { move: move, playerTurn: playerTurn });
      io.to(gameId).emit('gameOver', { win: true, "userId": userId, winnerName: winnerName });
      socket.leave(gameId);
      return;
    }

    if (checkDraw(gameBoard)) {
      io.to(gameId).emit('makeMove', { move: move, playerTurn: playerTurn });
      io.to(gameId).emit('gameOver', { draw: true });
      socket.leave(gameId);
      return;
    }

    currentGame.playerTurn = playerTurn === "X" ? "O" : "X";
    currentGame.userTurn = userId;
    io.to(gameId).emit('makeMove', { "move": move, "playerTurn": playerTurn })// send move to all users
  });

  socket.on("resetGame", (data) => {
    let { userId, userName } = data

    let gameId = userGame[userId];
    if (gameId) {
      let gameIndex = games.findIndex(game => game.gameId === gameId);

      if (gameIndex !== -1) {
        games.splice(gameIndex, 1);
        console.log(`Game ${gameId} has been removed.`);
      }

      delete userGame[userId];
    }


    let existingGame = games.find(game => game.connectedUsers.length < 2);
    if (existingGame) {
      existingGame.connectedUsers.push({ "userId": userId, "userName": userName })
      userGame[userId] = existingGame.gameId
      socket.join(existingGame.gameId)
    } else {
      let gameId = createGame(userId, userName)
      userGame[userId] = gameId
      socket.join(gameId)
    }
  })

  socket.on('disconnectUserFromGame', (data) => {
    let { userId } = data

    if (userId) {
      const gameId = userGame[userId];
      const game = games.find(game => game.gameId === gameId);

      if (game) {
        game.connectedUsers = game.connectedUsers.filter(user => user.userId !== userId);
        game.gameBoard = new Array(9).fill(null);
        game.playerTurn = "X";
        game.userTurn = null;
        socket.leave(gameId);
        io.to(gameId).emit("opponentLeft");

        if (game.connectedUsers.length === 0) {
          games = games.filter(g => g.gameId !== gameId);
        }

        delete userGame[userId];
      }
    }
  })

  // when server disconnects from user (this is for testing purposes)
  socket.on('disconnect', () => {
    console.log("disconnected from user");
  })
});




app.get("/", (request, response) => {
  response.sendFile(__dirname + "/templates/entrance.html");
});


app.get("/gameBoard", (request, response) => {
  response.sendFile(__dirname + "/templates/gameBoard.html");
  // console.log("connecteUsers", connectedUsers);

});


const checkWin = (gameBoard) => {
  return (
    // Horizontal checks
    (gameBoard[0] && gameBoard[0] === gameBoard[1] && gameBoard[1] === gameBoard[2]) ||
    (gameBoard[3] && gameBoard[3] === gameBoard[4] && gameBoard[4] === gameBoard[5]) ||
    (gameBoard[6] && gameBoard[6] === gameBoard[7] && gameBoard[7] === gameBoard[8]) ||

    // Vertical checks
    (gameBoard[0] && gameBoard[0] === gameBoard[3] && gameBoard[3] === gameBoard[6]) ||
    (gameBoard[1] && gameBoard[1] === gameBoard[4] && gameBoard[4] === gameBoard[7]) ||
    (gameBoard[2] && gameBoard[2] === gameBoard[5] && gameBoard[5] === gameBoard[8]) ||

    // Diagonal checks
    (gameBoard[0] && gameBoard[0] === gameBoard[4] && gameBoard[4] === gameBoard[8]) ||
    (gameBoard[2] && gameBoard[2] === gameBoard[4] && gameBoard[4] === gameBoard[6])
  );
};


const checkDraw = (gameBoard) => {
  if (gameBoard.every(cell => cell === 'X' || cell === 'O')) {
    return true
  } else {
    return false
  }
}


server.listen(6969, '0.0.0.0', () => {
  console.log('server has started...');
})


