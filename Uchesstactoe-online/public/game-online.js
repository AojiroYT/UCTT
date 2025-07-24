const board = document.getElementById("board");
const turnIndicator = document.getElementById("turnIndicator");
let currentPlayer = 1;
let selectedPiece = null;
let validMoves = [];
let enPassantTarget = null; // {row, col} if available
let hasMoved = {}; // Track if king/rooks have moved for castling

const socket = io(window.location.hostname === "localhost" ? "" : "https://uctt.onrender.com");

// 盤を作成
function createBoard() {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      // Reverse row index for display so white is at the bottom
      const displayRow = 8 - row;
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = displayRow;
      cell.dataset.col = col;
      // Add chessboard pattern
      if ((displayRow + col) % 2 === 1) cell.classList.add("black-square");
      if (row % 3 === 0) cell.classList.add("top-border");
      if (col % 3 === 0) cell.classList.add("left-border");
      if (col === 8) cell.classList.add("right-border");
      if (row === 8) cell.classList.add("bottom-border");
      board.appendChild(cell);
    }
  }
}

// 2. 初期配置マップ
const boardLayouts = [
  // Set 1 (main)
  [
    ['rook', 'knight', 'bishop', 'king', 'queen', 'bishop', 'knight', 'rook', ''],
    ['pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn'],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn'],
    ['rook', 'knight', 'bishop', 'king', 'queen', 'bishop', 'knight', 'rook', '']
  ],
  // Set 2 (optional)
  [
    ['rook', 'knight', 'bishop', 'queen', 'king', 'queen', 'bishop', 'knight', 'rook'],
    ['rook', 'knight', 'bishop', 'pawn', 'pawn', 'pawn', 'bishop', 'knight', 'rook'],
    ['pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn'],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn'],
    ['rook', 'knight', 'bishop', 'pawn', 'pawn', 'pawn', 'bishop', 'knight', 'rook'],
    ['rook', 'knight', 'bishop', 'queen', 'king', 'queen', 'bishop', 'knight', 'rook']
  ]
];

let initialPositions = JSON.parse(JSON.stringify(boardLayouts[0])); // Default to Set 1

function setInitialPositionsFromLayout(layoutIdx) {
  initialPositions = JSON.parse(JSON.stringify(boardLayouts[layoutIdx]));
}

// Helper to get board's position and size
function getBoardRect() {
  return board.getBoundingClientRect();
}

// Show board selector as overlay centered on the board
function showBoardSelector(onSelect, message = 'Choose a board layout:') {
  // Remove any existing selector
  const old = document.getElementById('boardSelectorOverlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'boardSelectorOverlay';
  overlay.style.position = 'fixed';
  const boardRect = getBoardRect();
  overlay.style.left = boardRect.left + 'px';
  overlay.style.top = boardRect.top + 'px';
  overlay.style.width = boardRect.width + 'px';
  overlay.style.height = boardRect.height + 'px';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = 2000;
  overlay.style.background = 'rgba(0,0,0,0.25)';
  const dialog = document.createElement('div');
  dialog.style.background = '#fff';
  dialog.style.border = '2px solid #333';
  dialog.style.padding = '20px';
  dialog.style.display = 'flex';
  dialog.style.flexDirection = 'column';
  dialog.style.alignItems = 'center';
  dialog.style.gap = '12px';
  const label = document.createElement('div');
  label.textContent = message;
  label.style.marginBottom = '8px';
  dialog.appendChild(label);
  boardLayouts.forEach((layout, idx) => {
    const btn = document.createElement('button');
    btn.textContent = idx === 0 ? 'Set 1' : 'Set 2';
    btn.style.margin = '0 8px';
    btn.onclick = () => {
      onSelect(idx);
      overlay.remove();
    };
    dialog.appendChild(btn);
  });
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}

function resetBoard() {
  // Remove all pieces and cells
  board.innerHTML = '';
  createBoard();
  // Re-append SVG overlay if not present
  if (!document.getElementById('annotationOverlay')) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'annotationOverlay');
    svg.setAttribute('style', 'width:100%; height:100%; position:absolute; top:0; left:0; z-index:5; pointer-events:none;');
    board.appendChild(svg);
  }
  placePieces();
  initializeTransparency();
  // Reset game state
  currentPlayer = 1;
  selectedPiece = null;
  validMoves = [];
  enPassantTarget = null;
  hasMoved = {};
  fieldOwners = Array(9).fill(null);
  updateFieldVisuals();
  redrawAnnotations();
  setupBoardEvents();
}

// Override placePieces to use current initialPositions
function placePieces() {
  const cells = document.querySelectorAll('.cell');
  cells.forEach(cell => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const piece = initialPositions[row][col];
    if (piece) {
      const color = getPieceColor(row);
      const pieceElem = document.createElement('div');
      pieceElem.classList.add('piece', color, piece);
      // Add image
      const img = document.createElement('img');
      img.src = `${color}_${piece}.png`;
      img.alt = `${color} ${piece}`;
      pieceElem.appendChild(img);
      cell.appendChild(pieceElem);
    }
  });
}

// 3. 色を決める
function getPieceColor(row) {
    if (row <= 2) return 'white';  
    if (row >= 6) return 'black';  
    return '';
  }

// ハイライトの削除
function clearHighlights() {
  document.querySelectorAll('.highlight').forEach(cell => {
    cell.classList.remove('highlight');
  });
}

function getPieceId(row, col) {
  return `${row},${col}`;
}

function getValidMoves(pieceElem, row, col) {
  const type = [...pieceElem.classList].find(cls =>
    ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'].includes(cls)
  );
  const color = pieceElem.classList.contains('white') ? 'white' : 'black';
  const opponentColor = color === 'white' ? 'black' : 'white';
  const moves = [];

  function pushIfValid(r, c, captureOnly = false, moveOnly = false, enPassant = false) {
    if (r < 0 || r > 8 || c < 0 || c > 8) return;
    const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
    if (!cell) return;
    const targetPiece = cell.querySelector('.piece');
    if (enPassant) {
      moves.push(cell);
      return;
    }
    if (targetPiece) {
      if (targetPiece.classList.contains(opponentColor) && !moveOnly) {
        moves.push(cell); // can capture
      }
      // Block further movement in this direction
      return 'blocked';
    } else {
      if (!captureOnly) moves.push(cell); // can move
      return 'empty';
    }
  }

  if (type === 'pawn') {
    const dir = color === 'white' ? 1 : -1;
    // Allow double-move from both 1st and 2nd rank for white, 6th and 7th for black
    const startRows = color === 'white' ? [1,2] : [6,7];
    if (pushIfValid(row + dir, col, false, true) === 'empty') {
      if (startRows.includes(row) && pushIfValid(row + dir * 2, col, false, true) === 'empty') {
        moves.push(document.querySelector(`.cell[data-row="${row + dir * 2}"][data-col="${col}"]`));
      }
    }
    // Diagonal captures
    pushIfValid(row + dir, col - 1, true);
    pushIfValid(row + dir, col + 1, true);
    // En passant
    if (enPassantTarget) {
      if (Math.abs(enPassantTarget.col - col) === 1 && enPassantTarget.row === row + dir) {
        if (color === 'white' && (row === 4 || row === 3)) pushIfValid(row + dir, enPassantTarget.col, false, false, true);
        if (color === 'black' && (row === 3 || row === 4)) pushIfValid(row + dir, enPassantTarget.col, false, false, true);
      }
    }
  }

  if (type === 'rook') {
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row + d, col) === 'blocked') break;
    }
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row - d, col) === 'blocked') break;
    }
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row, col + d) === 'blocked') break;
    }
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row, col - d) === 'blocked') break;
    }
  }

  if (type === 'bishop') {
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row + d, col + d) === 'blocked') break;
    }
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row + d, col - d) === 'blocked') break;
    }
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row - d, col + d) === 'blocked') break;
    }
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row - d, col - d) === 'blocked') break;
    }
  }

  if (type === 'queen') {
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row + d, col) === 'blocked') break;
    }
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row - d, col) === 'blocked') break;
    }
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row, col + d) === 'blocked') break;
    }
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row, col - d) === 'blocked') break;
    }
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row + d, col + d) === 'blocked') break;
    }
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row + d, col - d) === 'blocked') break;
    }
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row - d, col + d) === 'blocked') break;
    }
    for (let d = 1; d < 9; d++) {
      if (pushIfValid(row - d, col - d) === 'blocked') break;
    }
  }

  if (type === 'knight') {
    const offsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    for (const [dr, dc] of offsets) {
      pushIfValid(row + dr, col + dc);
    }
  }

  if (type === 'king') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        pushIfValid(row + dr, col + dc);
      }
    }
    // Flexible Castling: find nearest rook to left and right
    const kingId = getPieceId(row, col);
    if (!hasMoved[kingId]) {
      // Right side (kingside)
      for (let rookCol = col + 1; rookCol < 9; rookCol++) {
        const rookCell = document.querySelector(`.cell[data-row="${row}"][data-col="${rookCol}"]`);
        const rook = rookCell && rookCell.querySelector('.piece');
        if (rook) {
          if (rook.classList.contains(color) && rook.classList.contains('rook') && !hasMoved[getPieceId(row, rookCol)]) {
            // Check if path is clear
            let clear = true;
            for (let c = col + 1; c < rookCol; c++) {
              if (document.querySelector(`.cell[data-row="${row}"][data-col="${c}"]`).querySelector('.piece')) clear = false;
            }
            if (clear) moves.push(document.querySelector(`.cell[data-row="${row}"][data-col="${col + 2}"]`));
          }
          break; // stop at first piece
        }
      }
      // Left side (queenside)
      for (let rookCol = col - 1; rookCol >= 0; rookCol--) {
        const rookCell = document.querySelector(`.cell[data-row="${row}"][data-col="${rookCol}"]`);
        const rook = rookCell && rookCell.querySelector('.piece');
        if (rook) {
          if (rook.classList.contains(color) && rook.classList.contains('rook') && !hasMoved[getPieceId(row, rookCol)]) {
            // Check if path is clear
            let clear = true;
            for (let c = rookCol + 1; c < col; c++) {
              if (document.querySelector(`.cell[data-row="${row}"][data-col="${c}"]`).querySelector('.piece')) clear = false;
            }
            if (clear) moves.push(document.querySelector(`.cell[data-row="${row}"][data-col="${col - 2}"]`));
          }
          break; // stop at first piece
        }
      }
    }
  }

  return moves;
}

// --- Custom Chess-Tac-Toe Logic ---
// Field definitions (top-left of each 3x3 field)
const fieldCoords = [
  [0,0],[0,3],[0,6],
  [3,0],[3,3],[3,6],
  [6,0],[6,3],[6,6]
];
// Track field ownership: 'white', 'black', or null
let fieldOwners = Array(9).fill(null);
// Track which pieces have left their base (not transparent)
function isInBase(piece, row, color) {
  if (piece.classList.contains('pawn')) {
    // Pawns become opaque when reaching rows 3,4,5 (mid-rank)
    return !(row >= 3 && row <= 5);
  } else {
    // Other pieces: opaque after first move
    return !piece.dataset.hasMoved;
  }
}
function setPieceTransparency(piece, transparent) {
  if (transparent) {
    piece.classList.add('transparent');
    piece.dataset.transparent = 'true';
  } else {
    piece.classList.remove('transparent');
    piece.dataset.transparent = 'false';
  }
}
// Update all pieces' transparency at start: all pieces transparent
function initializeTransparency() {
  document.querySelectorAll('.piece').forEach(piece => {
    setPieceTransparency(piece, true);
    piece.dataset.hasMoved = '';
  });
}
// Check if a piece is transparent
function isTransparent(piece) {
  return piece.dataset.transparent === 'true';
}
// After a move, update transparency: pawns become opaque at mid-rank, others after first move
function updateTransparencyAfterMove(piece, toRow) {
  const color = piece.classList.contains('white') ? 'white' : 'black';
  if (piece.classList.contains('pawn')) {
    if (toRow >= 3 && toRow <= 5) setPieceTransparency(piece, false);
  } else {
    if (!piece.dataset.hasMoved) {
      piece.dataset.hasMoved = 'true';
      setPieceTransparency(piece, false);
    }
  }
}
// --- Field detection and ownership ---
function getFieldIndex(row, col) {
  return Math.floor(row/3)*3 + Math.floor(col/3);
}
function getFieldCells(fieldIdx) {
  const [startRow, startCol] = fieldCoords[fieldIdx];
  let cells = [];
  for (let r = startRow; r < startRow+3; r++) {
    for (let c = startCol; c < startCol+3; c++) {
      cells.push(document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`));
    }
  }
  return cells;
}
function checkFieldControl(fieldIdx) {
  const cells = getFieldCells(fieldIdx);
  // Build 3x3 grid of pieces (null if empty or transparent)
  let grid = Array(3).fill(null).map(()=>Array(3).fill(null));
  for (let i=0; i<9; i++) {
    const piece = cells[i].querySelector('.piece');
    if (piece && !isTransparent(piece)) {
      grid[Math.floor(i/3)][i%3] = piece.classList.contains('white') ? 'white' : 'black';
    }
  }
  // Check all lines for three in a row (no pawn rule)
  let winner = null;
  // Rows
  for (let r=0; r<3; r++) {
    if (grid[r][0] && grid[r][0] === grid[r][1] && grid[r][1] === grid[r][2]) {
      winner = grid[r][0];
    }
  }
  // Columns
  for (let c=0; c<3; c++) {
    if (grid[0][c] && grid[0][c] === grid[1][c] && grid[1][c] === grid[2][c]) {
      winner = grid[0][c];
    }
  }
  // Diagonals
  if (grid[0][0] && grid[0][0] === grid[1][1] && grid[1][1] === grid[2][2]) {
    winner = grid[0][0];
  }
  if (grid[0][2] && grid[0][2] === grid[1][1] && grid[1][1] === grid[2][0]) {
    winner = grid[0][2];
  }
  // Update field owner
  if (winner && fieldOwners[fieldIdx] !== winner) {
    fieldOwners[fieldIdx] = winner;
    playSEByPriority(['win_a_field']);
  }
}
function updateAllFieldControl() {
  for (let i=0; i<9; i++) checkFieldControl(i);
}
// Check for Tic-Tac-Toe win
function checkTicTacToeWin(playerColor) {
  // Build 3x3 grid of field owners
  let grid = [
    [fieldOwners[0],fieldOwners[1],fieldOwners[2]],
    [fieldOwners[3],fieldOwners[4],fieldOwners[5]],
    [fieldOwners[6],fieldOwners[7],fieldOwners[8]]
  ];
  for (let i=0; i<3; i++) {
    // Rows
    if (grid[i][0] === playerColor && grid[i][1] === playerColor && grid[i][2] === playerColor) return playerColor;
    // Columns
    if (grid[0][i] === playerColor && grid[1][i] === playerColor && grid[2][i] === playerColor) return playerColor;
  }
  // Diagonals
  if (grid[0][0] === playerColor && grid[1][1] === playerColor && grid[2][2] === playerColor) return playerColor;
  if (grid[0][2] === playerColor && grid[1][1] === playerColor && grid[2][0] === playerColor) return playerColor;
  return null;
}
// Show field ownership visually
function updateFieldVisuals() {
  for (let i=0; i<9; i++) {
    const cells = getFieldCells(i);
    cells.forEach(cell => {
      cell.classList.remove('field-white','field-black');
      if (fieldOwners[i] === 'white') cell.classList.add('field-white');
      if (fieldOwners[i] === 'black') cell.classList.add('field-black');
    });
  }
}
// --- End Custom Chess-Tac-Toe Logic ---

// Promotion dialog exactly on the pawn's square
function showPromotionDialog(color, cell, pieceElem) {
  return new Promise(resolve => {
    // Remove any existing dialog
    const oldDialog = document.getElementById('promotionDialog');
    if (oldDialog) oldDialog.remove();
    // Get cell position relative to viewport
    const cellRect = cell.getBoundingClientRect();
    const dialog = document.createElement('div');
    dialog.id = 'promotionDialog';
    dialog.style.position = 'fixed';
    dialog.style.left = cellRect.left + 'px';
    dialog.style.top = cellRect.top + 'px';
    dialog.style.width = cellRect.width + 'px';
    dialog.style.height = cellRect.height + 'px';
    dialog.style.background = 'rgba(255,255,255,0.95)';
    dialog.style.border = '2px solid #333';
    dialog.style.display = 'grid';
    dialog.style.gridTemplateColumns = '1fr 1fr';
    dialog.style.gridTemplateRows = '1fr 1fr';
    dialog.style.alignItems = 'center';
    dialog.style.justifyItems = 'center';
    dialog.style.zIndex = 3000;
    dialog.style.gap = '4px';
    const pieces = ['queen','rook','bishop','knight'];
    pieces.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.style.background = 'none';
      btn.style.border = 'none';
      btn.style.cursor = 'pointer';
      btn.style.padding = '0';
      btn.style.outline = 'none';
      btn.style.width = '40px';
      btn.style.height = '40px';
      const img = document.createElement('img');
      img.src = `${color}_${p}.png`;
      img.alt = p;
      img.style.width = '100%';
      img.style.height = '100%';
      btn.appendChild(img);
      btn.onclick = () => {
        dialog.remove();
        resolve(p);
      };
      dialog.appendChild(btn);
    });
    document.body.appendChild(dialog);
  });
}

// Show game over dialog centered on the board
function showGameOverDialog(message) {
  showGameButtons(false);
  // Remove any existing dialog
  const oldDialog = document.getElementById('gameOverDialog');
  if (oldDialog) oldDialog.remove();

  // --- Fix: Always get board position, even if hidden ---
  // Temporarily show board if hidden to get position
  let restoreBoardDisplay = null;
  if (boardDiv.style.display === 'none') {
    restoreBoardDisplay = true;
    boardDiv.style.display = '';
  }
  const boardRect = getBoardRect();
  if (restoreBoardDisplay) {
    boardDiv.style.display = 'none';
  }

  const overlay = document.createElement('div');
  overlay.id = 'gameOverDialog';
  overlay.style.position = 'fixed';
  overlay.style.left = boardRect.left + 'px';
  overlay.style.top = boardRect.top + 'px';
  overlay.style.width = boardRect.width + 'px';
  overlay.style.height = boardRect.height + 'px';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = 2000;
  overlay.style.background = 'rgba(0,0,0,0.25)';
  const dialog = document.createElement('div');
  dialog.style.background = '#fff';
  dialog.style.border = '2px solid #333';
  dialog.style.padding = '20px';
  dialog.style.display = 'flex';
  dialog.style.flexDirection = 'column';
  dialog.style.alignItems = 'center';
  dialog.style.gap = '16px';
  const msg = document.createElement('div');
  msg.textContent = message;
  msg.style.fontSize = '1.2em';
  dialog.appendChild(msg);
  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '12px';
  const seeBtn = document.createElement('button');
  seeBtn.textContent = 'See result';
  seeBtn.onclick = () => overlay.remove();
  const againBtn = document.createElement('button');
  againBtn.textContent = 'Play again';
  againBtn.onclick = () => {
    overlay.remove();
    showBoardSelector(idx => {
      setInitialPositionsFromLayout(idx);
      resetBoard();
    }, 'Choose a board layout for the next game:');
  };
  btnRow.appendChild(seeBtn);
  btnRow.appendChild(againBtn);
  dialog.appendChild(btnRow);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  // Hide board after overlay is shown (if needed)
  if (restoreBoardDisplay) {
    setTimeout(() => { boardDiv.style.display = 'none'; }, 0);
  }
}

// --- Annotation logic ---
const annotationHighlights = new Set();
let annotationArrows = [];
let arrowStartCell = null;

function getCellKey(row, col) {
  return `${row},${col}`;
}

function getCellCenter(row, col, useMiddle) {
  const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
  if (!cell) return {x:0, y:0};
  const rect = cell.getBoundingClientRect();
  // Use board's offset for SVG overlay alignment
  const boardRect = {
    left: board.offsetLeft,
    top: board.offsetTop
  };
  return {
    x: cell.offsetLeft + cell.offsetWidth/2,
    y: cell.offsetTop + cell.offsetHeight/2
  };
}

function redrawAnnotations() {
  // Highlights
  document.querySelectorAll('.cell').forEach(cell => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const key = getCellKey(row, col);
    if (annotationHighlights.has(key)) {
      cell.classList.add('annotation-highlight');
    } else {
      cell.classList.remove('annotation-highlight');
    }
  });
  // Arrows
  const svg = document.getElementById('annotationOverlay');
  svg.innerHTML = '<defs><marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto" markerUnits="strokeWidth"><polygon points="0 0, 6 2, 0 4" fill="orange"/></marker></defs>';
  annotationArrows.forEach(({from, to}) => {
    const start = getCellCenter(from.row, from.col, true);
    const end = getCellCenter(to.row, to.col, true);
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1', start.x);
    line.setAttribute('y1', start.y);
    line.setAttribute('x2', end.x);
    line.setAttribute('y2', end.y);
    line.setAttribute('class', 'annotation-arrow');
    svg.appendChild(line);
  });
}

function setupBoardEvents() {
  const boardDiv = document.getElementById('board');

  // Remove previous annotation listeners if needed
  boardDiv.oncontextmenu = null;
  boardDiv.onmousedown = null;
  boardDiv.onmouseup = null;
  boardDiv.onclick = null;

  // Annotation logic
  boardDiv.addEventListener('contextmenu', e => {
    e.preventDefault();
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const key = getCellKey(row, col);
    if (annotationHighlights.has(key)) {
      annotationHighlights.delete(key);
    } else {
      annotationHighlights.add(key);
    }
    redrawAnnotations();
  });

  let arrowStartCell = null;
  boardDiv.addEventListener('mousedown', e => {
    if (e.button !== 2) return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    arrowStartCell = cell;
  });
  boardDiv.addEventListener('mouseup', e => {
    if (e.button !== 2) return;
    if (!arrowStartCell) return;
    const startCell = arrowStartCell;
    arrowStartCell = null;
    const endCell = e.target.closest('.cell');
    if (!endCell || endCell === startCell) return;
    const from = {row: Number(startCell.dataset.row), col: Number(startCell.dataset.col)};
    const to = {row: Number(endCell.dataset.row), col: Number(endCell.dataset.col)};
    annotationArrows.push({from, to});
    redrawAnnotations();
  });

  // --- Piece movement logic (moved from global scope) ---
  boardDiv.addEventListener('click', async (e) => {
    // If right-click, ignore (handled by annotation)
    if (e.button === 2) return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const pieceElem = cell.querySelector('.piece');
    // 駒選択（自分の駒のみ、かつ非透明でなくても選択可）
    if (pieceElem && pieceElem.classList.contains(currentPlayer === 1 ? 'white' : 'black')) {
      clearHighlights();
      selectedPiece = pieceElem;
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      validMoves = getValidMoves(pieceElem, row, col);
      validMoves.forEach(c => c.classList.add('highlight'));
      return;
    }
    // ハイライトされたマスに移動
    if (selectedPiece && cell.classList.contains('highlight')) {
      // Remove previous last-move highlights
      document.querySelectorAll('.last-move').forEach(c => c.classList.remove('last-move'));
      // Remove opponent piece if present
      const captured = cell.querySelector('.piece');
      const fromCell = selectedPiece.parentElement;
      if (!fromCell) {
        clearHighlights();
        selectedPiece = null;
        validMoves = [];
        return;
      }
      const fromRow = Number(fromCell.dataset.row);
      const fromCol = Number(fromCell.dataset.col);
      const toRow = Number(cell.dataset.row);
      const toCol = Number(cell.dataset.col);
      const isPawn = selectedPiece.classList.contains('pawn');
      const color = selectedPiece.classList.contains('white') ? 'white' : 'black';
      // En passant capture
      if (isPawn && enPassantTarget && toRow === enPassantTarget.row && toCol === enPassantTarget.col) {
        // Remove the pawn being captured en passant
        const epRow = color === 'white' ? toRow - 1 : toRow + 1;
        const epCell = document.querySelector(`.cell[data-row="${epRow}"][data-col="${toCol}"]`);
        const epPawn = epCell && epCell.querySelector('.piece');
        if (epPawn && epPawn.classList.contains('pawn') && epPawn.classList.contains(color === 'white' ? 'black' : 'white')) {
          epPawn.remove();
        }
      }
      // Castling
      let didCastle = false;
      if (selectedPiece.classList.contains('king') && Math.abs(toCol - fromCol) === 2) {
        // Flexible castling: find rook to the left or right
        if (toCol > fromCol) {
          // Kingside (right)
          let rookCol = null;
          for (let c = fromCol + 1; c < 9; c++) {
            const rookCell = document.querySelector(`.cell[data-row="${fromRow}"][data-col="${c}"]`);
            const rook = rookCell && rookCell.querySelector('.piece');
            if (rook && rook.classList.contains('rook') && rook.classList.contains(color)) {
              rookCol = c;
              break;
            }
          }
          if (rookCol !== null) {
            const rookFrom = document.querySelector(`.cell[data-row="${fromRow}"][data-col="${rookCol}"]`);
            const rookTo = document.querySelector(`.cell[data-row="${fromRow}"][data-col="${toCol - 1}"]`);
            const rook = rookFrom && rookFrom.querySelector('.piece');
            if (rook) rookTo.appendChild(rook);
          }
        } else {
          // Queenside (left)
          let rookCol = null;
          for (let c = fromCol - 1; c >= 0; c--) {
            const rookCell = document.querySelector(`.cell[data-row="${fromRow}"][data-col="${c}"]`);
            const rook = rookCell && rookCell.querySelector('.piece');
            if (rook && rook.classList.contains('rook') && rook.classList.contains(color)) {
              rookCol = c;
              break;
            }
          }
          if (rookCol !== null) {
            const rookFrom = document.querySelector(`.cell[data-row="${fromRow}"][data-col="${rookCol}"]`);
            const rookTo = document.querySelector(`.cell[data-row="${fromRow}"][data-col="${toCol + 1}"]`);
            const rook = rookFrom && rookFrom.querySelector('.piece');
            if (rook) rookTo.appendChild(rook);
          }
        }
        didCastle = true;
      }
      // Remove captured piece (normal capture)
      if (captured && !captured.classList.contains(currentPlayer === 1 ? 'white' : 'black')) {
        captured.remove();
      }
      // Pawn promotion
      const targetRow = toRow;
      if (isPawn && ((color === 'white' && targetRow === 8) || (color === 'black' && targetRow === 0))) {
        // Show promotion dialog
        const chosen = await showPromotionDialog(color, cell, selectedPiece);
        // Remove all piece type classes
        selectedPiece.classList.remove('pawn','queen','rook','bishop','knight');
        selectedPiece.classList.add(chosen);
        // Change image
        const img = selectedPiece.querySelector('img');
        img.src = `${color}_${chosen}.png`;
        img.alt = `${color} ${chosen}`;
      }
      cell.appendChild(selectedPiece);
      // Track moved king/rook for castling
      if (selectedPiece.classList.contains('king') || selectedPiece.classList.contains('rook')) {
        hasMoved[getPieceId(toRow, toCol)] = true;
      }
      // Track en passant target
      if (isPawn && Math.abs(toRow - fromRow) === 2) {
        enPassantTarget = { row: (toRow + fromRow) / 2, col: toCol };
      } else {
        enPassantTarget = null;
      }
      // --- Custom logic: update transparency, field control, and check win ---
      updateTransparencyAfterMove(selectedPiece, toRow);
      updateAllFieldControl();
      updateFieldVisuals();
      // Highlight last move
      fromCell.classList.add('last-move');
      cell.classList.add('last-move');
      // Collect SE events
      let seEvents = [];
      // Check for king capture
      let kingExists = {white: false, black: false};
      document.querySelectorAll('.piece.king').forEach(king => {
        if (!king.parentElement) return;
        if (king.classList.contains('white')) kingExists.white = true;
        if (king.classList.contains('black')) kingExists.black = true;
      });
      if (checkmateEnabled) {
        if (!kingExists.white) {
          seEvents.push('game over');
          playSEByPriority(seEvents);
          showGameOverDialog('Black wins by capturing the king!');
          return;
        }
        if (!kingExists.black) {
          seEvents.push('game over');
          playSEByPriority(seEvents);
          showGameOverDialog('White wins by capturing the king!');
          return;
        }
      } else {
        // If a player has no pieces left (including king), they lose
        const whitePieces = Array.from(document.querySelectorAll('.piece.white'));
        const blackPieces = Array.from(document.querySelectorAll('.piece.black'));
        if (whitePieces.length === 0) {
          seEvents.push('game over');
          playSEByPriority(seEvents);
          showGameOverDialog('White has no pieces left! Black wins!');
          return;
        }
        if (blackPieces.length === 0) {
          seEvents.push('game over');
          playSEByPriority(seEvents);
          showGameOverDialog('Black has no pieces left! White wins!');
          return;
        }
      }
      // Check for Tic-Tac-Toe win
      const tttWinner = checkTicTacToeWin(color);
      if (tttWinner) {
        seEvents.push('game over');
        playSEByPriority(seEvents);
        showGameOverDialog(`${tttWinner.charAt(0).toUpperCase() + tttWinner.slice(1)} wins by Tic-Tac-Toe!`);
        return;
      }
      // Check for check
      const oppColor = color === 'white' ? 'black' : 'white';
      if (isKingInCheck(oppColor)) {
        seEvents.push('check');
      }
      // Promotion
      if (isPawn && ((color === 'white' && targetRow === 8) || (color === 'black' && targetRow === 0))) {
        seEvents.push('promotion');
      }
      // Take
      if ((captured && !captured.classList.contains(currentPlayer === 1 ? 'white' : 'black')) || (isPawn && enPassantTarget && toRow === enPassantTarget.row && toCol === enPassantTarget.col)) {
        seEvents.push('take');
      }
      // win_a_field is handled in checkFieldControl
      // Always add move as fallback
      seEvents.push('move');
      playSEByPriority(seEvents);
      // --- End custom logic ---
      clearHighlights();
      selectedPiece = null;
      validMoves = [];
      currentPlayer = currentPlayer === 1 ? 2 : 1;
      playSEByPriority(['move']);
    } else {
      // 無効クリック：選択解除
      clearHighlights();
      selectedPiece = null;
      validMoves = [];
    }
    // --- End piece movement logic ---
    // --- Annotation clear logic ---
    annotationHighlights.clear();
    annotationArrows = [];
    redrawAnnotations();
  });
}

// --- Sound Effects ---
let seQueue = [];
let sePlaying = false;
function playSEPriority(name) {
  seQueue.push(name);
  playNextSE();
}
function playNextSE() {
  if (sePlaying || seQueue.length === 0) return;
  sePlaying = true;
  const name = seQueue.shift();
  const audio = new Audio(`${name}.mp3`);
  audio.volume = 0.5;
  audio.onended = () => {
    sePlaying = false;
    playNextSE();
  };
  audio.play();
}
function clearSEQueue() {
  seQueue = [];
  sePlaying = false;
}
function playSEByPriority(events) {
  // Priority: game over > check > promotion > win_a_field > take > move
  const priority = ['game over','check','promotion','win_a_field','take','move'];
  for (const p of priority) {
    if (events.includes(p)) {
      clearSEQueue();
      playSEPriority(p);
      break;
    }
  }
}
// Add check detection
function isKingInCheck(color) {
  // Find king position
  const king = Array.from(document.querySelectorAll(`.piece.king.${color}`))[0];
  if (!king || !king.parentElement) return false;
  const kingCell = king.parentElement;
  const kingRow = Number(kingCell.dataset.row);
  const kingCol = Number(kingCell.dataset.col);
  // Check all opponent pieces for valid moves to king's square
  const oppColor = color === 'white' ? 'black' : 'white';
  const oppPieces = Array.from(document.querySelectorAll(`.piece.${oppColor}`));
  for (const piece of oppPieces) {
    const cell = piece.parentElement;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const moves = getValidMoves(piece, row, col);
    if (moves.some(c => Number(c.dataset.row) === kingRow && Number(c.dataset.col) === kingCol)) {
      return true;
    }
  }
  return false;
}

// --- Settings bar logic ---
let checkmateEnabled = true;
let gameStarted = false;

// Toggle button elements
const boardToggle = document.getElementById('boardToggle');
const checkmateToggle = document.getElementById('checkmateToggle');
const playBtn = document.getElementById('playBtn');
const boardDiv = document.getElementById('board');
const settingsBar = document.getElementById('settingsBar');
const lobbyDiv = document.getElementById('lobby');

// Hide board until Play is pressed
boardDiv.style.display = 'none';

// Toggle logic for Board set
boardToggle.setAttribute('data-value', '0');
boardToggle.addEventListener('click', () => {
  if (playBtn.disabled) return;
  const current = boardToggle.getAttribute('data-value');
  if (current === '0') {
    boardToggle.setAttribute('data-value', '1');
    boardToggle.textContent = 'Set 2';
    boardToggle.setAttribute('aria-pressed', 'true');
    boardToggle.style.background = '#eee';
    boardToggle.style.color = '#28a745';
  } else {
    boardToggle.setAttribute('data-value', '0');
    boardToggle.textContent = 'Set 1';
    boardToggle.setAttribute('aria-pressed', 'true');
    boardToggle.style.background = '#28a745';
    boardToggle.style.color = '#222';
  }
});

// Toggle logic for Checkmate
checkmateToggle.setAttribute('data-value', '1');
checkmateToggle.addEventListener('click', () => {
  if (playBtn.disabled) return;
  const current = checkmateToggle.getAttribute('data-value');
  if (current === '1') {
    checkmateToggle.setAttribute('data-value', '0');
    checkmateToggle.textContent = 'Disabled';
    checkmateToggle.setAttribute('aria-pressed', 'false');
    checkmateToggle.style.background = '#eee';
    checkmateToggle.style.color = '#222';
  } else {
    checkmateToggle.setAttribute('data-value', '1');
    checkmateToggle.textContent = 'Enabled';
    checkmateToggle.setAttribute('aria-pressed', 'true');
    checkmateToggle.style.background = '#28a745';
    checkmateToggle.style.color = '#222';
  }
});

// On page load, ensure the button matches the initial state
checkmateToggle.textContent = 'Enabled';
checkmateToggle.style.background = '#28a745';
checkmateToggle.style.color = '#222';

// --- Multiplayer Setup ---
let myColor = null;
let roomId = null;
let isMyTurn = false;
let myNickname = '';
let opponentNickname = '';

const whiteNicknameSpan = document.getElementById('whiteNickname');
const blackNicknameSpan = document.getElementById('blackNickname');

function setPlayerNicknames(white, black) {
  if (whiteNicknameSpan) whiteNicknameSpan.textContent = white || '-';
  if (blackNicknameSpan) blackNicknameSpan.textContent = black || '-';
}

function promptRoomAndJoin() {
  roomId = prompt('Enter room name (or leave blank for default):', 'room1') || 'room1';
  socket.emit('join', roomId);
}

socket.on('assignColor', (color) => {
  myColor = color;
  isMyTurn = (myColor === 'white');
});

socket.on('waitingForOpponent', () => {
  // Removed alert
});

socket.on('opponentLeft', () => {
  // Removed alert
});

socket.on('init', (moves) => {
  // Reset board and replay moves
  resetBoard();
  moves.forEach(applyMoveFromServer);
});

socket.on('move', (move) => {
  applyMoveFromServer(move);
  isMyTurn = (move.nextTurn === myColor);
});

function isMyTurnNow() {
  return (myColor === 'white' && currentPlayer === 1) ||
         (myColor === 'black' && currentPlayer === 2);
}

function isMyPiece(pieceElem) {
  if (!pieceElem) return false;
  return (myColor === 'white' && pieceElem.classList.contains('white')) ||
         (myColor === 'black' && pieceElem.classList.contains('black'));
}

function sendMoveToServer(move) {
  // move: {from: {row, col}, to: {row, col}, promotion: ...}
  console.log('Sending move to server:', move);
  socket.emit('move', move);
}

function applyMoveFromServer(move) {
  // Move piece on board according to move object
  // move: {from: {row, col}, to: {row, col}, promotion: 'queen'|'rook'|...|null}
  const fromCell = document.querySelector(`.cell[data-row="${move.from.row}"][data-col="${move.from.col}"]`);
  const toCell = document.querySelector(`.cell[data-row="${move.to.row}"][data-col="${move.to.col}"]`);
  const pieceElem = fromCell.querySelector('.piece');
  if (!pieceElem) return;
  // Handle capture
  const captured = toCell.querySelector('.piece');
  if (captured) captured.remove();
  // Promotion
  if (move.promotion) {
    pieceElem.classList.remove('pawn','queen','rook','bishop','knight');
    pieceElem.classList.add(move.promotion);
    const img = pieceElem.querySelector('img');
    img.src = `${pieceElem.classList.contains('white') ? 'white' : 'black'}_${move.promotion}.png`;
    img.alt = `${pieceElem.classList.contains('white') ? 'white' : 'black'} ${move.promotion}`;
  }
  toCell.appendChild(pieceElem);
  // Update game state as needed (transparency, field control, etc.)
  updateTransparencyAfterMove(pieceElem, move.to.row);
  updateAllFieldControl();
  updateFieldVisuals();
  // Highlight last move
  document.querySelectorAll('.last-move').forEach(c => c.classList.remove('last-move'));
  fromCell.classList.add('last-move');
  toCell.classList.add('last-move');
  // Switch turn
  currentPlayer = (currentPlayer === 1 ? 2 : 1);
}

// --- Override board click logic for multiplayer ---
function setupBoardEventsMultiplayer() {
  const boardDiv = document.getElementById('board');
  boardDiv.onclick = async (e) => {
    if (!isMyTurn) return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const pieceElem = cell.querySelector('.piece');
    // Select piece
    if (pieceElem && pieceElem.classList.contains(myColor)) {
      clearHighlights();
      selectedPiece = pieceElem;
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      validMoves = getValidMoves(pieceElem, row, col);
      validMoves.forEach(c => c.classList.add('highlight'));
      return;
    }
    // Move piece
    if (selectedPiece && cell.classList.contains('highlight')) {
      if (!selectedPiece || !selectedPiece.parentElement) {
        clearHighlights();
        selectedPiece = null;
        validMoves = [];
        return;
      }
      const fromCell = selectedPiece.parentElement;
      const fromRow = Number(fromCell.dataset.row);
      const fromCol = Number(fromCell.dataset.col);
      const toRow = Number(cell.dataset.row);
      const toCol = Number(cell.dataset.col);
      let promotion = null;
      const isPawn = selectedPiece.classList.contains('pawn');
      if (isPawn && ((myColor === 'white' && toRow === 8) || (myColor === 'black' && toRow === 0))) {
        promotion = await showPromotionDialog(myColor, cell, selectedPiece);
      }

      if (!isMyTurnNow()) return;
      if (!selectedPiece || !isMyPiece(selectedPiece)) return;
      // Send move to server
      sendMoveToServer({
        from: {row: fromRow, col: fromCol},
        to: {row: toRow, col: toCol},
        promotion
      });
      
      clearHighlights();
      selectedPiece = null;
      validMoves = [];
      isMyTurn = false;
    } else {
      clearHighlights();
      selectedPiece = null;
      validMoves = [];
    }
  };
}

// --- Initialization ---
// Remove any socket.emit('join', 'room1') or similar automatic join on page load
// Only emit 'join' after 'roomCreated' or 'roomJoined' events, as already handled

// Show game UI by default
if (boardDiv) boardDiv.style.display = '';
if (settingsBar) settingsBar.style.display = 'flex';

// --- Mode Selection Logic ---
const modeSelect = document.getElementById('modeSelect');
const singleModeBtn = document.getElementById('singleModeBtn');
const multiModeBtn = document.getElementById('multiModeBtn');
const nicknameInput = document.getElementById('nicknameInput');

function showModeSelect() {
  if (modeSelect) modeSelect.style.display = 'flex';
  if (boardDiv) boardDiv.style.display = 'none';
  if (settingsBar) settingsBar.style.display = 'none';
  if (lobbyDiv) lobbyDiv.style.display = 'none';
}
function showGameUI() {
  if (modeSelect) modeSelect.style.display = 'none';
  if (boardDiv) boardDiv.style.display = '';
  if (settingsBar) settingsBar.style.display = 'flex';
  if (lobbyDiv) lobbyDiv.style.display = 'none';
}
function showLobby() {
  if (modeSelect) modeSelect.style.display = 'none';
  if (lobbyDiv) lobbyDiv.style.display = 'flex';
  if (boardDiv) boardDiv.style.display = 'none';
  if (settingsBar) settingsBar.style.display = 'none';
}

showModeSelect();

singleModeBtn.onclick = () => {
  myNickname = nicknameInput.value.trim() || 'Player';
  showGameUI();
  showResignButton(true);
  setPlayerNicknames(myNickname, 'Computer');
  // TODO: Implement single player logic (no socket)
  // For now, just show the board and allow local play
  // You may want to disable or hide multiplayer-specific UI
};

multiModeBtn.onclick = () => {
  myNickname = nicknameInput.value.trim() || 'Player';
  showLobby();
  setPlayerNicknames('-', '-'); // Reset until room is joined
};

// --- Multiplayer Lobby Logic (restored) ---
const createRoomBtn = document.getElementById('createRoomBtn');
const listRoomsBtn = document.getElementById('listRoomsBtn');
const roomCreateDiv = document.getElementById('roomCreate');
const roomJoinDiv = document.getElementById('roomJoin');
const confirmCreateBtn = document.getElementById('confirmCreateBtn');
const confirmJoinBtn = document.getElementById('confirmJoinBtn');
const showJoinBtn = document.getElementById('showJoinBtn');
const publicRoomsDiv = document.getElementById('publicRooms');
const roomNameInput = document.getElementById('roomNameInput');
const roomPassInput = document.getElementById('roomPassInput');
const joinRoomNameInput = document.getElementById('joinRoomNameInput');
const joinRoomPassInput = document.getElementById('joinRoomPassInput');

createRoomBtn.onclick = () => {
  roomCreateDiv.style.display = 'flex';
  roomJoinDiv.style.display = 'none';
  publicRoomsDiv.style.display = 'none';
};
listRoomsBtn.onclick = () => {
  socket.emit('listRooms');
  publicRoomsDiv.style.display = 'block';
  roomCreateDiv.style.display = 'none';
  roomJoinDiv.style.display = 'none';
};
showJoinBtn.onclick = () => {
  roomJoinDiv.style.display = 'flex';
  roomCreateDiv.style.display = 'none';
  publicRoomsDiv.style.display = 'none';
};
confirmCreateBtn.onclick = () => {
  const name = roomNameInput.value.trim();
  const pass = roomPassInput.value;
  if (!name) return alert('Please enter a room name.');
  socket.emit('createRoom', { name, pass, nickname: myNickname });
};
confirmJoinBtn.onclick = () => {
  const name = joinRoomNameInput.value.trim();
  const pass = joinRoomPassInput.value;
  if (!name) return alert('Please enter a room name.');
  socket.emit('joinRoom', { name, pass, nickname: myNickname });
};
let isHost = false;
let currentRoomName = null;

socket.on('roomCreated', (room) => {
  console.log('Joined room:', room.name);
  socket.emit('join', room.name); 
  // Host has created a room: hide lobby, show game UI, enable Play button for host
  showGameUI(); // Hide lobby, show board/settings
  setupBoardEventsMultiplayer();
  isHost = (room.host === socket.id);
  currentRoomName = room.name;
  // Set nicknames if available (host is white by default)
  setPlayerNicknames(myNickname, room.guestNickname || '-');
  // Only enable Play button for host if a guest is present
  if (isHost && room.guestNickname) {
    playBtn.disabled = false;
    playBtn.style.opacity = 1;
  } else if (isHost) {
    playBtn.disabled = true;
    playBtn.style.opacity = 0.5;
  }
});

socket.on('roomJoined', (room) => {
  console.log('Joined room:', room.name);
  socket.emit('join', room.name); 
  // Guest has joined a room: hide lobby, show game UI, Play button only for host
  showGameUI();
  setupBoardEventsMultiplayer();
  isHost = (room.host === socket.id);
  currentRoomName = room.name;
  // Set nicknames if available (host is white, guest is black)
  setPlayerNicknames(room.hostNickname || '-', myNickname);
  // Only enable Play button for host if a guest is present
  if (isHost && room.guestNickname) {
    playBtn.disabled = false;
    playBtn.style.opacity = 1;
  } else if (isHost) {
    playBtn.disabled = true;
    playBtn.style.opacity = 0.5;
  }
});

// System message UI helper
function showSystemMessage(msg, duration = 4000) {
  const el = document.getElementById('systemMessage');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = 1;
  if (duration > 0) {
    setTimeout(() => {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = 0;
      setTimeout(() => { el.textContent = ''; el.style.transition = ''; el.style.opacity = 1; }, 600);
    }, duration);
  }
}

let lastBlackNickname = '-';

// Listen for guest join/leave updates to enable/disable Play button for host
socket.on('playerInfo', (info) => {
  
  setPlayerNicknames(info.whiteNickname, info.blackNickname);
  console.log('playerInfo received:', info, 'isHost:', isHost);

  // Notify host if a guest joins
  if (isHost && info.blackNickname && info.blackNickname !== '-' && info.blackNickname !== lastBlackNickname) {
    showSystemMessage(`Guest "${info.blackNickname}" has joined the room!`);
  }
  lastBlackNickname = info.blackNickname;

  if (isHost) {
    // More robust check: blackNickname must be a non-empty string and not '-'
    if (typeof info.blackNickname === 'string' && info.blackNickname.trim() && info.blackNickname !== '-') {
      playBtn.disabled = false;
      playBtn.style.opacity = 1;
    } else {
      playBtn.disabled = true;
      playBtn.style.opacity = 0.5;
    }
  }
});

socket.on('assignColor', (color) => {
  myColor = color;
  console.log('🎨 You are', myColor);
});

// Remove resign and draw buttons from settings bar. Only use resign button in resignContainer (bottom-right).
// Modify Play button logic to start the game (no showGameButtons call)
playBtn.addEventListener('click', () => {
  // Apply settings and start game
  const idx = Number(boardToggle.getAttribute('data-value'));
  setInitialPositionsFromLayout(idx);
  checkmateEnabled = checkmateToggle.getAttribute('data-value') === '1';
  boardDiv.style.display = '';
  resetBoard();
  // Lock settings
  boardToggle.disabled = true;
  checkmateToggle.disabled = true;
  playBtn.disabled = true;
  playBtn.style.opacity = 0.5;
});

socket.on('gameStarted', () => {
  showGameUI();
  showResignButton(true);
  // Optionally, reset the board or do any other game start logic
});

socket.on('roomError', (msg) => {
  alert(msg);
});

socket.on('roomList', (rooms) => {
  publicRoomsDiv.innerHTML = '<h3>Public Rooms</h3>';
  if (!rooms.length) {
    publicRoomsDiv.innerHTML += '<div>No public rooms available.</div>';
    return;
  }
  rooms.forEach(room => {
    const btn = document.createElement('button');
    btn.textContent = room.name + (room.hasPassword ? ' (Password)' : '');
    btn.onclick = () => {
      joinRoomNameInput.value = room.name;
      roomJoinDiv.style.display = 'flex';
      roomCreateDiv.style.display = 'none';
      publicRoomsDiv.style.display = 'none';
    };
    publicRoomsDiv.appendChild(btn);
  });
});

const resignContainer = document.getElementById('resignContainer');
const resignBtn = document.getElementById('resignBtn');

function showResignButton(show) {
  if (resignContainer) resignContainer.style.display = show ? '' : 'none';
}

if (resignBtn) {
  resignBtn.onclick = () => {
    showResignButton(false);
    showGameOverDialog(`${currentPlayer === 1 ? 'White' : 'Black'} resigns! ${currentPlayer === 1 ? 'Black' : 'White'} wins!`);
  };
}
