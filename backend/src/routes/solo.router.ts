import { SoloStatsSchema } from "@versus-type/shared";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm/sqlite-core/expressions";
import express from "fulmine.js";
import { db } from "../db";
import { soloMatch, userStats } from "../db/schema";

const soloRouter = express.Router();

soloRouter.post("/", async (req, res) => {
	const session = res.locals.session;
	if (!session) {
		res.status(401).json({ error: "Unauthorized" });
		return;
	}
	const result = SoloStatsSchema.safeParse(req.body);
	if (!result.success) {
		return res.status(400).json({ error: "Invalid match data" });
	}
	const matchData = result.data;
	let isNewHighest = false;
	await db.transaction(async (tx) => {
		const [currentStats] = await tx
			.select({ highestWpm: userStats.highestWpm })
			.from(userStats)
			.where(eq(userStats.userId, session.user.id))
			.limit(1);

		const previousHighest = currentStats?.highestWpm || 0;
		isNewHighest = previousHighest > 0 && matchData.wpm > previousHighest;

		await Promise.all([
			tx.insert(soloMatch).values({
				userId: session.user.id,
				...matchData,
			}),
			tx
				.update(userStats)
				.set({
					soloMatches: sql`${userStats.soloMatches} + 1`,
					avgWpm: sql`(((${userStats.avgWpm} * (${userStats.soloMatches} + ${userStats.pvpMatches})) + ${matchData.wpm}) / (${userStats.soloMatches} + ${userStats.pvpMatches} + 1))`,
					avgAccuracy: sql`(((${userStats.avgAccuracy} * (${userStats.soloMatches} + ${userStats.pvpMatches})) + ${matchData.accuracy}) / (${userStats.soloMatches} + ${userStats.pvpMatches} + 1))`,
					totalTimeTyped: sql`${userStats.totalTimeTyped} + ${matchData.time}`,
					highestWpm: sql`CASE WHEN ${matchData.wpm} > ${userStats.highestWpm} THEN ${matchData.wpm} ELSE ${userStats.highestWpm} END`,
					maxStreak: sql`CASE WHEN ${matchData.maxStreak} > ${userStats.maxStreak} THEN ${matchData.maxStreak} ELSE ${userStats.maxStreak} END`,
				})
				.where(eq(userStats.userId, session.user.id)),
		]);
	});
	res.json({ message: "Successfully saved match data", isNewHighest });
});

export default soloRouter;
