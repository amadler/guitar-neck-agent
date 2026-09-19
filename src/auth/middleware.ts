import type { Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

const PgSession = connectPgSimple(session);

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const sessionMiddleware = session({
  store: new PgSession({
    conString: process.env.DATABASE_URL ?? "postgres://guitarneck:guitarneck@localhost:5432/guitarneck",
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET ?? "change-me-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export { sessionMiddleware, requireAuth };