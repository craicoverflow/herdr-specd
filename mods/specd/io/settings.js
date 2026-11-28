// The person's own settings for specd, kept in localStorage (the editing UI comes later).
import { parseUserInstructions } from "../core/agents.js";

export const INSTRUCTIONS_KEY = "specd.instructions";

/** The user's default instructions for a role, or undefined. */
export function userInstructions(role) {
  try {
    return parseUserInstructions(localStorage.getItem(INSTRUCTIONS_KEY), role);
  } catch {
    return undefined; // storage can be unavailable
  }
}
