import type { ioServer, ioSocket, MatchResults } from "@versus-type/shared";
import {
	getAccuracy,
	recordKey,
	resetAccuracy,
} from "@versus-type/shared/accuracy";
import {
	GeneratorConfigSchema,
	generatePassage,
} from "@versus-type/shared/passage-generator";
import { emitNewMessage } from "./chat.socket";
import {
	newRollingAvgWpmFromDB,
	rollingAvgWpmFromDB,
	updatePlayersInfoInDB,
} from "./dbservice";
import { KEY_BUFFER_SIZE, MAX_BUFFER } from "./keyBufSizeController";
import {
	activePlayersCount,
	initialPlayerState,
	participantCount,
	reinitializeRoomState,
	roomStates,
	startNukeTimer,
	toPlayersInfo,
	typingPlayerCount,
	updateRoomAvgWpm,
} from "./store";
import { calcWpm, getRandomColor, getWordIndex } from "./utils";

const COUNTDOWN_SECONDS = 3;
const WAITING_COUNTDOWN_SECONDS = 15;
const NUKE_TIMEOUT_MS = 30 * 1000;

export function registerPvpSessionHandlers(io: ioServer, socket: ioSocket) {
	socket.on("pvp:join", async (data, callback) => {
		if (!callback) return;
		const { roomCode } = data;
		if (!roomCode) {
			return callback({
				success: false,
				message: "Room code is required",
			});
		}
		if (!socket.data.username?.trim()) {
			console.warn(`FE error: username not set for socket ${socket.id}`);
			return callback({
				success: false,
				message: "Username is not set",
			});
		}
		const roomState = roomStates[roomCode];
		if (!roomState || roomState.status === "closed") {
			console.warn(`Room state for ${roomCode} not found when joining`);
			setTimeout(() => {
				socket.disconnect(true);
			}, 1000);
			return callback({
				success: false,
				message: `Room '${roomCode}' not found`,
			});
		}

		let isHost = roomState.type !== "matchmaking";
		if (isHost && io.sockets.adapter.rooms.has(roomCode)) isHost = false;

		socket.data.roomCode = roomCode;

		if (isHost) socket.data.isHost = true;

		const room = io.sockets.adapter.rooms.get(roomCode);
		if (!isHost && room && room.size >= roomState.maxPlayers) {
			return callback({ success: false, message: "Room is full" });
		}

		socket.join(roomCode);

		console.log(
			isHost
				? `Match hosted with code ${roomCode} by player ${socket.id}`
				: `Player ${socket.id}(${socket.data.username}) joined match with code ${roomCode}`,
		);

		const player = roomState.players[socket.data.userId];
		let oppTypingIndexes: Record<string, number> = {};
		const playerCnt = activePlayersCount(roomCode);
		let reconnected = false;
		if (isHost || (roomState.type === "matchmaking" && playerCnt === 0)) {
			roomState.passage = await generatePassage(roomState.passageConfig);
		} else {
			oppTypingIndexes = roomState.isMatchStarted
				? Object.fromEntries(
						Object.entries(roomState.players)
							.filter(([userId, _]) => userId !== socket.data.userId)
							.map(([userId, p]) => [userId, p.typingIndex]),
					)
				: {};
			if (player) {
				// reconnecting player
				player.disconnected = false;
				player.username = socket.data.username || player.username;
				reconnected = true;
				if (roomStates[roomCode].isMatchStarted && !player.typingIndex) {
					// only set spectator if player hasn't typed yet
					player.spectator = true;
				}
				emitNewMessage(io, roomCode, {
					username: "",
					message: `${socket.data.username ?? "<Unknown>"} is back`,
					system: true,
				});
			} else {
				emitNewMessage(io, roomCode, {
					username: "",
					message: `${socket.data.username ?? "<Unknown>"} in da house`,
					system: true,
				});
			}
		}

		callback({
			success: true,
			message: isHost
				? `Room hosted with code ${roomCode}`
				: reconnected
					? `Reconnected to room ${roomCode}`
					: `Joined room ${roomCode}`,
			gameState: {
				type: roomState.type,
				isStarted: roomState.isMatchStarted,
				isEnded: roomState.isMatchEnded,
				typingIndex: player?.typingIndex || 0,
				oppTypingIndexes,
				chatHistory: roomState.chat,
				passage: roomState.passage,
				passageConfig: roomState.passageConfig,
			},
		});

		if (!player) {
			roomState.players[socket.data.userId] = {
				...initialPlayerState,
				isHost: isHost,
				username: socket.data.username || "<Unknown>",
				spectator: roomState.isMatchStarted,
				color: getRandomColor(roomCode),
			};
		}

		sendLobbyUpdate(io, roomCode);

		rollingAvgWpmFromDB(socket.data.userId).then((avgWpm) => {
			const player = roomState.players[socket.data.userId];
			if (player) {
				player.rollingAvgWpm = avgWpm;
				updateRoomAvgWpm(roomCode);
			}
		});

		if (
			playerCnt === 1 &&
			roomState.type === "matchmaking" &&
			roomState.status === "waiting"
		) {
			// second player joined, start waiting countdown
			roomState.stopWaitingCountdown = startWaitingCountdown(
				io,
				roomCode,
				() => {
					roomState.stopWaitingCountdown = undefined;
					startMatch(io, roomCode);
				},
			);
		}
	});

	socket.on("disconnect", () => {
		const roomCode = socket.data.roomCode;
		const username = socket.data.username;
		if (roomCode) {
			emitNewMessage(io, roomCode, {
				username: "",
				message: `${username ?? "<Unknown>"} disconnected`,
				system: true,
			});
			if (!roomStates[roomCode]) {
				console.warn(`disconnect: roomStates[${roomCode}] not found`);
				return;
			}
			const roomState = roomStates[roomCode];
			const room = io.sockets.adapter.rooms.get(roomCode);
			const disconnectedPlayer = roomState.players[socket.data.userId];

			if (!disconnectedPlayer) {
				console.warn(
					`disconnect: player ${socket.data.userId} not found in roomState.players`,
				);
				return;
			}

			if (!room || room.size === 0) {
				console.log(`Starting nuke timer for ${roomCode}`);
				if (roomState?.status !== "closed") {
					// closeRoom(roomCode, io);
					roomState.players = {};
					startNukeTimer(roomCode, NUKE_TIMEOUT_MS);
				}
			} else {
				if (socket.data.isHost) {
					// change host
					let newHostSocketId: string | null = null;
					for (const memberId of room) {
						if (memberId !== socket.id) {
							newHostSocketId = memberId;
							break;
						}
					}
					if (!newHostSocketId) return;

					const newHostSocket = io.sockets.sockets.get(newHostSocketId);
					if (newHostSocket) {
						const newHostUserId = newHostSocket.data.userId;
						if (!newHostUserId) return;
						newHostSocket.data.isHost = true;
						roomState.hostId = newHostUserId;
						if (!roomState.players[newHostUserId]) return;
						roomState.players[newHostUserId].isHost = true;
						disconnectedPlayer.isHost = false;
						emitNewMessage(io, roomCode, {
							username: "",
							message: `${newHostSocket.data.username ?? "<Unknown>"} is the new host`,
							system: true,
						});
					}
				}
				sendWpmUpdate(io, roomCode);
				if (
					roomState.type === "matchmaking" &&
					roomState.status === "waiting"
				) {
					delete roomState.players[socket.data.userId];
				} else {
					disconnectedPlayer.disconnected = true;
				}

				if (
					roomState.type === "matchmaking" &&
					roomState.status === "waiting" &&
					roomState.stopWaitingCountdown &&
					activePlayersCount(roomCode) < 2
				) {
					// stop waiting countdown if 2nd player disconnected
					roomState.stopWaitingCountdown();
					roomState.stopWaitingCountdown = undefined;
				}

				if (
					roomState.isMatchStarted &&
					!disconnectedPlayer.finished &&
					!disconnectedPlayer.spectator &&
					typingPlayerCount(roomCode) === 0
				) {
					// LAST TYPING PLAYER DISCONNECTED
					endMatch(roomCode, io);
				}
			}
			sendLobbyUpdate(io, roomCode);
			updateRoomAvgWpm(roomCode);
		}
	});

	socket.on("pvp:start-match", async (callback) => {
		if (!socket.data.isHost) {
			callback({
				success: false,
				message: "Only the host can start the match",
			});
			console.warn(
				`Non-host player ${socket.id}(${socket.data.username}) tryna start match`,
			);
			return;
		}
		const roomCode = socket.data.roomCode;

		if (!roomCode) {
			callback({
				success: false,
				message: "Error starting match, join the match again",
			});
			console.warn(
				"roomCode not found in socket.data (Some sent start-match without joining)",
			);
			return;
		}
		if (roomStates[roomCode]?.isMatchStarted) {
			callback({
				success: false,
				message: "Match already started",
			});
			return;
		}

		await startMatch(io, roomCode, () => {
			callback({
				success: true,
				message: "Match started",
				keyBufferSize: KEY_BUFFER_SIZE,
			});
		});
	});

	socket.on("pvp:keystrokes", (input: string) => {
		if (input.length > MAX_BUFFER) {
			console.warn(
				`Player ${socket.data.userId} sent too many keystrokes at once`,
			);
			return;
		}
		if (input.length === 0) {
			console.warn(`Player ${socket.data.userId} sent empty keystroke`);
			return;
		}

		const roomCode = socket.data.roomCode;
		const roomState = roomStates[roomCode!];
		if (!roomCode || !roomState?.isMatchStarted) {
			console.warn(
				`lol ${socket.data.userId} tryna cheat by sending key-press before starting match`,
			);
			return;
		}

		const player = roomState.players[socket.data.userId];
		if (player.finished) return;

		if (player.spectator) {
			console.warn(
				`spectator ${socket.data.userId} tryna send key-press during match lmao`,
			);
			return;
		}
		const passage = roomState.passage;

		if (!player.startedAt) player.startedAt = Date.now();

		let lastCorrectIndex =
			player.incorrectIdx === null ? player.typingIndex : null;

		for (const key of input) {
			if (player.finished) break;

			player.accState = recordKey(
				player.accState ?? resetAccuracy(),
				key,
				passage[player.typingIndex],
			);

			if (player.incorrectIdx === null && passage[player.typingIndex] === key) {
				if (key === " ") {
					const wordIdx = getWordIndex(player.typingIndex, passage);
					if (wordIdx > (player.lastCompletedWord ?? -1)) {
						player.streak = (player.streak || 0) + 1;
						if (player.streak > (player.maxStreak || 0)) {
							player.maxStreak = player.streak;
						}
						player.lastCompletedWord = wordIdx;
					}
				}

				if (player.typingIndex >= passage.length - 1) {
					// PLAYER FINISHED
					lastCorrectIndex = player.typingIndex + 1;
					player.finished = true;
					player.wpm = calcWpm(player.typingIndex, player.startedAt);
					player.accuracy = getAccuracy(player.accState);
					sendWpmUpdate(io, roomCode);
					player.timeTyped = Math.round((Date.now() - player.startedAt) / 1000);

					newRollingAvgWpmFromDB(socket.data.userId, player.wpm).then(
						(newAvg) => {
							player.rollingAvgWpm = newAvg;
							updateRoomAvgWpm(roomCode);
						},
					);

					const maxOrdinal = Object.values(roomState.players).reduce(
						(max, pl) => (pl.ordinal && pl.ordinal > max ? pl.ordinal : max),
						0,
					);
					player.ordinal = maxOrdinal + 1;
					if (player.ordinal === participantCount(roomCode)) {
						// LAST PLAYER FINISHED
						endMatch(roomCode, io);
					}

					sendLobbyUpdate(io, roomCode);
					player.typingIndex++;
					break;
				}
				lastCorrectIndex = player.typingIndex + 1;
			} else {
				if (player.incorrectIdx === null)
					player.incorrectIdx = player.typingIndex;

				player.streak = 0;
			}
			player.typingIndex++;
		}

		if (lastCorrectIndex !== null) {
			io.to(roomCode).emit("pvp:progress-update", {
				userId: socket.data.userId ?? socket.id,
				typingIndex: lastCorrectIndex,
			});
		}
	});

	socket.on("pvp:backspace", (amount: number) => {
		const roomCode = socket.data.roomCode;
		if (!roomCode || !roomStates[roomCode]?.isMatchStarted) {
			console.warn(
				`lol ${socket.data.userId} tryna cheat by sending backspace before starting match`,
			);
			return;
		}
		const player = roomStates[roomCode].players[socket.data.userId];
		if (player.spectator) {
			console.warn(
				`spectator ${socket.data.userId} tryna send backspace during match lmao`,
			);
			return;
		}
		player.typingIndex = Math.max(0, player.typingIndex - amount);
		if (
			player.incorrectIdx !== null &&
			player.typingIndex <= player.incorrectIdx
		) {
			player.incorrectIdx = null;
		}
		if (player.incorrectIdx == null) {
			io.to(roomCode).emit("pvp:progress-update", {
				userId: socket.data.userId || socket.id,
				typingIndex: player.typingIndex,
			});
		}
	});

	socket.on("passage:config-change", async (config) => {
		if (!socket.data.isHost) {
			console.log(
				`Non-host player ${socket.id}(${socket.data.username}) tryna change passage config`,
			);
			return;
		}
		const roomCode = socket.data.roomCode;
		if (!roomCode || !roomStates[roomCode]) {
			console.warn(
				`passage:config-change: roomState for ${roomCode} not found`,
			);
			return;
		}
		if (roomStates[roomCode].isMatchStarted) {
			console.log(
				`Host player ${socket.id}(${socket.data.username}) tryna change passage config during an ongoing match`,
			);
			return;
		}
		const result = GeneratorConfigSchema.safeParse(config);
		if (!result.success) {
			console.warn(
				`Invalid passage config from ${socket.data.userId}:`,
				result.error,
			);
			return;
		}
		const roomState = roomStates[roomCode];
		roomState.passageConfig = result.data;
		roomState.passage = await generatePassage(roomState.passageConfig);

		io.to(roomCode).emit(
			"passage:put",
			roomState.passage,
			roomState.passageConfig,
		);
	});
}

function startWpmUpdates(io: ioServer, roomCode: string) {
	const timeoutId = setInterval(() => {
		const roomState = roomStates[roomCode];
		if (!roomState || !roomState.isMatchStarted) return;
		if (roomState.status === "closed" || roomState.isMatchEnded) {
			clearInterval(timeoutId);
			return;
		}
		for (const userId in roomState.players) {
			const player = roomState.players[userId];
			if (player.finished || player.disconnected || player.spectator) continue;
			player.wpm = calcWpm(player.typingIndex, player.startedAt);
		}

		sendWpmUpdate(io, roomCode);
	}, 1000);
}

function sendWpmUpdate(io: ioServer, roomCode: string) {
	const wpmInfo = Object.fromEntries(
		Object.entries(roomStates[roomCode].players).map(([userId, player]) => [
			userId,
			player.wpm ?? 0,
		]),
	);

	io.to(roomCode).emit("pvp:wpm-update", wpmInfo);
}

async function startCountdown(io: ioServer, roomCode: string) {
	io.to(roomCode).emit("pvp:countdown", COUNTDOWN_SECONDS);
	let countdown = COUNTDOWN_SECONDS;
	const countdownInterval = setInterval(() => {
		countdown--;
		io.to(roomCode).emit("pvp:countdown", countdown);
		if (countdown === 0) {
			if (roomStates[roomCode]) roomStates[roomCode].isMatchStarted = true;
			clearInterval(countdownInterval);
		}
	}, 1000);
}

function sendLobbyUpdate(io: ioServer, roomCode: string) {
	if (!roomStates[roomCode]) {
		console.warn(`sendLobbyUpdate: state/players for ${roomCode} not found`);
		return;
	}
	io.to(roomCode).emit(
		"pvp:lobby-update",
		toPlayersInfo(roomStates[roomCode].players),
	);
}

async function endMatch(roomCode: string, io: ioServer) {
	const matchResults: MatchResults = {};
	const roomState = roomStates[roomCode];
	for (const userId in roomState.players) {
		const player = roomState.players[userId];
		matchResults[userId] = {
			wpm: player.wpm || 0,
			accuracy: player.accuracy || 0,
			ordinal: player.ordinal || 0,
		};
	}
	roomState.isMatchStarted = false;
	roomState.isMatchEnded = true;
	roomState.status = "waiting";
	roomState.passage = await generatePassage(roomState.passageConfig);
	io.to(roomCode).emit("pvp:match-ended", matchResults);

	if (roomState.type === "matchmaking") {
		roomState.status = "closed";
	}

	await updatePlayersInfoInDB(roomState);
}

// async function closeRoom(roomCode: string, io: ioServer) {
// 	// deleting rooms immediately.
// 	// alternative: update status to 'closed', setup cron job or setTimeout to delete closed rooms
// 	delete roomStates[roomCode];
// 	io.to(roomCode).emit("pvp:disconnect", { reason: "Room closed" });
// 	// io.socketsLeave(roomCode);
// 	setTimeout(() => {
// 		// disconnect all clients
// 		const room = io.sockets.adapter.rooms.get(roomCode);
// 		if (room) {
// 			for (const memberId of room) {
// 				const memberSocket = io.sockets.sockets.get(memberId);
// 				if (memberSocket) memberSocket.disconnect();
// 			}
// 		}
// 	}, 3000); // give clients time to receive the message
// 	console.log(`Room ${roomCode} closed`);
// }

async function startMatch(
	io: ioServer,
	roomCode: string,
	callback?: () => void,
) {
	const roomState = roomStates[roomCode];
	if (roomState.isMatchStarted) return;

	roomState.status = "inProgress";

	await reinitializeRoomState(roomCode);
	io.to(roomCode).emit(
		"passage:put",
		roomState.passage,
		roomState.passageConfig,
	);

	sendLobbyUpdate(io, roomCode);

	startCountdown(io, roomCode);
	callback?.();

	startWpmUpdates(io, roomCode);

	for (const [userId] of Object.entries(roomState.players)) {
		io.to(roomCode).emit("pvp:progress-update", {
			userId,
			typingIndex: 0,
		});
	}
}

function startWaitingCountdown(
	io: ioServer,
	roomCode: string,
	onComplete: () => void,
) {
	let countdown = WAITING_COUNTDOWN_SECONDS;
	let stop = false;
	io.to(roomCode).emit("pvp:waiting-countdown", countdown);
	const countdownInterval = setInterval(() => {
		if (stop) {
			io.to(roomCode).emit("pvp:waiting-countdown", null);
			clearInterval(countdownInterval);
			return;
		}
		countdown--;
		io.to(roomCode).emit("pvp:waiting-countdown", countdown);
		if (countdown === COUNTDOWN_SECONDS) {
			io.to(roomCode).emit("pvp:waiting-countdown", null);
			clearInterval(countdownInterval);
			onComplete();
		}
	}, 1000);
	return () => {
		stop = true;
	};
}
