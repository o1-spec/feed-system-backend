export interface JwtPayload {
  /** Subject — the user's ID */
  sub: string;
  username: string;
  email: string;
}

/** Attached to request.user after JWT validation */
export interface AuthUser {
  id: string;
  username: string;
  email: string;
}
