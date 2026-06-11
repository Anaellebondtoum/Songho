/*
SONGHO — realise par BONDTOUM NDZIE ANAELLE AURORE 24F2605
Licence 2 Informatique, Université de Yaoundé I 

  SECTIONS
  
  A. CONSTANTES & CYCLE DE SEMAILLE
  B. UTILITAIRES  (other, sum, clone, attackPit…)
  C. ÉTAT INITIAL  (createGame)
  D. SEMAILLE  (sowNormal, sowGranary, sow)
  E. CAPTURE  (canStartCapture, captureChain, applyCaptures, resolveCaptures)
  F. COUPS LÉGAUX  (getLegalMoves, solidarité, interdits case d'attaque)
  G. APPLICATION D'UN COUP  (applyMove)
  H. CONDITIONS DE FIN  (checkEndAfterMove, checkEndBeforeTurn)
  I. INTERFACE DOM  (render, animations, messages, événements)
  J. DÉMARRAGE
*/

"use strict"; 


// A. CONSTANTES & CYCLE DE SEMAILLE

const RULES = {
  pitsPerPlayer : 7,
  initialSeeds  : 5,
  totalSeeds    : 70,
  victoryScore  : 40,
  lowBoardLimit : 10,
  maxNormalSow  : 13,          // au-delà de 13 → grenier
  captureValues : new Set([2, 3, 4])  // seuls ces nombres déclenchent une capture
};

const CYCLE = [
  { player: "north", pitIndex: 0 },
  { player: "north", pitIndex: 1 },
  { player: "north", pitIndex: 2 },
  { player: "north", pitIndex: 3 },
  { player: "north", pitIndex: 4 },
  { player: "north", pitIndex: 5 },
  { player: "north", pitIndex: 6 },   // ← case d'attaque de Nord
  { player: "south", pitIndex: 6 },   // ← 1ère case adverse pour Nord (protégée)
  { player: "south", pitIndex: 5 },
  { player: "south", pitIndex: 4 },
  { player: "south", pitIndex: 3 },
  { player: "south", pitIndex: 2 },
  { player: "south", pitIndex: 1 },
  { player: "south", pitIndex: 0 }    // ← case d'attaque de Sud
];

const OPPONENT_PATH = {
  north: [6, 5, 4, 3, 2, 1, 0].map(i => ({ player: "south", pitIndex: i })),
  south: [0, 1, 2, 3, 4, 5, 6].map(i => ({ player: "north", pitIndex: i }))
};

//B. UTILITAIRES


// Retourne l'adversaire du joueur donné 
function other(player) {
  return player === "north" ? "south" : "north";
}

/* Somme des éléments d'un tableau */
function sum(arr) {
  return arr.reduce((total, v) => total + v, 0);
}

/* Nombre total de graines encore sur le tablier */
function boardSeeds(st) {
  return sum(st.board.north) + sum(st.board.south);
}

/* Compare deux positions */
function samePos(a, b) {
  return a.player === b.player && a.pitIndex === b.pitIndex;
}

/* Retourne la CASE D'ATTAQUE du joueur */
function attackPit(player) {
  return player === "north"
    ? { player: "north", pitIndex: 6 }
    : { player: "south", pitIndex: 0 };
}

/* Retourne la PREMIÈRE CASE ADVERSE (protégée contre la capture isolée). */
function opponentFirstPit(player) {
  return player === "north"
    ? { player: "south", pitIndex: 6 }
    : { player: "north", pitIndex: 0 };
}

/*Clone profond d'un état (pour simuler un coup sans modifier l'état réel).*/
function cloneState(st) {
  return {
    board         : { north: [...st.board.north], south: [...st.board.south] },
    scores        : { north: st.scores.north,     south: st.scores.south    },
    currentPlayer : st.currentPlayer,
    status        : st.status,
    winner        : st.winner,
    reason        : st.reason,
    moveNumber    : st.moveNumber
  };
}

/* INVARIANT : la somme totale des graines (tablier + scores) doit toujours être égale à 70. */
function assertInvariant(st) {
  const total = st.scores.north + st.scores.south + boardSeeds(st);
  if (total !== RULES.totalSeeds) {
    throw new Error(`INVARIANT BRISÉ : ${total} graines au lieu de ${RULES.totalSeeds}`);
  }
}


//C. ÉTAT INITIAL

/**
 * Crée un état initial complet.
 * @param {string} startingPlayer  "north" ou "south"
 */
function createGame(startingPlayer = "south") {
  return {
    board: {
      north: Array(RULES.pitsPerPlayer).fill(RULES.initialSeeds),
      south: Array(RULES.pitsPerPlayer).fill(RULES.initialSeeds)
    },
    scores        : { north: 0, south: 0 },
    currentPlayer : startingPlayer,
    status        : "playing",   // "playing" | "ended"
    winner        : null,        // "north" | "south" | "draw"
    reason        : null,        // raison de fin
    moveNumber    : 0
  };
}

//D. SEMAILLE

// Retourne les 13 positions SUIVANT la source dans le cycle

function nextPositionsAfter(source) {
  const start  = CYCLE.findIndex(p => samePos(p, source));
  const result = [];
  for (let step = 1; step <= 13; step++) {
    result.push(CYCLE[(start + step) % CYCLE.length]);
  }
  return result;
}

// SEMAILLE NORMALE (1 à 13 graines).

function sowNormal(st, player, pitIndex) {
  const seeds  = st.board[player][pitIndex];
  const source = { player, pitIndex };  
  st.board[player][pitIndex] = 0;

  const path    = nextPositionsAfter(source);
  const visited = [];

  for (let i = 0; i < seeds; i++) {
    const pos = path[i];
    st.board[pos.player][pos.pitIndex]++;
    visited.push(pos);
  }

  return {
    visited,
    lastPosition   : visited[visited.length - 1],
    specialCapture : 0
  };
}

// Étapes 1: Vider la case source.
function sowGranary(st, player, pitIndex) {
  const seeds  = st.board[player][pitIndex];
  const source = { player, pitIndex };
  st.board[player][pitIndex] = 0;

  const visited        = [];
  let   remaining      = seeds;
  let   specialCapture = 0;

  // Étape 2 : tour complet sur les 13 autres cases
  for (const pos of nextPositionsAfter(source)) {
    st.board[pos.player][pos.pitIndex]++;
    visited.push(pos);
    remaining--;
  }

  // Étape 3 & 4 : distribuer le reste chez l'adversaire
  const path      = OPPONENT_PATH[player];
  const firstPit  = opponentFirstPit(player);

  for (let i = 0; i < remaining; i++) {
    const pos    = path[i % path.length];   // boucle sur le camp adverse
    const isLast = (i === remaining - 1);
    const isProtectedFirstPit = samePos(pos, firstPit);

    if (isLast && isProtectedFirstPit) {
      // Capture spéciale : graine capturée, pas posée sur le tablier
      specialCapture++;
      visited.push(pos);
    } else {
      st.board[pos.player][pos.pitIndex]++;
      visited.push(pos);
    }
  }

  return {
    visited,
    lastPosition   : visited[visited.length - 1],
    specialCapture
  };
}

//SEMAILLE GÉNÉRALE : choisit la méthode selon le nombre de graines.

function sow(st, player, pitIndex) {
  const seeds = st.board[player][pitIndex];
  if (seeds <= 0) throw new Error("Tentative de semer depuis une case vide.");
  return seeds <= RULES.maxNormalSow
    ? sowNormal(st, player, pitIndex)
    : sowGranary(st, player, pitIndex);
}


//E. CAPTURE

// Vérifie si un nombre de graines permet une capture (2, 3 ou 4).
function isCaptureValue(n) {
  return RULES.captureValues.has(n);
}

/*Vérifie si une CAPTURE PEUT DÉMARRER depuis la dernière case semée.
 
  Conditions cumulatives :
    1. La case est dans le camp adverse.
    2. Ce n'est pas la 1ère case adverse protégée.
    3. La case contient 2, 3 ou 4 graines après la semaille.
 */
function canStartCapture(st, player, lastPos) {
  if (lastPos.player === player)                    return false;
  if (samePos(lastPos, opponentFirstPit(player)))   return false;
  return isCaptureValue(st.board[lastPos.player][lastPos.pitIndex]);
}

//CAPTURE EN CHAÎNE.

function captureChain(st, player, lastPos) {
  const path      = OPPONENT_PATH[player];
  const lastIndex = path.findIndex(p => samePos(p, lastPos));

  // Si lastIndex == 0, c'est la 1ère case adverse : pas de départ de chaîne
  if (lastIndex <= 0) return [];

  const captured = [];
  for (let i = lastIndex; i >= 0; i--) {
    const pos   = path[i];
    const count = st.board[pos.player][pos.pitIndex];
    if (!isCaptureValue(count)) break;  // chaîne interrompue
    captured.push({ player: pos.player, pitIndex: pos.pitIndex, seeds: count });
  }
  return captured;
}

// Vérifie si appliquer la liste de captures VIDERAIT tout le camp adverse. (Interdit : on ne peut pas affamer l'adversaire.)
 
function wouldEmptyOpponent(st, player, captureList) {
  const opp       = other(player);
  const remaining = [...st.board[opp]];
  for (const c of captureList) {
    if (c.player === opp) remaining[c.pitIndex] -= c.seeds;
  }
  return sum(remaining) === 0;
}

//Applique physiquement les captures si elles sont autorisées et retourne le nombre de graines capturées (0 si capture annulée).

function applyCaptures(st, player, captureList) {
  if (captureList.length === 0)                       return 0;
  if (wouldEmptyOpponent(st, player, captureList))    return 0;  // interdit d'affamer

  let total = 0;
  for (const c of captureList) {
    st.board[c.player][c.pitIndex] -= c.seeds;
    total += c.seeds;
  }
  st.scores[player] += total;
  return total;
}

// RÉSOLUTION COMPLÈTE DES CAPTURES après une semaille. Gère les trois cas : capture spéciale grenier, capture normale, capture en chaîne.

function resolveCaptures(st, player, sowResult) {
  // Cas grenier : 1 graine capturée directement (pas de chaîne possible)
  if (sowResult.specialCapture > 0) {
    st.scores[player] += sowResult.specialCapture;
    return { captured: sowResult.specialCapture, type: "special-granary", capturedPits: [] };
  }

  const last = sowResult.lastPosition;

  if (!canStartCapture(st, player, last)) {
    return { captured: 0, type: "none", capturedPits: [] };
  }

  const captureList = captureChain(st, player, last);
  const captured    = applyCaptures(st, player, captureList);

  return {
    captured,
    capturedPits : captureList,
    type         : captured > 0
      ? (captureList.length > 1 ? "chain" : "normal")
      : "none"
  };
}

//F. COUPS LÉGAUX

/* Retourne toutes les cases non-vides du joueur */
function ownNonEmpty(st, player) {
  const moves = [];
  for (let i = 0; i < RULES.pitsPerPlayer; i++) {
    if (st.board[player][i] > 0) moves.push({ player, pitIndex: i });
  }
  return moves;
}

/* Vérifie si un coup provoquerait une capture (simulation) */
function wouldMoveCapture(st, player, pitIndex) {
  const sim    = cloneState(st);
  const result = sow(sim, player, pitIndex);
  if (result.specialCapture > 0) return true;
  return canStartCapture(sim, player, result.lastPosition);
}

/*Vérifie si un coup depuis la CASE D'ATTAQUE est INTERDIT.*/
function isForbiddenAttackMove(st, player, pitIndex) {
  const attack = attackPit(player);
  if (attack.player !== player || attack.pitIndex !== pitIndex) return false;

  const seeds = st.board[player][pitIndex];
  if (seeds === 1) return true;
  if (seeds === 2) return !wouldMoveCapture(st, player, pitIndex);
  return false;
}

/* Vérifie si le camp adverse est entièrement vide */
function opponentCampEmpty(st, player) {
  return sum(st.board[other(player)]) === 0;
}

/* Calcule le nombre de graines envoyées chez l'adversaire par un coup (simulation).*/
function countDelivered(st, player, pitIndex) {
  const sim    = cloneState(st);
  const before = sum(sim.board[other(player)]);
  sow(sim, player, pitIndex);
  return sum(sim.board[other(player)]) - before;
}

/*
 Quand le camp adverse est vide:
  Priorité (d'après les règles) :
   1. Donner AU MOINS 7 graines chez l'adversaire si possible.
   2. Sinon, donner le MAXIMUM possible.
   3. Si aucun coup ordinaire ne fonctionne, chercher un Don force (case d'attaque avec 1 ou 2 graines → les graines vont au score adverse).
   4. Si rien n'est possible alors fin de partie.
 */
function getSolidarityMoves(st, player) {
  const candidates = ownNonEmpty(st, player);
  const ordinary   = candidates.filter(m => !isForbiddenAttackMove(st, player, m.pitIndex));

  const enriched = ordinary.map(m => ({
    ...m,
    delivered: countDelivered(st, player, m.pitIndex)
  }));

  // Priorité 1 : au moins 7 graines
  const atLeast7 = enriched.filter(m => m.delivered >= 7);
  if (atLeast7.length > 0) return atLeast7;

  // Priorité 2 : maximum possible
  const positive = enriched.filter(m => m.delivered > 0);
  if (positive.length > 0) {
    const best = Math.max(...positive.map(m => m.delivered));
    return positive.filter(m => m.delivered === best);
  }

  // Priorité 3 : don forcé depuis la case d'attaque
  const atk    = attackPit(player);
  const forced = candidates.filter(m =>
    samePos(atk, m) && [1, 2].includes(st.board[player][m.pitIndex])
  );
  return forced.map(m => ({ ...m, forcedDonation: true }));
}

/* GÉNÈRE TOUS LES COUPS LÉGAUX pour le joueur courant.*/
function getLegalMoves(st) {
  const player = st.currentPlayer;
  if (st.status !== "playing") return [];

  if (opponentCampEmpty(st, player)) {
    return getSolidarityMoves(st, player);
  }

  return ownNonEmpty(st, player).filter(m =>
    !isForbiddenAttackMove(st, player, m.pitIndex)
  );
}


//G. APPLICATION D'UN COUP

//DON FORCÉ
function applyForcedDonation(st, player, pitIndex) {
  const seeds = st.board[player][pitIndex];
  st.board[player][pitIndex] = 0;
  st.scores[other(player)] += seeds;
  return { type: "forced-donation", donated: seeds, capturedPits: [], visited: [] };
}

function applyMove(st, player, pitIndex) {
  // Étapes 1–4 : validations (Quw la partie est en cours, que c'est le tour du joueur, que la case est non vide, que le coup est leger)
  if (st.status !== "playing")
    return { ok: false, error: "La partie est terminée." };
  if (player !== st.currentPlayer)
    return { ok: false, error: "Ce n'est pas ton tour." };
  if (st.board[player][pitIndex] <= 0)
    return { ok: false, error: "Case vide." };

  const legal  = getLegalMoves(st);
  const legalM = legal.find(m => m.player === player && m.pitIndex === pitIndex);
  if (!legalM)
    return { ok: false, error: "Coup interdit par les règles." };

  // Étape 5 : exécution du don force
  let actionResult;
  if (legalM.forcedDonation) {
    actionResult = applyForcedDonation(st, player, pitIndex);
  } else {
    const sowResult = sow(st, player, pitIndex);
    const capture   = resolveCaptures(st, player, sowResult);
    actionResult    = { type: "sow", sowing: sowResult, capture };
  }

  /*Étapes 6–10 : Le compteur de coup incremente, verification de la fin de la partie, 
  changement de joueur si jeu toujours en cours, verifier si le joueur suivant peut jouer et l'invariant des 70 graines
  */ 

  st.moveNumber++;
  checkEndAfterMove(st);

  if (st.status === "playing") {
    st.currentPlayer = other(player);
    checkEndBeforeTurn(st);
  }

  assertInvariant(st);  // sécurité : total toujours 70

  return { ok: true, action: actionResult };
}


//H. CONDITIONS DE FIN


/** Ramasse toutes les graines du tablier et les attribue à leur propriétaire */
function collectRemaining(st) {
  st.scores.north += sum(st.board.north);
  st.scores.south += sum(st.board.south);
  st.board.north   = Array(RULES.pitsPerPlayer).fill(0);
  st.board.south   = Array(RULES.pitsPerPlayer).fill(0);
}

//Détermine le gagnant donc celui ayant 40 graines sinon nul.

function computeWinner(st) {
  if (st.scores.north >= RULES.victoryScore) return "north";
  if (st.scores.south >= RULES.victoryScore) return "south";
  return "draw";
}

/** Vérifie les conditions de fin APRÈS un coup */
function checkEndAfterMove(st) {
  if (st.scores.north >= RULES.victoryScore ||
      st.scores.south >= RULES.victoryScore) {
    st.status = "ended";
    st.reason = "score_40";
    st.winner = computeWinner(st);
    return;
  }
  if (boardSeeds(st) < RULES.lowBoardLimit) {
    collectRemaining(st);
    st.status = "ended";
    st.reason = "low_board";
    st.winner = computeWinner(st);
  }
}

/** Vérifie si le joueur suivant peut jouer (AVANT son tour) */
function checkEndBeforeTurn(st) {
  if (getLegalMoves(st).length === 0) {
    collectRemaining(st);
    st.status = "ended";
    st.reason = "solidarity_impossible";
    st.winner = computeWinner(st);
  }
}


//I. INTERFACE DOM

// Sélection des éléments DOM 
const rowNorth   = document.getElementById("row-north");
const rowSouth   = document.getElementById("row-south");
const elScoreN   = document.getElementById("score-north");
const elScoreS   = document.getElementById("score-south");
const cardNorth  = document.getElementById("card-north");
const cardSouth  = document.getElementById("card-south");
const elNameN    = document.getElementById("label-north");
const elNameS    = document.getElementById("label-south");
const elTurnN    = document.getElementById("turn-name-north");
const elTurnS    = document.getElementById("turn-name-south");
const turnText   = document.getElementById("turn-text");
const msgBox     = document.getElementById("message-box");
const endOverlay = document.getElementById("end-overlay");
const endTitle   = document.getElementById("end-title");
const endDetail  = document.getElementById("end-detail");
const endTrophy  = document.getElementById("end-trophy");
const inputN     = document.getElementById("input-north");
const inputS     = document.getElementById("input-south");

/** État courant de la partie (mutable) */
let state;

/** Noms des joueurs (lus depuis les champs de saisie) */
function getName(player) {
  const val = (player === "north" ? inputN : inputS).value.trim();
  return val.length > 0 ? val : (player === "north" ? "Nord" : "Sud");
}

// Rendu des cases 

//Contenu visuel d'une case.

function renderPitContent(pit, count) {
  pit.innerHTML = "";
  pit.classList.toggle("empty", count === 0);

  if (count === 0) {
    const span = document.createElement("span");
    span.className   = "seed-count";
    span.textContent = "·";
    pit.appendChild(span);
    return;
  }

  if (count <= 9) {
    const wrap = document.createElement("div");
    wrap.className = "seed-dots";
    for (let i = 0; i < count; i++) {
      const d = document.createElement("div");
      d.className = "dot";
      wrap.appendChild(d);
    }
    pit.appendChild(wrap);
  } else {
    const span = document.createElement("span");
    span.className   = "seed-count";
    span.textContent = count;
    pit.appendChild(span);
  }
}

//REDESSINE TOUT LE TABLIER à partir de l'état courant.

function renderBoard() {
  const legal    = getLegalMoves(state);
  const legalSet = new Set(legal.map(m => `${m.player}-${m.pitIndex}`));

  // Rangée Nord : affichée de N6 (gauche) à N0 (droite)
  rowNorth.querySelectorAll(".pit").forEach((pit, displayIndex) => {
    const pitIndex = 6 - displayIndex;   // N6 en position 0, N0 en position 6
    const count    = state.board.north[pitIndex];
    renderPitContent(pit, count);
    pit.dataset.pit = pitIndex;
    pit.classList.toggle("legal", legalSet.has(`north-${pitIndex}`));
  });

  // Rangée Sud : affichée de S0 (gauche) à S6 (droite)
  rowSouth.querySelectorAll(".pit").forEach((pit, displayIndex) => {
    const pitIndex = displayIndex;       // S0 en position 0, S6 en position 6
    const count    = state.board.south[pitIndex];
    renderPitContent(pit, count);
    pit.dataset.pit = pitIndex;
    pit.classList.toggle("legal", legalSet.has(`south-${pitIndex}`));
  });

  // Scores
  elScoreN.textContent = state.scores.north;
  elScoreS.textContent = state.scores.south;

  // Indicateur de tour
  const player = state.currentPlayer;
  cardNorth.classList.toggle("active-player", player === "north");
  cardSouth.classList.toggle("active-player", player === "south");

  if (state.status === "playing") {
    turnText.textContent = `Tour de ${getName(player)}`;
  } else {
    turnText.textContent = "Partie terminée";
  }

  // Noms dynamiques dans les cartes de score
  elNameN.textContent  = getName("north");
  elNameS.textContent  = getName("south");
}

// Messages

/* 
 Affiche un message dans la zone de feedback.
 * @param {string} text   Texte à afficher
 * @param {string} type   "info" | "good" | "bad"
 */
function showMessage(text, type = "info") {
  msgBox.textContent = text;
  msgBox.className   = type;
}

// Animations

// Applique une classe CSS temporaire sur une liste de cases et Utilisé pour animer les cases semées et les cases capturées.

function animatePits(pitsList, cssClass) {
  for (const { player, pitIndex } of pitsList) {
    const row = player === "north" ? rowNorth : rowSouth;
    // Retrouver la case par son data-pit (car l'affichage est inversé pour Nord)
    const pit = row.querySelector(`.pit[data-pit="${pitIndex}"]`);
    if (!pit) continue;
    pit.classList.add(cssClass);
    setTimeout(() => pit.classList.remove(cssClass), 700);
  }
}

// Gestion des clics

/**
 * Appelé quand un joueur clique sur une case.
 * @param {string} player    "north" ou "south"
 * @param {number} pitIndex  Index interne de la case (0–6)
 */
function onPitClick(player, pitIndex) {
  if (state.status !== "playing") return;

  const result = applyMove(state, player, pitIndex);

  if (!result.ok) {
    showMessage(result.error, "bad");
    return;
  }

  const action = result.action;

  // Animer les cases semées
  if (action.sowing && action.sowing.visited.length > 0) {
    animatePits(action.sowing.visited, "just-sown");
  }

  // Message de retour
  if (action.type === "forced-donation") {
    showMessage(
      `Don forcé : ${action.donated} graine(s) données à ${getName(other(player))}.`,
      "info"
    );
  } else if (action.capture.type === "special-granary") {
    showMessage("Grenier : 1 graine capturée (dernière sur la case protégée).", "good");
  } else if (action.capture.captured > 0) {
    const label = action.capture.type === "chain" ? " en chaîne" : "";
    showMessage(`+${action.capture.captured} graine(s) capturée(s)${label} !`, "good");
    animatePits(action.capture.capturedPits, "just-captured");
  } else {
    const next = getName(state.currentPlayer);
    showMessage(`À ${next} de jouer.`);
  }

  renderBoard();

  if (state.status === "ended") {
    setTimeout(showEndScreen, 800);
  }
}

// Construction du tablier HTML 

/**
 * Crée les 7 cases HTML d'une rangée et attache les gestionnaires de clic.
 * @param {HTMLElement} row     Élément conteneur de la rangée
 * @param {string}      player  "north" ou "south"
 */
function buildRow(row, player) {
  row.innerHTML = "";
  for (let i = 0; i < RULES.pitsPerPlayer; i++) {
    const pit = document.createElement("div");
    pit.className = "pit";
    // Le data-pit sera mis à jour par renderBoard() à chaque rendu
    pit.addEventListener("click", () => {
      const idx = parseInt(pit.dataset.pit, 10);
      onPitClick(player, idx);
    });
    row.appendChild(pit);
  }
}

// Écran de fin 

/** Affiche l'overlay de fin de partie avec le résultat. */
function showEndScreen() {
  const reasons = {
    score_40              : "Un joueur a atteint 40 graines.",
    low_board             : "Il restait moins de 10 graines sur le tablier.",
    solidarity_impossible : "Un joueur ne pouvait plus nourrir l'adversaire."
  };

  if (state.winner === "draw") {
    endTrophy.textContent = "🤝";
    endTitle.textContent  = "Égalité !";
  } else {
    endTrophy.textContent = "🏆";
    endTitle.textContent  = `${getName(state.winner)} gagne !`;
  }

  endDetail.textContent =
    `${getName("north")} : ${state.scores.north} graines\n` +
    `${getName("south")} : ${state.scores.south} graines\n` +
    (reasons[state.reason] ?? "");

  endOverlay.classList.add("visible");
}


// J. DÉMARRAGE

/** Lance ou relance une partie */
function startGame() {
  state = createGame("south");
  endOverlay.classList.remove("visible");
  renderBoard();
  showMessage(`${getName("south")} commence. Cliquez sur une case surlignée.`);
}

// Construction initiale des rangées
buildRow(rowNorth, "north");
buildRow(rowSouth, "south");

// Boutons
document.getElementById("btn-start").addEventListener("click", startGame);
document.getElementById("btn-end-new").addEventListener("click", startGame);
document.getElementById("btn-rules").addEventListener("click", () => {
  showMessage(
    "Semez vos graines dans le sens du cycle. Capturez 2–4 graines adverses " +
    "en terminant votre semaille dans leur camp. La 1ère case adverse est protégée. " +
    "Premier à 40 graines gagne. 70 graines au total.",
    "info"
  );
});

// Mise à jour des noms en temps réel
inputN.addEventListener("input", renderBoard);
inputS.addEventListener("input", renderBoard);

// Lancement initial
startGame();
