import app from "./app";
import env from "./env";
import { gracefulShutdown } from "./shutdown";
import { clearUserSocketMap } from "./socket/middleware";
import { attachTo } from "./ws-server";

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("SIGUSR1", clearUserSocketMap);

attachTo(app);

const port = env.HTTP_PORT;
app.listen(port, "0.0.0.0", () => {
	console.log(`Server is running on port ${port}`);
});

// The same application on the socket port, so the Caddyfile and NEXT_PUBLIC_WS_SERVER_URL keep
// working. Both ports now serve the API and the sockets, so the two can be pointed at one number.
const wsPort = env.WS_PORT;
if (wsPort !== port) {
	app.listen(wsPort, "0.0.0.0", () => {
		console.log(`WS Server (uWS + Socket.IO) running on port ${wsPort}`);
	});
}
