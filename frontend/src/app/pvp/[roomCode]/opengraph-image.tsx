import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Join Typing Battle - Versus Type";
export const size = {
	width: 1200,
	height: 630,
};
export const contentType = "image/png";

export default async function Image({
	params,
}: {
	params: Promise<{ roomCode: string }>;
}) {
	const { roomCode } = await params;

	const logoData = await readFile(
		join(process.cwd(), "public/iconOpaque.png"),
		"base64",
	);
	const logoSrc = `data:image/png;base64,${logoData}`;

	return new ImageResponse(
		<div
			style={{
				background: "#0a0a0a",
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				fontFamily: "system-ui, sans-serif",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "20px",
					marginBottom: "40px",
				}}
			>
				<img src={logoSrc} width={90} height={90} alt="" />
				<div
					style={{
						fontSize: "60px",
						fontWeight: "bold",
						color: "#c1c1c1",
					}}
				>
					Versus Type
				</div>
			</div>
			<div
				style={{
					fontSize: "32px",
					color: "#888888",
					marginBottom: "24px",
				}}
			>
				You've been invited to a typing battle
			</div>
			<div
				style={{
					fontSize: "48px",
					fontWeight: "bold",
					color: "#c1c1c1",
					letterSpacing: "6px",
					fontFamily: "monospace",
					padding: "16px 40px",
					background: "#1a1a1a",
					borderRadius: "12px",
				}}
			>
				{roomCode}
			</div>
		</div>,
		{ ...size },
	);
}
