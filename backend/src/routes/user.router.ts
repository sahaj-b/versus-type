import type { MatchHistoryResponse, UserStats } from "@versus-type/shared";
import { desc, eq, sql } from "drizzle-orm";
import express from "fulmine.js";
import { rollingAvgWpmFromDB } from "@/socket/dbservice";
import { db } from "../db";
import { matches, matchParticipants, soloMatch, userStats } from "../db/schema";

const userRouter = express.Router();

userRouter.get("/", async (_, res) => {
	res.json(res.locals.session);
});

userRouter.get("/stats", async (_, res) => {
	const session = res.locals.session;
	if (!session) {
		res.status(401).json({ error: "Unauthorized" });
		return;
	}
	const [statsResult, rollingAvgResult] = await Promise.allSettled([
		await db
			.select()
			.from(userStats)
			.where(eq(userStats.userId, session.user.id)),
		await rollingAvgWpmFromDB(session.user.id),
	]);

	if (statsResult.status === "rejected") {
		res.status(500).json({ error: "Database error" });
		return;
	}

	let stats = statsResult.value;
	if (stats.length === 0) {
		stats = await db
			.insert(userStats)
			.values({ userId: session.user.id })
			.returning();
	}
	if (stats.length === 0) {
		res.status(500).json({ error: "Could not create user stats" });
		return;
	}

	const { userId: __, updatedAt: ___, ...returnObj } = stats[0];
	res.json({
		...returnObj,
		rollingAvgWpm:
			rollingAvgResult.status === "fulfilled"
				? (rollingAvgResult.value ?? 0)
				: 0,
	} as UserStats);
});

userRouter.get("/matches", async (req, res) => {
	const session = res.locals.session;
	if (!session) {
		res.status(401).json({ error: "Unauthorized" });
		return;
	}

	const limit = Math.min(Number(req.query.limit) || 10, 50);
	const offset = Number(req.query.offset) || 0;

	try {
		const pvpQuery = db
			.select({
				id: matchParticipants.id,
				type: sql<string>`'pvp'`.as("type"),
				wpm: matchParticipants.wpm,
				accuracy: matchParticipants.accuracy,
				ordinal: matchParticipants.ordinal,
				passageConfig: matches.passageConfig,
				createdAt: matchParticipants.createdAt,
			})
			.from(matchParticipants)
			.innerJoin(matches, eq(matchParticipants.matchId, matches.id))
			.where(eq(matchParticipants.userId, session.user.id));

		const soloQuery = db
			.select({
				id: soloMatch.id,
				type: sql<string>`'solo'`.as("type"),
				wpm: soloMatch.wpm,
				accuracy: soloMatch.accuracy,
				ordinal: sql<null>`NULL`.as("ordinal"),
				passageConfig: soloMatch.passageConfig,
				createdAt: soloMatch.createdAt,
			})
			.from(soloMatch)
			.where(eq(soloMatch.userId, session.user.id));

		const results = await db
			.select()
			.from(pvpQuery.unionAll(soloQuery).as("combined"))
			.orderBy(desc(sql`created_at`))
			.limit(limit + 1)
			.offset(offset);

		const hasMore = results.length > limit;
		const matchesToReturn = hasMore ? results.slice(0, limit) : results;

		res.json({
			matches: matchesToReturn.map((m) => ({
				id: m.id,
				type: m.type as "solo" | "pvp",
				wpm: m.wpm,
				accuracy: m.accuracy,
				ordinal: m.ordinal,
				passageConfig: m.passageConfig,
				createdAt:
					m.createdAt instanceof Date
						? m.createdAt.toISOString()
						: new Date(m.createdAt * 1000).toISOString(),
			})),
			hasMore,
		} as MatchHistoryResponse);
	} catch (error) {
		console.error("Error fetching match history:", error);
		res.status(500).json({ error: "Database error" });
	}
});

export default userRouter;

// userRouter.patch("/settings", async (req, res) => {
// 	const session = res.locals.session;
// 	if (!session) {
// 		res.status(401).json({ error: "Unauthorized" });
// 		return;
// 	}
// 	const updatedSettings = SettingsSchema.parse(req.body);
// 	const existingSettings = await db
// 		.select()
// 		.from(userSettings)
// 		.where(eq(userSettings.userId, session.user.id));
//
// 	if (existingSettings.length > 0) {
// 		await db
// 			.update(userSettings)
// 			.set(updatedSettings)
// 			.where(eq(userSettings.userId, session.user.id));
// 	} else {
// 		await db
// 			.insert(userSettings)
// 			.values({ userId: session.user.id, ...updatedSettings });
// 	}
//
// 	res.json({ message: "Settings updated successfully" });
// });
//
// userRouter.get("/settings", async (req, res) => {
// 	const session = res.locals.session;
// 	if (!session) {
// 		res.status(401).json({ error: "Unauthorized" });
// 		return;
// 	}
// 	let settings = await db
// 		.select()
// 		.from(userSettings)
// 		.where(eq(userSettings.userId, session.user.id));
// 	if (settings.length === 0) {
// 		settings = await db
// 			.insert(userSettings)
// 			.values({
// 				userId: session.user.id,
// 			})
// 			.returning();
// 	}
// 	const { userId, ...returnObj } = settings[0];
// 	res.json(returnObj);
// });
