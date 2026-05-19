export interface JwtPayload {
  
  sub: string;
  username: string;
  email: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}
