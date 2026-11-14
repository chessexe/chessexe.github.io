
"use strict";

// =============================================
// CHESS WORLD — APPLICATION ENGINE
// =============================================

const API = {
    chessLeaderboard: "https://api.chess.com/pub/leaderboards",
    dailyPuzzle: "https://lichess.org/api/puzzle/daily"
};

const $ = (id) => document.getElementById(id);

// =============================================
// GLOBAL STATE
// =============================================

let chessGame = null;
let initialPosition = "";
let puzzleSolution = [];
let solutionPosition = 0;
let selectedSquare = null;
let possibleMoves = [];
let previousMove = null;
let boardOrientation = "w";
let puzzleCompleted = false;

// =============================================
// DATE
// =============================================

function updateDate() {
    const date = new Date();

    $("daily-date").textContent =
        date.toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short"
        }).toUpperCase();
}

// =============================================
// CHESS.COM RAPID LEADERBOARD
// =============================================

async function loadLeaderboard() {
    const list = $("leaderboard-list");
    const status = $("leaderboard-status");
    const refresh = $("refresh-leaderboard");

   list.innerHTML = `
    <div class="loading-message">
        Connecting to Chess.com...
    </div>
`;

    status.textContent = "Loading live data...";
    refresh.disabled = true;
    refresh.textContent = "Loading...";

    try {
        const response = await fetch(API.chessLeaderboard);

        if (!response.ok) {
            throw new Error("Leaderboard request failed.");
        }

        const data = await response.json();

        // Chess.com's Rapid leaderboard property.
        const players = data.live_rapid || data.rapid;

        if (!players || !players.length) {
            throw new Error("Rapid leaderboard is unavailable.");
        }

        list.innerHTML = "";

        players.slice(0, 10).forEach((player, index) => {
            const row = document.createElement("div");
            row.className = "leader-row";

            const playerArea = document.createElement("div");
            playerArea.className = "leader-player";

            const rank = document.createElement("span");
            rank.className = "leader-rank";
            rank.textContent = "#" + (player.rank || index + 1);

            const name = document.createElement("span");
            name.className = "leader-name";
            name.textContent = player.username || "Unknown player";

            const country = document.createElement("span");
            country.className = "leader-country";
            country.textContent =
                player.country
                    ? player.country.split("/").pop()
                    : "—";

            const rating = document.createElement("span");
            rating.className = "leader-rating";
            rating.textContent = Number(player.score).toLocaleString();

            playerArea.append(rank, name);
            row.append(playerArea, country, rating);

            list.appendChild(row);
        });

        status.textContent =
            "Successfully loaded " + Math.min(players.length, 10) +
            " players from Chess.com.";

    } catch (error) {
        console.error("Leaderboard error:", error);

        list.innerHTML = `
            <div class="loading-message">
                <strong>Leaderboard unavailable.</strong>
                <p>Check your connection or try refreshing.</p>
            </div>
        `;

        status.textContent = "Could not connect to Chess.com.";
    }

    refresh.disabled = false;
    refresh.textContent = "↻ Refresh";
}

// =============================================
// CHESSBOARD RENDERING
// =============================================

const chessSymbols = {
    w: {
        k: "♔",
        q: "♕",
        r: "♖",
        b: "♗",
        n: "♘",
        p: "♙"
    },
    b: {
        k: "♚",
        q: "♛",
        r: "♜",
        b: "♝",
        n: "♞",
        p: "♟"
    }
};

function renderBoard() {
    if (!chessGame) return;

    const board = $("chessboard");
    board.innerHTML = "";

    const ranks = boardOrientation === "w"
        ? [8, 7, 6, 5, 4, 3, 2, 1]
        : [1, 2, 3, 4, 5, 6, 7, 8];

    const files = boardOrientation === "w"
        ? ["a", "b", "c", "d", "e", "f", "g", "h"]
        : ["h", "g", "f", "e", "d", "c", "b", "a"];

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const squareName = files[col] + ranks[row];
            const piece = chessGame.get(squareName);

            const square = document.createElement("div");

            const isLight = (row + col) % 2 === 0;

            square.className =
                "square " + (isLight ? "light" : "dark");

            if (selectedSquare === squareName) {
                square.classList.add("selected");
            }

            if (possibleMoves.includes(squareName)) {
                square.classList.add("target");
            }

            if (
                previousMove &&
                (
                    previousMove.from === squareName ||
                    previousMove.to === squareName
                )
            ) {
                square.classList.add("last-move");
            }

            if (piece) {
                square.textContent =
                    chessSymbols[piece.color][piece.type];
            }

            square.dataset.square = squareName;

            square.addEventListener("click", () => {
                handleSquareClick(squareName);
            });

            board.appendChild(square);
        }
    }

    updateBoardTurn();
}

function updateBoardTurn() {
    const turn = chessGame.turn() === "w" ? "WHITE" : "BLACK";

    $("board-turn").textContent = turn + " TO MOVE";
}

// =============================================
// PLAYER INPUT
// =============================================

function handleSquareClick(squareName) {
    if (!chessGame || puzzleCompleted) return;

    if (solutionPosition >= puzzleSolution.length) return;

    const piece = chessGame.get(squareName);

    // A piece is already selected.
    if (selectedSquare) {
        if (possibleMoves.includes(squareName)) {
            attemptMove(selectedSquare, squareName);
            return;
        }
    }

    // Select a piece belonging to the player.
    if (piece && piece.color === chessGame.turn()) {
        selectedSquare = squareName;

        const moves = chessGame.moves({
            square: squareName,
            verbose: true
        });

        possibleMoves = moves.map(move => move.to);

    } else {
        selectedSquare = null;
        possibleMoves = [];
    }

    renderBoard();
}

// =============================================
// PUZZLE MOVE CHECKING
// =============================================

function attemptMove(from, to) {
    const expected = puzzleSolution[solutionPosition];

    if (!expected) return;

    if (
        expected.from !== from ||
        expected.to !== to
    ) {
        $("puzzle-status").textContent =
            "Not quite! Think again and try another move.";

        selectedSquare = null;
        possibleMoves = [];

        renderBoard();
        return;
    }

    const playedMove = chessGame.move({
        from: from,
        to: to,
        promotion: "q"
    });

    if (!playedMove) return;

    previousMove = {
        from: from,
        to: to
    };

    solutionPosition++;

    selectedSquare = null;
    possibleMoves = [];

    $("puzzle-status").textContent =
        "Correct move! Great calculation.";

    $("puzzle-progress").textContent =
        solutionPosition + " / " + puzzleSolution.length + " MOVES";

    renderBoard();

    // The opponent's reply is played automatically.
    if (solutionPosition < puzzleSolution.length) {
        playOpponentMove();
    } else {
        completePuzzle();
    }
}

// =============================================
// OPPONENT RESPONSE
// =============================================

function playOpponentMove() {
    const reply = puzzleSolution[solutionPosition];

    if (!reply) {
        completePuzzle();
        return;
    }

    const move = chessGame.move({
        from: reply.from,
        to: reply.to,
        promotion: reply.promotion || "q"
    });

    if (!move) {
        $("puzzle-status").textContent =
            "There was a problem with this puzzle's move data.";

        return;
    }

    previousMove = {
        from: reply.from,
        to: reply.to
    };

    solutionPosition++;

    renderBoard();

    if (solutionPosition >= puzzleSolution.length) {
        completePuzzle();
    } else {
        $("puzzle-status").textContent =
            "Your opponent replied. Find the next move!";
    }

    $("puzzle-progress").textContent =
        solutionPosition + " / " + puzzleSolution.length + " MOVES";
}

// =============================================
// PUZZLE COMPLETION
// =============================================

function completePuzzle() {
    puzzleCompleted = true;

    $("puzzle-status").textContent =
        "Puzzle solved! Excellent chess calculation!";

    $("puzzle-progress").textContent = "COMPLETED";

    $("puzzle-description").textContent =
        "You found the complete solution. Well played!";
}

// =============================================
// HINT SYSTEM
// =============================================

function giveHint() {
    if (
        !chessGame ||
        puzzleCompleted ||
        !puzzleSolution[solutionPosition]
    ) {
        return;
    }

    const nextMove = puzzleSolution[solutionPosition];

    $("puzzle-status").textContent =
        "Hint: Look at the piece on square " +
        nextMove.from.toUpperCase() + ".";
}

// =============================================
// RESET BOARD
// =============================================

function resetPuzzle() {
    if (!initialPosition || !puzzleSolution.length) return;

    chessGame = new Chess(initialPosition);

    solutionPosition = 0;
    selectedSquare = null;
    possibleMoves = [];
    previousMove = null;
    puzzleCompleted = false;

    $("puzzle-status").textContent =
        "Board reset. Find the first move!";

    $("puzzle-progress").textContent = "0 MOVES";

    renderBoard();
}

// =============================================
// LICHESS DAILY PUZZLE
// =============================================

async function loadDailyPuzzle() {
    const title = $("puzzle-title");
    const description = $("puzzle-description");
    const status = $("puzzle-status");

    title.textContent = "Loading daily puzzle...";
    status.textContent = "Connecting to Lichess...";

    puzzleCompleted = false;
    puzzleSolution = [];
    solutionPosition = 0;

    try {
        const response = await fetch(API.dailyPuzzle);

        if (!response.ok) {
            throw new Error("Daily puzzle request failed.");
        }

        const data = await response.json();

        if (!data.puzzle || !data.game) {
            throw new Error("Invalid puzzle response.");
        }

        // Parse the game history.
        const historyGame = new Chess();

        const loaded = historyGame.load_pgn(data.game.pgn);

        if (!loaded) {
            throw new Error("Could not read the puzzle game.");
        }

        const history = historyGame.history({
            verbose: true
        });

        // Recreate the position at the puzzle's initial ply.
        const position = new Chess();

        const initialPly = data.puzzle.initialPly;

        for (let i = 0; i < initialPly; i++) {
            const move = history[i];

            if (!move) {
                throw new Error("Incomplete puzzle history.");
            }

            position.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion
            });
        }

        // Convert the Lichess UCI solution to chess moves.
        const rawSolution = data.puzzle.solution;

        puzzleSolution = rawSolution.map(uci => ({
            from: uci.substring(0, 2),
            to: uci.substring(2, 4),
            promotion: uci.substring(4, 5) || "q"
        }));

        if (!puzzleSolution.length) {
            throw new Error("Puzzle solution is empty.");
        }

        chessGame = position;
        initialPosition = position.fen();

        boardOrientation = position.turn();

        selectedSquare = null;
        possibleMoves = [];
        previousMove = null;
        solutionPosition = 0;
        puzzleCompleted = false;

        // Puzzle information.
        title.textContent = "Daily chess challenge";

        description.textContent =
            "Find the strongest continuation. Every move matters.";

        $("puzzle-rating").textContent =
            "RATING " + data.puzzle.rating;

        $("puzzle-rating-value").textContent =
            data.puzzle.rating;

        $("puzzle-player").textContent =
            boardOrientation === "w"
                ? "WHITE TO MOVE"
                : "BLACK TO MOVE";

        $("puzzle-progress").textContent =
            "0 / " + puzzleSolution.length + " MOVES";

        $("puzzle-source").href =
            "https://lichess.org/training/" + data.puzzle.id;

        $("puzzle-status").textContent =
            "Your turn! Find the best move.";

        renderBoard();

    } catch (error) {
        console.error("Daily puzzle error:", error);

        title.textContent = "Puzzle unavailable";

        description.textContent =
            "The daily challenge could not be loaded.";

        status.textContent =
            "Check your internet connection and refresh the page.";

        $("puzzle-rating").textContent = "OFFLINE";
        $("puzzle-rating-value").textContent = "---";

        $("chessboard").innerHTML = `
            <div class="loading-message">
                Could not load the chessboard.
            </div>
        `;
    }
}

// =============================================
// NAVIGATION ACTIVE STATE
// =============================================

function setupNavigation() {
    const links = document.querySelectorAll(".nav-link");

    links.forEach(link => {
        link.addEventListener("click", () => {
            links.forEach(item => {
                item.classList.remove("active");
            });

            link.classList.add("active");
        });
    });
}

// =============================================
// BUTTON EVENTS
// =============================================

function setupButtons() {
    $("refresh-leaderboard").addEventListener(
        "click",
        loadLeaderboard
    );

    $("hint-button").addEventListener(
        "click",
        giveHint
    );

    $("reset-button").addEventListener(
        "click",
        resetPuzzle
    );
}

// =============================================
// INITIALIZE APPLICATION
// =============================================

function initializeChessWorld() {
    updateDate();
    setupNavigation();
    setupButtons();

    loadLeaderboard();
    loadDailyPuzzle();
}

document.addEventListener(
    "DOMContentLoaded",
    initializeChessWorld
);
