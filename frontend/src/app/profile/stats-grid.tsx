"use client";

import {
	Clock,
	Flame,
	Gamepad2,
	History,
	Rocket,
	Swords,
	Target,
	TrendingUp,
	Trophy,
	Zap,
} from "lucide-react";
import { ProgressStatCard, StatCard } from "@/components/ui/stat-card";

type StatsGridProps = {
	avgWpm: number;
	highestWpm: number;
	avgAccuracy: number;
	wins: number;
	winRate: number;
	totalMatches: number;
	soloMatches: number;
	timeTyped: number;
	rollingAvgWpm: number;
	maxStreak: number;
};

export function StatsGrid({
	avgWpm,
	highestWpm,
	avgAccuracy,
	wins,
	winRate,
	totalMatches,
	soloMatches,
	timeTyped,
	rollingAvgWpm,
	maxStreak,
}: StatsGridProps) {
	return (
		<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
			<StatCard
				title="Avg WPM"
				value={avgWpm}
				suffix="WPM"
				size="large"
				icon={Zap}
				className="col-span-2"
			/>
			<ProgressStatCard
				size="large"
				title="Avg Accuracy"
				value={avgAccuracy}
				icon={Target}
				className="col-span-2 lg:order-1"
			/>
			<StatCard
				title="PvP Avg (last 10)"
				value={rollingAvgWpm}
				suffix="WPM"
				icon={History}
			/>
			<StatCard
				title="Highest WPM"
				value={highestWpm}
				suffix="WPM"
				icon={Rocket}
			/>
			<StatCard
				title="Max Word Streak"
				value={maxStreak}
				icon={Flame}
				className="lg:order-2"
			/>
			<StatCard
				title="Total PvP Matches"
				value={totalMatches}
				icon={Swords}
				className="lg:order-3"
			/>
			<StatCard
				title="PvP Wins"
				value={wins}
				icon={Trophy}
				className="lg:order-4"
			/>
			<StatCard
				title="Solo Sessions"
				value={soloMatches}
				icon={Gamepad2}
				className="lg:order-5"
			/>
			<ProgressStatCard
				title="Win Rate"
				value={winRate}
				icon={TrendingUp}
				className="lg:order-6"
			/>
			<StatCard
				title="Time Typed"
				value={timeTyped}
				icon={Clock}
				minutes
				className="lg:order-7"
			/>
		</div>
	);
}
