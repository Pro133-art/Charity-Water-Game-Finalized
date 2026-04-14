// Cache frequently used DOM nodes once during startup.
const pollutionBar = document.getElementById("pollutionBar");
const pollutionBarContainer = document.getElementById("pollutionBarContainer");
const waterReservoir = document.getElementById("waterReservoir");
const waterReservoirContainer = document.getElementById("waterReservoirContainer");
const timer = document.getElementById("timer");
const points = document.getElementById("points");
const pauseButton = document.getElementById("pauseButton");
const shovelButton = document.getElementById("shovelButton");
const extractorButton = document.getElementById("extractorButton");
const levelSelector = document.getElementById("levelSelector");
const levelButtons = Array.from(document.querySelectorAll(".level-button"));
const gameContainer = document.getElementById("water-hole-game");
const introModal = document.getElementById("introModal");
const startButton = document.getElementById("startButton");
const endScreen = document.getElementById("endScreen");
const endScreenTitle = document.getElementById("endScreenTitle");
const endScreenMessage = document.getElementById("endScreenMessage");
const restartButton = document.getElementById("restartButton");
const pauseScreen = document.getElementById("pauseScreen");
const pauseContinueButton = document.getElementById("pauseContinueButton");
const pauseRestartButton = document.getElementById("pauseRestartButton");
const cwDonateBtn = document.getElementById("cwDonateBtn");
const confettiContainer = document.getElementById("confettiContainer");
const holes = Array.from(document.querySelectorAll(".hole"));

// Core limits and gameplay tuning values.
const MAX_LEVEL = 100;
const MIN_LEVEL = 0;
const STARTING_POINTS = 500;
const RESERVOIR_MAX_UNITS = 100;
const CLEAN_EXTRACTION_UNITS = 30;
const MUGGY_EXTRACTION_UNITS = 20;
const CLEAN_EXTRACTION_COST = 100;
const MUGGY_EXTRACTION_COST = 150;
const RESERVOIR_REWARD_POINTS = 200;
const LEVEL_TIME_BONUS_PER_SECOND = 2;
const HOLE_REDIG_DELAY_MIN_MS = 5000;
const HOLE_REDIG_DELAY_MAX_MS = 11000;
const HOLE_REDIG_LEVEL_SPEEDUP_PER_LEVEL = 0.2;
const HOLE_REDIG_MIN_MULTIPLIER = 0.55;
const LEVELS = [
	{ name: "Level 1", totalSeconds: 120, pollutionReductionAmount: 18 },
	{ name: "Level 2", totalSeconds: 150, pollutionReductionAmount: 12 },
	{ name: "Level 3", totalSeconds: 180, pollutionReductionAmount: 8 },
];

const GAME_STATUS = {
	PLAYING: "playing",
	PAUSED: "paused",
	WON: "won",
	LOST: "lost",
};

const OVERLAY_MODE = {
	RESTART: "restart",
	NEXT_LEVEL: "next-level",
};

// Return active level data from the level list.
function getCurrentLevel() {
	return LEVELS[state.currentLevelIndex];
}

// Mutable state for a single game session.
const state = {
	// Current pollution meter value (0-100). 0 means fully cleaned.
	pollution: 100,
	// Reservoir fill percent derived from filled segments.
	water: 0,
	// Player score bank used to pay extraction costs.
	points: STARTING_POINTS,
	// Countdown timer remaining in seconds for the active level.
	secondsRemaining: LEVELS[0].totalSeconds,
	// Currently selected tool mode: shovel or extractor.
	selectedTool: "shovel",
	// Last interacted hole index (used for digging pulse highlight).
	activeHoleIndex: 0,
	// Per-hole state model for rendering: muggy or clean.
	holeStates: Array.from({ length: holes.length }, () => "muggy"),
	// Timeout IDs used to revert clean holes back to muggy.
	holeRespawnTimeoutIds: Array.from({ length: holes.length }, () => null),
	// Flexible reservoir fill units (0-100).
	reservoirUnits: 0,
	// Active level index in LEVELS.
	currentLevelIndex: 0,
	// Highest unlocked level for direct level-button access.
	highestUnlockedLevelIndex: 0,
	// Optional inline status detail shown beside points.
	pointsNotice: "",
	// Current lifecycle state: playing, paused, won, or lost.
	gameStatus: GAME_STATUS.PLAYING,
	// Overlay intent used by restart button logic.
	overlayMode: OVERLAY_MODE.RESTART,
	// Main game loop interval ID.
	intervalId: null,
};

// Return true when the game should accept active input/ticks.
function isPlaying() {
	return state.gameStatus === GAME_STATUS.PLAYING;
}

// Ensure the one-second interval loop is not running.
function stopGameLoop() {
	if (state.intervalId === null) {
		return;
	}

	window.clearInterval(state.intervalId);
	state.intervalId = null;
}

// Start the one-second interval loop if it is not already active.
function startGameLoop() {
	if (state.intervalId !== null) {
		return;
	}

	state.intervalId = window.setInterval(tick, 1000);
}

// Keep percentage values between the min and max limits.
function clamp(value) {
	return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, value));
}

// Update selected tool state and its visual active button style.
function setSelectedTool(tool) {
	state.selectedTool = tool;
	shovelButton.classList.toggle("active", tool === "shovel");
	extractorButton.classList.toggle("active", tool === "extractor");
}

// Paint live values for pollution and reservoir bars, including ARIA metadata.
function renderBars() {
	// Pollution shrinks from full width to 0 as player purifies water.
	pollutionBar.style.width = `${state.pollution}%`;
	// Convert flexible reservoir units (0-100) to visual percent.
	state.water = (state.reservoirUnits / RESERVOIR_MAX_UNITS) * 100;
	waterReservoir.style.height = `${state.water}%`;
	// Keep progressbar semantics updated for assistive tech.
	pollutionBarContainer.setAttribute("aria-valuenow", String(Math.round(state.pollution)));
	pollutionBarContainer.setAttribute("aria-valuetext", `${Math.round(state.pollution)} percent polluted`);
	waterReservoirContainer.setAttribute("aria-label", `Water reservoir ${Math.round(state.water)} percent filled`);
	waterReservoirContainer.setAttribute("aria-disabled", String(state.reservoirUnits <= 0));
	waterReservoirContainer.classList.toggle("ready", state.reservoirUnits > 0);
}

// Draw the countdown timer and points label (with contextual point notices).
function renderScoreboard() {
	const minutes = String(Math.floor(state.secondsRemaining / 60)).padStart(2, "0");
	const seconds = String(state.secondsRemaining % 60).padStart(2, "0");
	timer.textContent = `${getCurrentLevel().name} Timer: ${minutes}:${seconds}`;
	points.textContent = state.pointsNotice
		? `Points: ${state.points} (${state.pointsNotice})`
		: `Points: ${state.points}`;
}

// Refresh the appearance of each hole based on stored hole state.
function renderHoles() {
	holes.forEach((hole, index) => {
		hole.classList.remove("digging", "clean", "muggy");
		hole.classList.add(state.holeStates[index]);

		// Show a digging pulse only on the active hole while shovel is selected.
		if (index === state.activeHoleIndex && state.selectedTool === "shovel") {
			hole.classList.add("digging");
		}
	});
}

// Keep level selector labels and active state in sync.
function renderLevelButtons() {
	levelButtons.forEach((button, index) => {
		const isUnlocked = index <= state.highestUnlockedLevelIndex;
		const isActive = index === state.currentLevelIndex;

		// Active marks currently running level; locked prevents early access.
		button.classList.toggle("active", index === state.currentLevelIndex);
		button.classList.toggle("locked", !isUnlocked);
		button.disabled = !isUnlocked;
		// ARIA and title text expose state and unlock requirements.
		button.setAttribute("aria-pressed", String(isActive));
		button.setAttribute("aria-disabled", String(!isUnlocked));
		button.title = isUnlocked
			? `Play ${LEVELS[index].name}`
			: `Locked: Clear ${LEVELS[index - 1].name} first`;
		button.textContent = LEVELS[index].name;
	});
}

// Single render entry point used after every state mutation.
function render() {
	renderBars();
	renderScoreboard();
	renderHoles();
	renderLevelButtons();
}

// Return a random redig delay inside the configured min/max range.
function getRandomHoleRedigDelayMs() {
	// Higher levels shorten both bounds, making holes revert faster.
	const levelMultiplier = Math.max(
		HOLE_REDIG_MIN_MULTIPLIER,
		1 - (state.currentLevelIndex * HOLE_REDIG_LEVEL_SPEEDUP_PER_LEVEL)
	);
	const levelMinDelay = Math.round(HOLE_REDIG_DELAY_MIN_MS * levelMultiplier);
	const levelMaxDelay = Math.round(HOLE_REDIG_DELAY_MAX_MS * levelMultiplier);

	return Math.floor(Math.random() * (levelMaxDelay - levelMinDelay + 1)) + levelMinDelay;
}

// Revert a cleaned hole back to muggy after a short cooldown.
function scheduleHoleRedig(index) {
	const existingTimeoutId = state.holeRespawnTimeoutIds[index];

	if (existingTimeoutId !== null) {
		window.clearTimeout(existingTimeoutId);
	}

	state.holeRespawnTimeoutIds[index] = window.setTimeout(() => {
		state.holeRespawnTimeoutIds[index] = null;

		// Skip respawn if game is not active or hole was changed already.
		if (!isPlaying() || state.holeStates[index] !== "clean") {
			return;
		}

		state.holeStates[index] = "muggy";
		render();
	}, getRandomHoleRedigDelayMs());
}

// Cancel all pending hole redig timers.
function clearHoleRedigTimers() {
	state.holeRespawnTimeoutIds.forEach((timeoutId, index) => {
		if (timeoutId === null) {
			return;
		}

		window.clearTimeout(timeoutId);
		state.holeRespawnTimeoutIds[index] = null;
	});
}

// Show overlay during level transitions and on final outcomes.
function showOverlay(title, message, buttonLabel, mode) {
	endScreenTitle.textContent = title;
	endScreenMessage.textContent = message;
	restartButton.textContent = buttonLabel;
	state.overlayMode = mode;
	endScreen.classList.add("visible");
	gameContainer.classList.add("game-disabled");
}

// Hide overlay and re-enable board interactions.
function hideOverlay() {
	endScreen.classList.remove("visible");
	gameContainer.classList.remove("game-disabled");
}

// Show pause menu and freeze game updates.
function showPauseMenu() {
	if (!isPlaying()) {
		return;
	}

	state.gameStatus = GAME_STATUS.PAUSED;
	stopGameLoop();

	clearHoleRedigTimers();
	pauseScreen.classList.add("visible");
	gameContainer.classList.add("game-disabled");
	pauseButton.disabled = true;
}

// Resume game loop and interactions from pause menu.
function resumeFromPause() {
	if (state.gameStatus !== GAME_STATUS.PAUSED || !pauseScreen.classList.contains("visible")) {
		return;
	}

	state.gameStatus = GAME_STATUS.PLAYING;
	pauseScreen.classList.remove("visible");
	gameContainer.classList.remove("game-disabled");
	pauseButton.disabled = false;

	// Recreate redig timers for currently clean holes.
	state.holeStates.forEach((holeState, index) => {
		if (holeState === "clean") {
			scheduleHoleRedig(index);
		}
	});

	startGameLoop();
}

// Reset round values and begin the selected level.
function startLevel(levelIndex, options = {}) {
	const { preservePoints = false, notice = "" } = options;
	// Clamp to known levels in case external callers pass invalid indexes.
	const safeLevelIndex = Math.max(0, Math.min(LEVELS.length - 1, levelIndex));

	// Ensure only one game loop interval is active at a time.
	stopGameLoop();

	// Reset level-scoped state while optionally preserving score.
	clearHoleRedigTimers();
	state.currentLevelIndex = safeLevelIndex;
	state.pollution = 100;
	state.reservoirUnits = 0;
	state.secondsRemaining = getCurrentLevel().totalSeconds;
	state.points = preservePoints ? state.points : STARTING_POINTS;
	state.pointsNotice = notice;
	state.selectedTool = "shovel";
	state.activeHoleIndex = 0;
	state.holeStates = Array.from({ length: holes.length }, () => "muggy");
	state.gameStatus = GAME_STATUS.PLAYING;
	state.overlayMode = OVERLAY_MODE.RESTART;

	// Restore interactive board and boot a fresh one-second tick loop.
	pauseScreen.classList.remove("visible");
	hideOverlay();
	setSelectedTool(state.selectedTool);
	pauseButton.disabled = false;
	render();
	startGameLoop();
}

// Prepare and start the next level while keeping score continuity.
function advanceToNextLevel() {
	const nextLevelIndex = Math.min(LEVELS.length - 1, state.currentLevelIndex + 1);
	const nextLevelName = LEVELS[nextLevelIndex].name;
	startLevel(nextLevelIndex, {
		preservePoints: true,
		notice: `${nextLevelName}: less pollution removed per reservoir`,
	});
}

// Create and animate confetti particles on win.
function triggerConfetti() {
	const confettiCount = 50;
	const colors = ["--cw-yellow", "--water", "--button-shovel", "--button-extractor", "--pollution"];

	for (let i = 0; i < confettiCount; i++) {
		const confetti = document.createElement("div");
		confetti.className = "confetti";

		// Random horizontal position across the screen.
		const xPos = Math.random() * 100;
		confetti.style.left = `${xPos}%`;

		// Random color from the palette.
		const colorVar = colors[Math.floor(Math.random() * colors.length)];
		const colorValue = getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim();
		confetti.style.background = colorValue;

		// Random fall duration between 2-4 seconds.
		const duration = 2 + Math.random() * 2;
		confetti.style.setProperty("--duration", `${duration}s`);

		// Random sway duration for side-to-side movement.
		const swayDuration = 1 + Math.random() * 1;
		confetti.style.setProperty("--sway-duration", `${swayDuration}s`);

		// Random sway amount (left-right movement).
		const swayAmount = (Math.random() * 100 - 50);
		confetti.style.setProperty("--sway-amount", `${swayAmount}px`);

		// Add to container and trigger animation.
		confettiContainer.appendChild(confetti);
		// Force reflow to trigger CSS animation.
		void confetti.offsetWidth;
		confetti.classList.add("falling");

		// Remove from DOM after animation completes to avoid memory buildup.
		setTimeout(() => confetti.remove(), duration * 1000);
	}
}

// Stop gameplay and reveal end-game overlay for win/loss states.
function endGame(status, message) {
	if (!isPlaying()) {
		return;
	}

	state.gameStatus = status;

	stopGameLoop();

	clearHoleRedigTimers();
	pauseButton.disabled = true;

	// Only show donation CTA on successful completion.
	if (status === GAME_STATUS.WON) {
		cwDonateBtn.removeAttribute("hidden");
		triggerConfetti();
	} else {
		cwDonateBtn.setAttribute("hidden", "hidden");
	}

	showOverlay(status === GAME_STATUS.WON ? "Mission Accomplished" : "Game Over", message, "Play Again", OVERLAY_MODE.RESTART);
}

// Move to next level when available, otherwise finish the run as a win.
function completeLevelOrWin() {
	const timeBonus = Math.min(50, state.secondsRemaining * LEVEL_TIME_BONUS_PER_SECOND);
	state.points += timeBonus;
	state.pointsNotice = `Level Time Bonus: +${timeBonus}`;
	render();

	const isFinalLevel = state.currentLevelIndex >= LEVELS.length - 1;

	if (isFinalLevel) {
		endGame(GAME_STATUS.WON, `You cleared all 3 levels and emptied every pollution bar. Time bonus: +${timeBonus} points.`);
		return;
	}

	state.gameStatus = GAME_STATUS.PAUSED;
	clearHoleRedigTimers();
	triggerConfetti();
	// Unlock direct access to the next level once this one is cleared.
	state.highestUnlockedLevelIndex = Math.min(LEVELS.length - 1, state.currentLevelIndex + 1);

	const nextLevel = LEVELS[state.currentLevelIndex + 1];
	const currentLevelName = getCurrentLevel().name;

	showOverlay(
		"Level Complete",
		`${currentLevelName} cleared. Time bonus: +${timeBonus} points. Next: ${nextLevel.name} (${nextLevel.totalSeconds}s, -${nextLevel.pollutionReductionAmount} pollution per full reservoir).`,
		`Start ${nextLevel.name}`,
		OVERLAY_MODE.NEXT_LEVEL
	);
}

// Evaluate winning and losing rules after each meaningful game update.
function checkEndConditions() {
	if (!isPlaying()) {
		return;
	}

	if (state.pollution <= MIN_LEVEL) {
		completeLevelOrWin();
		return;
	}

	if (state.secondsRemaining <= 0) {
		endGame(GAME_STATUS.LOST, "The timer reached 00:00 before the Pollution Bar was empty.");
		return;
	}

	if (state.points <= 0) {
		endGame(GAME_STATUS.LOST, "Your points bank reached 0 before the Pollution Bar was empty.");
	}
}

// Shovel action: clean muggy holes and reward points.
function digHole(index) {
	if (!isPlaying()) {
		return;
	}

	state.activeHoleIndex = index;
	state.pointsNotice = "";

	// Digging only rewards points when converting muggy -> clean.
	if (state.holeStates[index] === "muggy") {
		state.holeStates[index] = "clean";
		state.points += 12;
		scheduleHoleRedig(index);
	}

	render();
	checkEndConditions();
}

// Extractor action: pay extraction cost and add flexible reservoir units by hole quality.
function extractWater(index) {
	if (!isPlaying()) {
		return;
	}

	state.activeHoleIndex = index;

	// Prevent overfilling and prompt the player to spend from the reservoir.
	if (state.reservoirUnits >= RESERVOIR_MAX_UNITS) {
		state.pointsNotice = "Reservoir Maxed: click it to purify.";
		render();
		return;
	}

	const holeState = state.holeStates[index];

	if (holeState === "clean") {
		// Clean water extraction is cheaper and fills more.
		state.points = Math.max(0, state.points - CLEAN_EXTRACTION_COST);
		state.reservoirUnits = Math.min(RESERVOIR_MAX_UNITS, state.reservoirUnits + CLEAN_EXTRACTION_UNITS);
		state.pointsNotice = `Extraction Cost: -${CLEAN_EXTRACTION_COST} | Fill +${CLEAN_EXTRACTION_UNITS}%`;
	} else {
		// Muggy water auto-filtering costs more and fills less.
		state.points = Math.max(0, state.points - MUGGY_EXTRACTION_COST);
		state.reservoirUnits = Math.min(RESERVOIR_MAX_UNITS, state.reservoirUnits + MUGGY_EXTRACTION_UNITS);
		state.pointsNotice = `Auto-Filter Cost: -${MUGGY_EXTRACTION_COST} | Fill +${MUGGY_EXTRACTION_UNITS}%`;
	}

	if (state.reservoirUnits === RESERVOIR_MAX_UNITS) {
		state.pointsNotice = `${state.pointsNotice} | Reservoir Maxed`;
	}

	render();
	checkEndConditions();
}

// Spend any amount of reservoir water; rewards scale with current fill percent.
function spendReservoirWater() {
	if (!isPlaying()) {
		return;
	}

	if (state.reservoirUnits <= 0) {
		return;
	}

	const fillRatio = state.reservoirUnits / RESERVOIR_MAX_UNITS;
	const fillPercent = Math.round(fillRatio * 100);
	const pollutionReductionAmount = Math.max(1, Math.round(getCurrentLevel().pollutionReductionAmount * fillRatio));
	const pointReward = Math.max(20, Math.round(RESERVOIR_REWARD_POINTS * fillRatio));

	state.pollution = clamp(state.pollution - pollutionReductionAmount);
	state.points += pointReward;
	state.reservoirUnits = 0;
	state.pointsNotice = `Reservoir Purify (${fillPercent}%): -${pollutionReductionAmount} pollution, +${pointReward} points`;
	render();
	checkEndConditions();
}

// One-second game loop tick: countdown time.
function tick() {
	if (!isPlaying()) {
		return;
	}

	state.secondsRemaining = Math.max(0, state.secondsRemaining - 1);
	render();
	checkEndConditions();
}

// Tool button handlers switch the active action mode.
shovelButton.addEventListener("click", () => {
	if (!isPlaying()) {
		return;
	}

	setSelectedTool("shovel");
	state.pointsNotice = "";
	render();
});

extractorButton.addEventListener("click", () => {
	if (!isPlaying()) {
		return;
	}

	setSelectedTool("extractor");
	state.pointsNotice = "";
	render();
});

pauseButton.addEventListener("click", showPauseMenu);
pauseContinueButton.addEventListener("click", resumeFromPause);
pauseRestartButton.addEventListener("click", () => {
	pauseScreen.classList.remove("visible");
	startLevel(state.currentLevelIndex);
});

// Hole clicks run either digging or extraction, based on active tool.
holes.forEach((hole, index) => {
	hole.addEventListener("click", () => {
		// Route click to the currently selected tool action.
		if (state.selectedTool === "shovel") {
			digHole(index);
			return;
		}

		extractWater(index);
	});
});

// Reservoir supports both mouse and keyboard activation.
waterReservoirContainer.addEventListener("click", spendReservoirWater);
waterReservoirContainer.addEventListener("keydown", (event) => {
	// Space/Enter mirrors click behavior for keyboard users.
	if (event.key === "Enter" || event.key === " ") {
		event.preventDefault();
		spendReservoirWater();
	}
});

// Restart control either advances to the next level or restarts the current one.
restartButton.addEventListener("click", () => {
	// Always clear particles when leaving any end/transition overlay.
	confettiContainer.innerHTML = "";

	// On level-complete overlay, continue progression instead of reset.
	if (state.overlayMode === OVERLAY_MODE.NEXT_LEVEL) {
		advanceToNextLevel();
		return;
	}

	startLevel(state.currentLevelIndex);
});

// Level selector allows direct start from any level.
levelSelector.addEventListener("click", (event) => {
	const target = event.target;

	// Ignore clicks that do not originate from a level button.
	if (!(target instanceof HTMLElement)) {
		return;
	}

	const levelButton = target.closest(".level-button");

	if (!(levelButton instanceof HTMLButtonElement)) {
		return;
	}

	const levelIndex = Number(levelButton.dataset.levelIndex);

	if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= LEVELS.length) {
		return;
	}

	// Block locked levels and explain the unlock requirement.
	if (levelIndex > state.highestUnlockedLevelIndex) {
		state.pointsNotice = `Locked: Clear ${LEVELS[levelIndex - 1].name} first`;
		render();
		return;
	}

	startLevel(levelIndex);
});

// Close intro modal and start the game.
function hideIntroModal() {
	introModal.classList.add("hidden");
}

// Show intro modal at startup.
function showIntroModal() {
	introModal.classList.remove("hidden");
}

// Initial setup before the game loop starts.
waterReservoirContainer.setAttribute("role", "button");
waterReservoirContainer.setAttribute("tabindex", "0");

// Start button handler: close intro and begin game.
startButton.addEventListener("click", () => {
	hideIntroModal();
	startLevel(0);
});

// Show intro modal on page load instead of immediately starting.
showIntroModal();

