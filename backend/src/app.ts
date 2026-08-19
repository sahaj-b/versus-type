import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import express from "fulmine.js";
import { auth } from "./auth/auth";
import env from "./env";
import errorHandler from "./middlewares/error.middleware";
import { pvpRouter } from "./routes/pvp.router";
import soloRouter from "./routes/solo.router";
import userRouter from "./routes/user.router";
import { isShuttingDown } from "./shutdown";

const app = express();

app.set("trust proxy", 1);

app.use(
	cors({
		origin: env.CORS_ORIGIN.split(" "),
		credentials: true,
	}),
);

app.use("/api", (_, res, next) => {
	if (isShuttingDown) {
		return res
			.status(503)
			.json({ error: "Server is restarting, please try again later." });
	}
	next();
});

async function authMiddleware(
	req: express.Request,
	res: express.Response,
	next: express.NextFunction,
) {
	const session = await auth.api
		.getSession({
			headers: fromNodeHeaders(req.headers),
		})
		.catch(next);
	if (!session) {
		return res.status(401).json({ error: "Unauthorized" });
	}
	res.locals.session = session;
	next();
}

const apiLimiter = rateLimit({
	windowMs: 5 * 60 * 1000,
	max: 50,
	standardHeaders: true,
	message: { error: "Too many requests, chill out" },
	keyGenerator: (req, res) => {
		return res.locals.session?.user.id || ipKeyGenerator(req.ip || "unknown");
	},
});

app.get("/ping", (_, res) => {
	res.send("pong");
});

app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json({ limit: "16kb" }));

app.use("/api/user", authMiddleware, apiLimiter);
app.use("/api/solo", authMiddleware, apiLimiter);
app.use("/api/pvp/host", authMiddleware, apiLimiter);
app.use("/api/pvp/rooms", apiLimiter);

app.use("/api/user", userRouter);
app.use("/api/solo", soloRouter);
app.use("/api/pvp", pvpRouter);
app.use(errorHandler);

export default app;
