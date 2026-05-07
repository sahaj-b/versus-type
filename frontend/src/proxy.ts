import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.json|opengraph-image|twitter-image).*)",
	],
};

const SESSION_COOKIE_NAME = "better-auth.session_token";
const SECURE_SESSION_COOKIE_NAME = "__Secure-better-auth.session_token";

function getSessionCookie(req: NextRequest) {
	return (
		req.cookies.get(SESSION_COOKIE_NAME) ||
		req.cookies.get(SECURE_SESSION_COOKIE_NAME)
	);
}

export default async function proxy(req: NextRequest) {
	const { pathname } = req.nextUrl;

	if (
		pathname.endsWith("/opengraph-image") ||
		pathname.endsWith("/twitter-image")
	) {
		return NextResponse.next();
	}

	const userAgent = req.headers.get("user-agent") || "";
	const isCrawler =
		/twitterbot|facebookexternalhit|linkedinbot|slackbot|discordbot|telegrambot|whatsapp/i.test(
			userAgent,
		);
	if (isCrawler) {
		return NextResponse.next();
	}

	const sessionCookie = getSessionCookie(req);
	const isAuthenticated = !!sessionCookie;

	// removing ts coz guests are also authenticated(anon)
	// const guestOnlyPaths = ["/sign-in", "/sign-up"];
	const protectedPaths = ["/profile", "/settings"];

	// anon sign non-authenticated users
	if (
		!isAuthenticated &&
		(protectedPaths.includes(pathname) || pathname.startsWith("/pvp"))
	) {
		return NextResponse.redirect(
			new URL("/anonymous-sign?from=" + pathname, req.url),
		);
	}

	return NextResponse.next();
}
