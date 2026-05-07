"use client";
import {
	Activity,
	Check,
	ChevronDown,
	ChevronUp,
	Copy,
	WifiOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GameSettings } from "@/app/_game-config/config-modal";
import { useSmallScreen } from "@/app/hooks/useSmallScreen";
import { QuickPlayButton } from "@/app/quick-play";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header } from "@/components/ui/header";
import { DEFAULT_KEY_BUFFER_SIZE } from "@/const";
import { authClient } from "@/lib/auth-client";
import { socket } from "@/socket";
import { Banner } from "./banner";
import Chat from "./Chat";
import { ErrorPage } from "./ErrorPage";
import { usePvpSession } from "./hooks/usePvpSession";
import { Lobby } from "./Lobby";
import { PvpGame } from "./PvpGame";
import { usePvpStore } from "./store";
import { UsernameForm } from "./UsernameForm";

export default function PvpPage() {
	const { data, isPending, error: authError } = authClient.useSession();
	let username = data?.user.name.trim() || "";
	if (username === "Anonymous") username = "";
	const { loading, socketError, roomCode, latency, disconnected } =
		usePvpSession(!!username);

	const [copied, setCopied] = useState(false);

	const router = useRouter();
	const countingDown = usePvpStore((s) => s.countingDown);
	const setCountingDown = usePvpStore((s) => s.setCountingDown);
	const players = usePvpStore((s) => s.players);
	const matchStarted = usePvpStore((s) => s.matchStarted);
	const myUserId = authClient.useSession().data?.user.id;
	const isHost = players[myUserId || ""]?.isHost || false;
	const matchEnded = usePvpStore((s) => s.matchEnded);
	const initializeNextMatchState = usePvpStore(
		(s) => s.initializeNextMatchState,
	);
	const resetStore = usePvpStore((s) => s.resetStore);
	const [expanded, setExpanded] = useState(false);
	const smallScreen = useSmallScreen();
	const smallHeight = useSmallScreen("(max-height: 600px)");
	const verySmallHeight = useSmallScreen("(max-height: 500px)");
	const roomType = usePvpStore((s) => s.roomType);
	const isSpectating =
		!matchEnded && (myUserId ? players[myUserId]?.spectator : false);
	const waitingCountdown = usePvpStore((s) => s.waitingCountdown);
	const setKeyBufferSize = usePvpStore((s) => s.setKeyBufferSize);
	const config = usePvpStore((s) => s.gameConfig);
	const setConfig = usePvpStore((s) => s.setGameConfig);

	const sidebarExpanded = usePvpStore((s) => s.sidebarExpanded);

	useEffect(() => {
		return () => {
			resetStore();
		};
	}, [resetStore]);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			// toggle focus passage <-> chat on tab
			if (e.key === "Tab") {
				e.preventDefault();
				const passageInput = document.getElementById("passage-input");
				if (document.activeElement === passageInput) {
					document.getElementById("chat-input")?.focus();
				} else {
					passageInput?.focus();
				}
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	const waitingForPlayers =
		roomType === "matchmaking" && !matchStarted && !matchEnded
			? Object.keys(players).length < 2 || !!waitingCountdown
			: false;

	if (!data && !isPending) {
		window.location.href = "/anonymous-sign?from=" + window.location.pathname;
		return null;
	}

	if (socketError || authError) {
		return (
			<ErrorPage
				title={socketError ? "Connection error" : "Authentication error"}
				message={
					socketError || authError?.message || "An unknown error occurred."
				}
			/>
		);
	}
	if (!username && !isPending) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<Card>
					<UsernameForm />
				</Card>
			</div>
		);
	}
	if (loading) {
		return (
			<div className="flex flex-col items-center justify-center min-h-screen gap-4">
				<div className="size-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
				<p className="text-xl text-muted-foreground">Connecting to match</p>
			</div>
		);
	}

	function copyMatchLink() {
		const url = `${window.location.origin}/pvp/${roomCode}`;
		navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	async function handleStartCountdown() {
		if (matchEnded) initializeNextMatchState();
		const response = await socket?.emitWithAck("pvp:start-match");
		if (response?.success) {
			setCountingDown(true);
			setKeyBufferSize(response.keyBufferSize || DEFAULT_KEY_BUFFER_SIZE);
		}
	}

	function handleExit() {
		router.push("/");
	}
	return (
		<div className="flex flex-col items-center justify-start min-h-screen">
			<Header>
				{roomType === "matchmaking"
					? "Quick Play"
					: roomType === "public"
						? "Public Room"
						: "Private Room"}
			</Header>
			<div className="p-2 px-4 flex justify-between items-center w-full mb-4">
				<CodeCopy
					roomCode={roomCode}
					copied={copied}
					copyMatchLink={copyMatchLink}
				/>
				<div className="flex items-center justify-center gap-2">
					{disconnected ? (
						<Badge
							variant="outline"
							className="text-destructive text-sm shadow-destructive/15 shadow-md"
						>
							<WifiOff /> Disconnected
						</Badge>
					) : (
						<LatencyStatus latency={latency} />
					)}
					<GameSettings config={config} setConfig={setConfig} />
					<Button variant="secondary" onClick={handleExit}>
						Exit
					</Button>
					{roomType !== "matchmaking" &&
					isHost &&
					!countingDown &&
					!matchStarted ? (
						<Button onClick={handleStartCountdown}>
							{smallScreen
								? "Start"
								: matchEnded
									? "Start Next Match"
									: "Start Match"}
						</Button>
					) : null}
				</div>
			</div>
			<div className="flex flex-col justify-center items-center h-full w-full">
				<div
					className={
						"pt-16 absolute " +
						(smallHeight
							? verySmallHeight
								? "top-10"
								: "bottom-[35vh]"
							: "bottom-[47vh]")
					}
				>
					{players[myUserId ?? ""]?.finished && roomType === "matchmaking" ? (
						<div className="relative z-10 text-center -mb-10">
							<QuickPlayButton label="Find New Match" />
						</div>
					) : null}
					<div
						className={`text-center -mb-2 transition-all duration-400 ${isSpectating || waitingForPlayers ? "opacity-100" : "opacity-0"}`}
					>
						<Banner
							isSpectating={isSpectating}
							waitingForPlayers={waitingForPlayers}
						/>
					</div>
					<PvpGame />
				</div>
				{smallScreen && (
					<div
						className={
							"fixed right-0 top-0 bottom-0 z-40 p-2 w-[90%] transition " +
							(sidebarExpanded ? "" : "translate-x-full")
						}
					>
						<Chat />
					</div>
				)}
				<div
					className={
						"flex gap-4 p-4 w-full pt-9 absolute bottom-0 left-1/2 -translate-x-1/2 z-30 transition-all " +
						(expanded
							? "max-w-full h-[79vh] backdrop-blur-xs"
							: "max-w-7xl h-[40vh]") +
						" " +
						(verySmallHeight ? "hidden" : "")
					}
				>
					<button
						onClick={() => setExpanded(!expanded)}
						className={
							"cursor-pointer flex justify-center absolute left-1/2 top-0.5 -z-10 -translate-x-1/2 w-[90%] py-1.5 transition opacity-40 hover:opacity-100 rounded-b-none rounded-t-md backdrop-blur-xs bg-card/50 " +
							(expanded ? "" : "hover:bg-card/40")
						}
					>
						{expanded ? <ChevronDown /> : <ChevronUp />}
					</button>
					<div className={"flex-1 transition-all min-w-0"}>
						<Lobby />
					</div>
					{!smallScreen && (
						<div className="flex-1 transition-all">
							<Chat />
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function CodeCopy({
	roomCode,
	copied,
	copyMatchLink,
}: {
	roomCode: string;
	copied: boolean;
	copyMatchLink: () => void;
}) {
	const smallScreen = useSmallScreen();
	return (
		<div
			className={
				"p-0 rounded-md border-0 md:p-2 md:border flex justify-center gap-2 items-center "
			}
		>
			<h1 className="font-bold hidden md:block">Code: {roomCode}</h1>
			<Button
				variant="secondary"
				size="sm"
				onClick={copyMatchLink}
				className="gap-2"
			>
				{copied ? (
					<>
						<Check className="size-4" />
						Copied!
					</>
				) : (
					<>
						<Copy className="size-4" />
						{smallScreen ? "Invite" : "Copy Invite Link"}
					</>
				)}
			</Button>
		</div>
	);
}

function LatencyStatus({ latency }: { latency: number | null }) {
	if (latency === null) return null;
	if (latency < 400) {
		return (
			<Badge variant="outline">
				<Activity className="size-4" />
				<span className="text-sm">{latency}ms</span>
			</Badge>
		);
	}
	if (latency < 800) {
		return (
			<Badge variant="outline">
				<Activity className="size-4" />
				<span className="text-sm text-orange-300">{latency}ms</span>
			</Badge>
		);
	}
	return (
		<Badge variant="outline">
			<Activity className="size-4" />
			<span className="text-sm text-destructive">{latency}ms</span>
		</Badge>
	);
}
