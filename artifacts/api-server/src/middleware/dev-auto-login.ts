import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, familiesTable } from "@workspace/db";
import { hashPassword } from "../lib/password";
import { logger } from "../lib/logger";

const DEV_USER_EMAIL = "dev@edu-pass.local";
const DEV_USER_NAME = "Dev User";
const DEV_USER_PASSWORD = "dev-password-123";

const isNonProduction = process.env.NODE_ENV !== "production";

export async function devAutoLogin(req: Request, _res: Response, next: NextFunction) {
  if (!isNonProduction) {
    return next();
  }

  if (req.session.userId) {
    return next();
  }

  const authPaths = ["/api/auth/login", "/api/auth/register", "/api/auth/logout"];
  if (authPaths.some((p) => req.path === p)) {
    return next();
  }

  try {
    let [user] = await db.select().from(usersTable).where(eq(usersTable.email, DEV_USER_EMAIL));

    if (!user) {
      const [family] = await db.insert(familiesTable).values({}).returning();
      const passwordHash = hashPassword(DEV_USER_PASSWORD);

      [user] = await db.insert(usersTable).values({
        email: DEV_USER_EMAIL,
        passwordHash,
        name: DEV_USER_NAME,
        phone: null,
        familyId: family.id,
      }).returning();

      logger.info({ userId: user.id }, "Dev auto-login: created dev user");
    }

    req.session.userId = user.id;

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    logger.info({ userId: user.id }, "Dev auto-login: session set");
  } catch (err) {
    logger.error({ err }, "Dev auto-login: failed");
  }

  return next();
}
