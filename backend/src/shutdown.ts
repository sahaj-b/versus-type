import app from "./app";
import { broadcastShutdown } from "./socket/chat.socket";
import { io } from "./ws-server";

export let isShuttingDown = false;
const SHUTDOWN_DELAY_MS = 45 * 1000;

export async function gracefulShutdown() {
	if (isShuttingDown) {
		console.log("Force exiting immediately...");
		process.exit(1);
	}

	const totalPlayers = io.engine.clientsCount;

	if (totalPlayers === 0) {
		console.log("No connected players. Shutting down immediately.");
		process.exit(0);
	}

	console.log(`Total connected players: ${totalPlayers}`);

	isShuttingDown = true;
	console.log("Shutting down gracefully... Press Ctrl+C again to force exit.");

	broadcastShutdown(io, (SHUTDOWN_DELAY_MS / 1000).toFixed(0));

	await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_DELAY_MS));

	io.disconnectSockets();
	console.log("All sockets disconnected.");

	app.close(() => {
		console.log("HTTP server closed.");
	});

	process.exit(0);
}
