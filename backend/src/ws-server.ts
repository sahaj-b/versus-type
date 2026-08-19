import type {
	ClientToServerEvents,
	InterServerEvents,
	ServerToClientEvents,
	SocketData,
} from "@versus-type/shared";
import type express from "fulmine.js";
import { Server } from "socket.io";
import env from "./env";
import { initializeSocket } from "./socket";

export const io = new Server<
	ClientToServerEvents,
	ServerToClientEvents,
	InterServerEvents,
	SocketData
>(undefined, {
	cors: { origin: env.CORS_ORIGIN.split(" "), credentials: true },
	allowEIO3: true,
	cookie: { name: "io", path: "/", httpOnly: true, sameSite: "none" }, // "none" for cross-origin
});

initializeSocket(io);

/**
 * Socket.IO rides the application's own uWebSockets app, so the sockets and the routes are one
 * server. Called from index.ts rather than here: app.ts imports the shutdown module, which imports
 * this one, so at import time the application is not built yet.
 */
export function attachTo(app: express.FulmineApplication) {
	io.attachApp(app.uwsApp);
}
