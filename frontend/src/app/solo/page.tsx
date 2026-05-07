"use client";

import {
	type GeneratorConfig,
	generatePassage,
} from "@versus-type/shared/passage-generator";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/ui/header";
import { loadGameConfig } from "../_game-config";
import { GameSettings } from "../_game-config/config-modal";
import { useSmallScreen } from "../hooks/useSmallScreen";
import Passage from "./Passage";

const SOLO_CONFIG_KEY = "solo-passage-config";

const defaultConfig: GeneratorConfig = {
	language: "English 200",
	wordCount: 50,
	punctuation: true,
	numbers: false,
};

function loadConfig(): GeneratorConfig {
	if (typeof window === "undefined") return defaultConfig;
	try {
		const stored = localStorage.getItem(SOLO_CONFIG_KEY);
		if (stored) return { ...defaultConfig, ...JSON.parse(stored) };
	} catch {}
	return defaultConfig;
}

function saveConfig(config: GeneratorConfig) {
	if (typeof window === "undefined") return;
	try {
		localStorage.setItem(SOLO_CONFIG_KEY, JSON.stringify(config));
	} catch {}
}

export default function SoloPage() {
	const [config, setConfig] = useState<GeneratorConfig>(defaultConfig);
	const [words, setWords] = useState<string[] | null>(null);
	const [gameConfig, setGameConfig] = useState(loadGameConfig());
	const smallScreen = useSmallScreen();

	useEffect(() => {
		const loaded = loadConfig();
		setConfig(loaded);
		generatePassage(loaded).then((passage) => setWords(passage.split(" ")));
	}, []);

	function handleConfigChange(newConfig: GeneratorConfig) {
		setConfig(newConfig);
		saveConfig(newConfig);
		generatePassage(newConfig).then((passage) => setWords(passage.split(" ")));
	}

	if (!words) {
		return (
			<>
				<Header>Solo Practice</Header>
				<div className="bg-background flex items-center justify-center min-h-screen py-2">
					<div className="text-muted-foreground text-3xl">Loading...</div>
				</div>
			</>
		);
	}

	return (
		<>
			<Header>Solo Practice</Header>
			<div className="absolute top-5 flex justify-between w-screen px-5">
				<Button variant="ghost" asChild>
					<Link href="/">
						<ChevronLeft className="mt-0.5 -mr-1 -ml-1" /> Home
					</Link>
				</Button>
				<GameSettings config={gameConfig} setConfig={setGameConfig} solo />
			</div>
			<div
				className={
					"bg-background flex items-center justify-center min-h-screen py-2 " +
					(smallScreen ? "px-2" : "px-10")
				}
			>
				<Passage
					words={words}
					config={config}
					onConfigChange={handleConfigChange}
					enableStreak={gameConfig.enableStreak}
				/>
			</div>
		</>
	);
}
