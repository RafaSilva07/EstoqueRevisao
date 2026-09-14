export interface AuthenticatedUser {
  id: string;
  username: string;
  sessionId: string;
  sector?: string;
  roles: string[];
  permissions: string[];
}

export interface JwtPayload {
  sub: string;
  sid: string;
  username: string;
}
