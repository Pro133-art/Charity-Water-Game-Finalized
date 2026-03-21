// Cache frequently used DOM nodes once during startup.
const pollutionBar = document.getElementById("pollutionBar");
const pollutionBarContainer = document.getElementById("pollutionBarContainer");
const waterReservoir = document.getElementById("waterReservoir");
const waterReservoirContainer = document.getElementById("waterReservoirContainer");
const timer = document.getElementById("timer");
const points = document.getElementById("points");
const shovelButton = document.getElementById("shovelButton");
const extractorButton = document.getElementById("extractorButton");
const gameContainer = document.getElementById("water-hole-game");
const endScreen = document.getElementById("endScreen");
const endScreenTitle = document.getElementById("endScreenTitle");
const endScreenMessage = document.getElementById("endScreenMessage");
const restartButton = document.getElementById("restartButton");
const cwDonateBtn = document.getElementById("cwDonateBtn");
const holes = Array.from(document.querySelectorAll(".hole"));

// Core limits and gameplay tuning values.
const MAX_LEVEL = 100;
const MIN_LEVEL = 0;
const STARTING_POINTS = 500;
const RESERVOIR_SEGMENTS = 4;
const CLEAN_EXTRACTION_COST = 100;
const MUGGY_EXTRACTION_COST = 150;
const RESERVOIR_REWARD_POINTS = 200;
const HOLE_REDIG_DELAY_MS = 8000;
const LEVELS = [
	{ name: "Level 1", totalSeconds: 120, pollutionReductionAmount: 18 },
	{ name: "Level 2", totalSeconds: 150, pollutionReductionAmount: 12 },
	{ name: "Level 3", totalSeconds: 180, pollutionReductionAmount: 8 },
];

// Return active level data from the level list.
function getCurrentLevel() {
	return LEVELS[state.currentLevelIndex];
}

// Mutable state for a single game session.
const state = {
	pollution: 100,
	water: 0,
	points: STARTING_POINTS,
	secondsRemaining: LEVELS[0].totalSeconds,
	selectedTool: "shovel",
	activeHoleIndex: 0,
	holeStates: Array.from({ length: holes.length }, () => "muggy"),
	holeRespawnTimeoutIds: Array.from({ length: holes.length }, () => null),
	reservoirSegments: 0,
	currentLevelIndex: 0,
	pointsNotice: "",
	gameStatus: "playing",
	overlayMode: "restart",
	intervalId: null,
};

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
	pollutionBar.style.width = `${state.pollution}%`;
	state.water = (state.reservoirSegments / RESERVOIR_SEGMENTS) * 100;
	waterReservoir.style.height = `${state.water}%`;
	pollutionBarContainer.setAttribute("aria-valuenow", String(Math.round(state.pollution)));
	pollutionBarContainer.setAttribute("aria-valuetext", `${Math.round(state.pollution)} percent polluted`);
	waterReservoirContainer.setAttribute(
		"aria-label",
		`Water reservoir ${state.reservoirSegments} of ${RESERVOIR_SEGMENTS} segments filled`
	);
	waterReservoirContainer.setAttribute("aria-disabled", String(state.reservoirSegments < RESERVOIR_SEGMENTS));
	waterReservoirContainer.classList.toggle("ready", state.reservoirSegments >= RESERVOIR_SEGMENTS);
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

// Single render entry point used after every state mutation.
function render() {
	renderBars();
	renderScoreboard();
	renderHoles();
}

// Revert a cleaned hole back to muggy after a short cooldown.
function scheduleHoleRedig(index) {
	const existingTimeoutId = state.holeRespawnTimeoutIds[index];

	if (existingTimeoutId !== null) {
		window.clearTimeout(existingTimeoutId);
	}

	state.holeRespawnTimeoutIds[index] = window.setTimeout(() => {
		state.holeRespawnTimeoutIds[index] = null;

		if (state.gameStatus !== "playing" || state.holeStates[index] !== "clean") {
			return;
		}

		state.holeStates[index] = "muggy";
		render();
	}, HOLE_REDIG_DELAY_MS);
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

// Prepare and start the next level while keeping score continuity.
function advanceToNextLevel() {
	state.currentLevelIndex += 1;
	state.pollution = 100;
	state.reservoirSegments = 0;
	state.secondsRemaining = getCurrentLevel().totalSeconds;
	state.pointsNotice = `${getCurrentLevel().name}: less pollution removed per reservoir`;
	state.holeStates = Array.from({ length: holes.length }, () => "muggy");
	clearHoleRedigTimers();
	hideOverlay();
	state.gameStatus = "playing";
	render();
}

// Stop gameplay and reveal end-game overlay for win/loss states.
function endGame(status, message) {
	if (state.gameStatus !== "playing") {
		return;
	}

	state.gameStatus = status;

	if (state.intervalId !== null) {
		window.clearInterval(state.intervalId);
		state.intervalId = null;
	}

	clearHoleRedigTimers();

	if (status === "won") {
		cwDonateBtn.removeAttribute("hidden");
	} else {
		cwDonateBtn.setAttribute("hidden", "hidden");
	}

	showOverlay(status === "won" ? "Mission Accomplished" : "Game Over", message, "Play Again", "restart");
}

// Move to next level when available, otherwise finish the run as a win.
function completeLevelOrWin() {
	const isFinalLevel = state.currentLevelIndex >= LEVELS.length - 1;

	if (isFinalLevel) {
		endGame("won", "You cleared all 3 levels and emptied every pollution bar.");
		return;
	}

	state.gameStatus = "paused";
	clearHoleRedigTimers();

	const nextLevel = LEVELS[state.currentLevelIndex + 1];
	const currentLevelName = getCurrentLevel().name;

	showOverlay(
		"Level Complete",
		`${currentLevelName} cleared. Next: ${nextLevel.name} (${nextLevel.totalSeconds}s, -${nextLevel.pollutionReductionAmount} pollution per full reservoir).`,
		`Start ${nextLevel.name}`,
		"next-level"
	);
}

// Evaluate winning and losing rules after each meaningful game update.
function checkEndConditions() {
	if (state.gameStatus !== "playing") {
		return;
	}

	if (state.pollution <= MIN_LEVEL) {
		completeLevelOrWin();
		return;
	}

	if (state.secondsRemaining <= 0) {
		endGame("lost", "The timer reached 00:00 before the Pollution Bar was empty.");
		return;
	}

	if (state.points <= 0) {
		endGame("lost", "Your points bank reached 0 before the Pollution Bar was empty.");
	}
}

// Shovel action: clean muggy holes and reward points.
function digHole(index) {
	if (state.gameStatus !== "playing") {
		return;
	}

	state.activeHoleIndex = index;
	state.pointsNotice = "";

	if (state.holeStates[index] === "muggy") {
		state.holeStates[index] = "clean";
		state.points += 12;
		scheduleHoleRedig(index);
	}

	render();
	checkEndConditions();
}

// Extractor action: pay extraction cost based on hole quality and fill reservoir by one segment.
function extractWater(index) {
	if (state.gameStatus !== "playing") {
		return;
	}

	state.activeHoleIndex = index;

	// Prevent overfilling and prompt the player to spend the full reservoir.
	if (state.reservoirSegments >= RESERVOIR_SEGMENTS) {
		state.pointsNotice = `Reservoir Full: Click it to purify (-${getCurrentLevel().pollutionReductionAmount} pollution, +${RESERVOIR_REWARD_POINTS} points)`;
		render();
		return;
	}

	const holeState = state.holeStates[index];

	if (holeState === "clean") {
		state.points = Math.max(0, state.points - CLEAN_EXTRACTION_COST);
		state.pointsNotice = `Extraction Cost: -${CLEAN_EXTRACTION_COST}`;
	} else {
		state.points = Math.max(0, state.points - MUGGY_EXTRACTION_COST);
		state.pointsNotice = `Auto-Filter Cost: -${MUGGY_EXTRACTION_COST}`;
	}

	state.reservoirSegments = Math.min(RESERVOIR_SEGMENTS, state.reservoirSegments + 1);

	if (state.reservoirSegments === RESERVOIR_SEGMENTS) {
		state.pointsNotice = `${state.pointsNotice} | Reservoir Ready`;
	}

	render();
	checkEndConditions();
}

// Spend a full reservoir to reduce pollution and refund points.
function spendReservoirWater() {
	if (state.gameStatus !== "playing") {
		return;
	}

	if (state.reservoirSegments < RESERVOIR_SEGMENTS) {
		return;
	}

	const pollutionReductionAmount = getCurrentLevel().pollutionReductionAmount;
	state.pollution = clamp(state.pollution - pollutionReductionAmount);
	state.points += RESERVOIR_REWARD_POINTS;
	state.reservoirSegments = 0;
	state.pointsNotice = `Reservoir Purify Reward: -${pollutionReductionAmount} pollution, +${RESERVOIR_REWARD_POINTS} points`;
	render();
	checkEndConditions();
}

// One-second game loop tick: countdown time.
function tick() {
	if (state.gameStatus !== "playing") {
		return;
	}

	state.secondsRemaining = Math.max(0, state.secondsRemaining - 1);
	render();
	checkEndConditions();
}

// Tool button handlers switch the active action mode.
shovelButton.addEventListener("click", () => {
	if (state.gameStatus !== "playing") {
		return;
	}

	setSelectedTool("shovel");
	state.pointsNotice = "";
	render();
});

extractorButton.addEventListener("click", () => {
	if (state.gameStatus !== "playing") {
		return;
	}

	setSelectedTool("extractor");
	state.pointsNotice = "";
	render();
});

// Hole clicks run either digging or extraction, based on active tool.
holes.forEach((hole, index) => {
	hole.addEventListener("click", () => {
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
	if (event.key === "Enter" || event.key === " ") {
		event.preventDefault();
		spendReservoirWater();
	}
});

// Restart control resets state by reloading the page.
restartButton.addEventListener("click", () => {
	if (state.overlayMode === "next-level") {
		advanceToNextLevel();
		return;
	}

	window.location.reload();
});

// Initial setup before the game loop starts.
setSelectedTool(state.selectedTool);
waterReservoirContainer.setAttribute("role", "button");
waterReservoirContainer.setAttribute("tabindex", "0");
render();
state.intervalId = window.setInterval(tick, 1000);
