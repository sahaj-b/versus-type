import type { RoomInfo, RoomSettingsClient } from "@versus-type/shared/index";
import { API_URL } from "@/const";

export async function hostMatch(settings: RoomSettingsClient) {
	try {
		const response = await fetch(`${API_URL}/pvp/host`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
			body: JSON.stringify(settings),
		});
		if (!response.ok) {
			const errMsg =
				(await response.json().catch(() => ({})))?.error || response.statusText;
			throw new Error(`Error creating room: ${errMsg}`);
		}
		const data = await response.json();
		const roomCode = data.roomCode;
		if (typeof roomCode !== "string") {
			console.error("Validation error: roomCode is not a string");
			throw new Error("Internal server error");
		}
		return roomCode;
	} catch (error) {
		console.error("hostMatch error:", error);
		throw error;
	}
}

export async function getPublicRooms() {
	try {
		const response = await fetch(`${API_URL}/pvp/rooms`);
		if (!response.ok) {
			const errMsg =
				(await response.json().catch(() => ({})))?.error || response.statusText;
			throw new Error(`Error fetching public rooms: ${errMsg}`);
		}
		const data = await response.json();
		return data as RoomInfo[];
	} catch (error) {
		console.error("getPublicRooms error:", error);
		throw error;
	}
}

export async function getQuickPlayRoom() {
	try {
		const response = await fetch(`${API_URL}/pvp/matchmake`, {
			credentials: "include",
		});
		if (!response.ok) {
			const errMsg =
				(await response.json().catch(() => ({})))?.error || response.statusText;
			throw new Error(`Error: ${errMsg}`);
		}
		const data = await response.json();
		const roomCode = data.roomCode;
		if (typeof roomCode !== "string") {
			console.error("Validation error: roomCode is not a string");
			throw new Error("Internal server error");
		}
		return roomCode;
	} catch (error) {
		console.error("getQuickPlayRoom error:", error);
		throw error;
	}
}
