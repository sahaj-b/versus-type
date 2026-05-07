import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Versus Type - Competitive Typing Racer";
export const size = {
	width: 1200,
	height: 630,
};
export const contentType = "image/png";

export default async function Image() {
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
					gap: "24px",
					marginBottom: "24px",
				}}
			>
				<img src={logoSrc} width={150} height={150} alt="" />
				<div
					style={{
						fontSize: "80px",
						fontWeight: "bold",
						color: "#c1c1c1",
						letterSpacing: "-2px",
					}}
				>
					Versus Type
				</div>
			</div>
			<div
				style={{
					fontSize: "32px",
					color: "#888888",
				}}
			>
				Race your typing skills against others in real-time
			</div>
		</div>,
		{ ...size },
	);
}
