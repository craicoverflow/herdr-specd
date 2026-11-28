// The person's own settings for specd, kept in localStorage (edited on the settings page).
import { parseUserInstructions, withUserInstructions } from "../core/agents.js";

export const INSTRUCTIONS_KEY = "specd.instructions";

/** The user's default instructions for a role, or undefined. */
export function userInstructions(role) {
  try {
    return parseUserInstructions(localStorage.getItem(INSTRUCTIONS_KEY), role);
  } catch {
    return undefined; // storage can be unavailable
  }
}

/** Keep the user's default for a role. Throws when storage refuses, so the page can say so. */
export function saveUserInstructions(role, text) {
  localStorage.setItem(INSTRUCTIONS_KEY, withUserInstructions(localStorage.getItem(INSTRUCTIONS_KEY), role, text));
}
