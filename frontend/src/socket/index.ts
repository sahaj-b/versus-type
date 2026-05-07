import type {
	ClientToServerEvents,
	JoinResponse,
	ServerToClientEvents,
} from "@versus-type/shared";
import { io, type Socket } from "socket.io-client";
import { WS_URL } from "@/const";

export let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null =
	null;

export async function setupSocketAndJoin(
	roomCode: string,
): Promise<JoinResponse> {
	return new Promise((resolve, reject) => {
		socket = io(WS_URL, { withCredentials: true });

		socket.on("connect", async () => {
			try {
				const response = (await socket?.emitWithAck("pvp:join", {
					roomCode,
				})) as JoinResponse;
				resolve(response);
			} catch (error) {
				reject(error);
			}
		});

		socket.on("connect_error", (error) => {
			reject(error);
		});
	});
}

export function disconnectSocket() {
	if (socket) {
		socket.disconnect();
		socket = null;
	}
}
