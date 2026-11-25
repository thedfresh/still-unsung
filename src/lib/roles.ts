import { AppError } from "@/lib/errors";

/** The roles in the database (`UserRole`). Editor and contributor come later. */
export const ROLES = ["ADMIN", "AGENT"] as const;
export type Role = (typeof ROLES)[number];

/** The signed-in user, from a session or from an agent access token. */
export interface CurrentUser {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  /** How the request signed in. */
  via: "session" | "token";
}

/**
 * Check that a user may act. A request with no user is `unauthorized` (401); a user with the
 * wrong role is `forbidden` (403). Every admin route and action calls this through
 * `getCurrentUser` / `defineAction`.
 */
export function assertRole(user: CurrentUser | null, allowed: readonly Role[]): CurrentUser {
  if (!user) throw new AppError("unauthorized");
  if (!allowed.includes(user.role)) throw new AppError("forbidden");
  return user;
}
