import { Router, type IRouter } from "express";
import { eq, and, ne, or } from "drizzle-orm";
import { db, usersTable, familiesTable, pushSubscriptionsTable, notificationPreferencesTable, invitationsTable, sosTossTable, sosRequestsTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { hashPassword, verifyPassword } from "../lib/password";
import { randomBytes } from "crypto";

declare module "express-session" {
  interface SessionData {
    userId: number;
    googleOAuthState?: string;
    kakaoOAuthState?: string;
    naverOAuthState?: string;
    pendingInviteToken?: string;
  }
}

async function applyPendingInvite(
  userId: number,
  userEmail: string,
  inviteToken: string
): Promise<{ error: "email_mismatch" | "expired" | "already_in_family" | "invalid_invite" | null }> {
  const [invitation] = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.token, inviteToken));

  if (!invitation || invitation.status !== "pending") {
    return { error: "invalid_invite" };
  }

  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return { error: "expired" };
  }

  if (invitation.toEmail.toLowerCase() !== userEmail.toLowerCase()) {
    return { error: "email_mismatch" };
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (user?.familyId) {
    return { error: "already_in_family" };
  }

  const [fromUser] = await db.select().from(usersTable).where(eq(usersTable.id, invitation.fromUserId));
  if (!fromUser?.familyId) {
    return { error: "invalid_invite" };
  }

  await db.update(usersTable)
    .set({ familyId: fromUser.familyId, role: "guardian", onboardingCompleted: true })
    .where(eq(usersTable.id, userId));

  await db.update(invitationsTable)
    .set({ status: "accepted" })
    .where(eq(invitationsTable.id, invitation.id));

  return { error: null };
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const KAKAO_CLIENT_ID = process.env.KAKAO_REST_API_KEY;
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET;

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

function getGoogleRedirectUri(req?: { get(name: string): string | undefined }): string {
  const host = req?.get("host");
  if (host) {
    const proto = req?.get("x-forwarded-proto") || "https";
    return `${proto}://${host}/api/auth/google/callback`;
  }
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}/api/auth/google/callback`;
}

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, name, phone } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = hashPassword(password);

  const [family] = await db.insert(familiesTable).values({}).returning();

  const [user] = await db.insert(usersTable).values({
    email,
    passwordHash,
    name,
    phone: phone || null,
    familyId: family.id,
    role: "owner",
  }).returning();

  req.session.userId = user.id;

  res.status(201).json({
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    familyId: user.familyId,
    role: user.role ?? "guardian",
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt.toISOString(),
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (!user.passwordHash) {
    res.status(401).json({ error: "Google 계정으로 로그인해주세요" });
    return;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.userId = user.id;

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    familyId: user.familyId,
    role: user.role ?? "guardian",
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt.toISOString(),
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    familyId: user.familyId,
    role: user.role ?? "guardian",
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt.toISOString(),
  });
});

router.post("/auth/complete-onboarding", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  await db
    .update(usersTable)
    .set({ onboardingCompleted: true })
    .where(eq(usersTable.id, req.session.userId));

  res.json({ message: "Onboarding completed" });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

router.delete("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const userId = req.session.userId;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.role === "owner" && user.familyId) {
    const otherMembers = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.familyId, user.familyId), ne(usersTable.id, userId)));

    if (otherMembers.length > 0) {
      res.status(403).json({ error: "먼저 가족 구성원을 모두 제거한 후 탈퇴할 수 있습니다" });
      return;
    }
  }

  const familyId = user.familyId;

  await db.transaction(async (tx) => {
    await tx.delete(invitationsTable).where(eq(invitationsTable.fromUserId, userId));
    await tx.delete(sosRequestsTable).where(
      or(eq(sosRequestsTable.fromUserId, userId), eq(sosRequestsTable.toUserId, userId))
    );
    await tx.delete(sosTossTable).where(
      or(eq(sosTossTable.fromGuardianId, userId), eq(sosTossTable.toGuardianId, userId))
    );
    await tx.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
    await tx.delete(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, userId));
    await tx.delete(usersTable).where(eq(usersTable.id, userId));

    if (familyId) {
      const remaining = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.familyId, familyId));
      if (remaining.length === 0) {
        await tx.delete(familiesTable).where(eq(familiesTable.id, familyId));
      }
    }
  });

  req.session.destroy(() => {
    res.json({ message: "Account deleted" });
  });
});

router.get("/auth/google", (req, res): void => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(500).json({ error: "Google OAuth가 설정되지 않았습니다" });
    return;
  }

  const inviteToken = typeof req.query.invite_token === "string" ? req.query.invite_token : undefined;
  if (inviteToken) {
    req.session.pendingInviteToken = inviteToken;
  } else {
    delete req.session.pendingInviteToken;
  }

  const state = randomBytes(32).toString("hex");
  req.session.googleOAuthState = state;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getGoogleRedirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  const redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  req.session.save(() => {
    res.redirect(redirectUrl);
  });
});

router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const frontendBase = (process.env.BASE_PATH || "/").replace(/\/$/, "") + "/";
  const loginUrl = `${frontendBase}login`;

  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      res.redirect(`${loginUrl}?error=google_not_configured`);
      return;
    }

    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      res.redirect(`${loginUrl}?error=no_code`);
      return;
    }

    if (!state || state !== req.session.googleOAuthState) {
      res.redirect(`${loginUrl}?error=invalid_state`);
      return;
    }

    delete req.session.googleOAuthState;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: getGoogleRedirectUri(req),
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      res.redirect(`${loginUrl}?error=token_exchange_failed`);
      return;
    }

    const tokenData = await tokenRes.json() as { access_token: string };

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {
      res.redirect(`${loginUrl}?error=userinfo_failed`);
      return;
    }

    const googleUser = await userInfoRes.json() as {
      id: string;
      email: string;
      name: string;
      picture?: string;
    };

    if (!googleUser.id || !googleUser.email) {
      res.redirect(`${loginUrl}?error=userinfo_failed`);
      return;
    }

    const pendingInviteToken = req.session.pendingInviteToken;
    delete req.session.pendingInviteToken;

    let [existingUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.googleId, googleUser.id));

    if (!existingUser) {
      const [emailConflict] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, googleUser.email));

      if (emailConflict) {
        res.redirect(`${loginUrl}?error=email_already_exists`);
        return;
      }

      if (pendingInviteToken) {
        const [invitation] = await db
          .select()
          .from(invitationsTable)
          .where(eq(invitationsTable.token, pendingInviteToken));

        const joinErrBase = `${frontendBase}join?token=${pendingInviteToken}`;

        if (!invitation || invitation.status !== "pending") {
          res.redirect(`${joinErrBase}&error=invalid_invite`);
          return;
        }
        if (invitation.expiresAt && invitation.expiresAt < new Date()) {
          res.redirect(`${joinErrBase}&error=expired`);
          return;
        }
        if (invitation.toEmail.toLowerCase() !== googleUser.email.toLowerCase()) {
          res.redirect(`${joinErrBase}&error=email_mismatch`);
          return;
        }

        const [fromUser] = await db.select().from(usersTable).where(eq(usersTable.id, invitation.fromUserId));
        if (!fromUser?.familyId) {
          res.redirect(`${joinErrBase}&error=invalid_invite`);
          return;
        }

        const [newUser] = await db
          .insert(usersTable)
          .values({
            email: googleUser.email,
            name: googleUser.name,
            googleId: googleUser.id,
            avatarUrl: googleUser.picture || null,
            familyId: fromUser.familyId,
            role: "guardian",
            onboardingCompleted: true,
          })
          .returning();
        existingUser = newUser;

        await db.update(invitationsTable)
          .set({ status: "accepted" })
          .where(eq(invitationsTable.id, invitation.id));
      } else {
        const [family] = await db.insert(familiesTable).values({}).returning();

        const [newUser] = await db
          .insert(usersTable)
          .values({
            email: googleUser.email,
            name: googleUser.name,
            googleId: googleUser.id,
            avatarUrl: googleUser.picture || null,
            familyId: family.id,
            role: "owner",
          })
          .returning();
        existingUser = newUser;

        req.session.userId = existingUser.id;
        req.session.save(() => {
          res.redirect(`${frontendBase}onboarding`);
        });
        return;
      }
    } else {
      if (googleUser.picture && existingUser.avatarUrl !== googleUser.picture) {
        await db
          .update(usersTable)
          .set({ avatarUrl: googleUser.picture })
          .where(eq(usersTable.id, existingUser.id));
      }

      if (pendingInviteToken) {
        const joinErrBase = `${frontendBase}join?token=${pendingInviteToken}`;
        const { error } = await applyPendingInvite(existingUser.id, existingUser.email, pendingInviteToken);
        if (error) {
          req.session.userId = existingUser.id;
          req.session.save(() => {
            res.redirect(`${joinErrBase}&error=${error}`);
          });
          return;
        }
      }
    }

    req.session.userId = existingUser.id;

    req.session.save(() => {
      res.redirect(frontendBase);
    });
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.redirect(`${loginUrl}?error=server_error`);
  }
});

function getKakaoRedirectUri(req?: { get(name: string): string | undefined }): string {
  const host = req?.get("host");
  if (host) {
    const proto = req?.get("x-forwarded-proto") || "https";
    return `${proto}://${host}/api/auth/kakao/callback`;
  }
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}/api/auth/kakao/callback`;
}

router.get("/auth/kakao", (req, res): void => {
  if (!KAKAO_CLIENT_ID) {
    res.status(500).json({ error: "Kakao OAuth가 설정되지 않았습니다" });
    return;
  }

  const inviteToken = typeof req.query.invite_token === "string" ? req.query.invite_token : undefined;
  if (inviteToken) {
    req.session.pendingInviteToken = inviteToken;
  } else {
    delete req.session.pendingInviteToken;
  }

  const state = randomBytes(32).toString("hex");
  req.session.kakaoOAuthState = state;

  const params = new URLSearchParams({
    client_id: KAKAO_CLIENT_ID,
    redirect_uri: getKakaoRedirectUri(req),
    response_type: "code",
    scope: "profile_nickname account_email",
    state,
  });

  const redirectUrl = `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
  req.session.save(() => {
    res.redirect(redirectUrl);
  });
});

router.get("/auth/kakao/callback", async (req, res): Promise<void> => {
  const frontendBase = (process.env.BASE_PATH || "/").replace(/\/$/, "") + "/";
  const loginUrl = `${frontendBase}login`;

  try {
    if (!KAKAO_CLIENT_ID) {
      res.redirect(`${loginUrl}?error=kakao_not_configured`);
      return;
    }

    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      res.redirect(`${loginUrl}?error=no_code`);
      return;
    }

    if (!state || state !== req.session.kakaoOAuthState) {
      res.redirect(`${loginUrl}?error=invalid_state`);
      return;
    }

    delete req.session.kakaoOAuthState;

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: KAKAO_CLIENT_ID,
      redirect_uri: getKakaoRedirectUri(req),
      code,
    });
    if (KAKAO_CLIENT_SECRET) {
      tokenBody.set("client_secret", KAKAO_CLIENT_SECRET);
    }

    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text().catch(() => "");
      console.error("Kakao token exchange failed:", tokenRes.status, errBody);
      res.redirect(`${loginUrl}?error=token_exchange_failed`);
      return;
    }

    const tokenData = await tokenRes.json() as { access_token: string };

    const userInfoRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {
      res.redirect(`${loginUrl}?error=userinfo_failed`);
      return;
    }

    const kakaoUser = await userInfoRes.json() as {
      id: number;
      kakao_account?: {
        email?: string;
        profile?: {
          nickname?: string;
          profile_image_url?: string;
        };
      };
    };

    const kakaoId = String(kakaoUser.id);
    const email = kakaoUser.kakao_account?.email;
    const name = kakaoUser.kakao_account?.profile?.nickname || "카카오 사용자";
    const avatarUrl = kakaoUser.kakao_account?.profile?.profile_image_url || null;

    if (!kakaoId) {
      res.redirect(`${loginUrl}?error=userinfo_failed`);
      return;
    }

    const pendingInviteToken = req.session.pendingInviteToken;
    delete req.session.pendingInviteToken;

    let [existingUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.kakaoId, kakaoId));

    if (!existingUser) {
      if (!kakaoUser.id) {
        res.redirect(`${loginUrl}?error=userinfo_failed`);
        return;
      }

      if (!email) {
        if (pendingInviteToken) {
          res.redirect(`${frontendBase}join?token=${pendingInviteToken}&error=no_email`);
        } else {
          res.redirect(`${loginUrl}?error=userinfo_failed`);
        }
        return;
      }

      const [emailUser] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email));

      if (emailUser) {
        if (emailUser.passwordHash) {
          res.redirect(`${loginUrl}?error=email_already_exists`);
          return;
        }
        await db
          .update(usersTable)
          .set({
            kakaoId,
            ...(avatarUrl && emailUser.avatarUrl !== avatarUrl ? { avatarUrl } : {}),
          })
          .where(eq(usersTable.id, emailUser.id));

        if (pendingInviteToken) {
          const joinErrBase = `${frontendBase}join?token=${pendingInviteToken}`;
          const { error } = await applyPendingInvite(emailUser.id, emailUser.email, pendingInviteToken);
          if (error) {
            req.session.userId = emailUser.id;
            req.session.save(() => res.redirect(`${joinErrBase}&error=${error}`));
            return;
          }
        }

        req.session.userId = emailUser.id;
        req.session.save(() => res.redirect(frontendBase));
        return;
      }

      if (pendingInviteToken) {
        const joinErrBase = `${frontendBase}join?token=${pendingInviteToken}`;
        const [invitation] = await db
          .select()
          .from(invitationsTable)
          .where(eq(invitationsTable.token, pendingInviteToken));

        if (!invitation || invitation.status !== "pending") {
          res.redirect(`${joinErrBase}&error=invalid_invite`);
          return;
        }
        if (invitation.expiresAt && invitation.expiresAt < new Date()) {
          res.redirect(`${joinErrBase}&error=expired`);
          return;
        }
        if (invitation.toEmail.toLowerCase() !== email.toLowerCase()) {
          res.redirect(`${joinErrBase}&error=email_mismatch`);
          return;
        }

        const [fromUser] = await db.select().from(usersTable).where(eq(usersTable.id, invitation.fromUserId));
        if (!fromUser?.familyId) {
          res.redirect(`${joinErrBase}&error=invalid_invite`);
          return;
        }

        const [newGuardian] = await db
          .insert(usersTable)
          .values({
            email,
            name,
            kakaoId,
            avatarUrl,
            familyId: fromUser.familyId,
            role: "guardian",
            onboardingCompleted: true,
          })
          .returning();
        existingUser = newGuardian;

        await db.update(invitationsTable)
          .set({ status: "accepted" })
          .where(eq(invitationsTable.id, invitation.id));
      } else {
        const [family] = await db.insert(familiesTable).values({}).returning();
        const [newOwner] = await db
          .insert(usersTable)
          .values({
            email,
            name,
            kakaoId,
            avatarUrl,
            familyId: family.id,
            role: "owner",
          })
          .returning();
        existingUser = newOwner;

        req.session.userId = existingUser.id;
        req.session.save(() => {
          res.redirect(`${frontendBase}onboarding`);
        });
        return;
      }
    } else {
      if (avatarUrl && existingUser.avatarUrl !== avatarUrl) {
        await db
          .update(usersTable)
          .set({ avatarUrl })
          .where(eq(usersTable.id, existingUser.id));
      }

      if (pendingInviteToken) {
        const joinErrBase = `${frontendBase}join?token=${pendingInviteToken}`;
        const { error } = await applyPendingInvite(existingUser.id, existingUser.email, pendingInviteToken);
        if (error) {
          req.session.userId = existingUser.id;
          req.session.save(() => {
            res.redirect(`${joinErrBase}&error=${error}`);
          });
          return;
        }
      }
    }

    req.session.userId = existingUser.id;
    req.session.save(() => {
      res.redirect(frontendBase);
    });
  } catch (err) {
    console.error("Kakao OAuth callback error:", err);
    res.redirect(`${loginUrl}?error=server_error`);
  }
});

function getNaverRedirectUri(req?: { get(name: string): string | undefined }): string {
  const host = req?.get("host");
  if (host) {
    const proto = req?.get("x-forwarded-proto") || "https";
    return `${proto}://${host}/api/auth/naver/callback`;
  }
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}/api/auth/naver/callback`;
}

router.get("/auth/naver", (req, res): void => {
  if (!NAVER_CLIENT_ID) {
    res.status(500).json({ error: "Naver OAuth가 설정되지 않았습니다" });
    return;
  }

  const inviteToken = typeof req.query.invite_token === "string" ? req.query.invite_token : undefined;
  if (inviteToken) {
    req.session.pendingInviteToken = inviteToken;
  } else {
    delete req.session.pendingInviteToken;
  }

  const state = randomBytes(32).toString("hex");
  req.session.naverOAuthState = state;

  const params = new URLSearchParams({
    client_id: NAVER_CLIENT_ID,
    redirect_uri: getNaverRedirectUri(req),
    response_type: "code",
    state,
  });

  const redirectUrl = `https://nid.naver.com/oauth2.0/authorize?${params.toString()}`;
  req.session.save(() => {
    res.redirect(redirectUrl);
  });
});

router.get("/auth/naver/callback", async (req, res): Promise<void> => {
  const frontendBase = (process.env.BASE_PATH || "/").replace(/\/$/, "") + "/";
  const loginUrl = `${frontendBase}login`;

  try {
    if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
      res.redirect(`${loginUrl}?error=naver_not_configured`);
      return;
    }

    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      res.redirect(`${loginUrl}?error=no_code`);
      return;
    }

    if (!state || state !== req.session.naverOAuthState) {
      res.redirect(`${loginUrl}?error=invalid_state`);
      return;
    }

    delete req.session.naverOAuthState;

    const tokenUrl = new URL("https://nid.naver.com/oauth2.0/token");
    tokenUrl.searchParams.append("grant_type", "authorization_code");
    tokenUrl.searchParams.append("client_id", NAVER_CLIENT_ID);
    tokenUrl.searchParams.append("client_secret", NAVER_CLIENT_SECRET);
    tokenUrl.searchParams.append("code", code);
    tokenUrl.searchParams.append("state", state as string);

    const tokenRes = await fetch(tokenUrl.toString(), {
      method: "GET",
    });

    const tokenData = await tokenRes.json() as any;

    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      console.error("Naver token exchange failed:", tokenRes.status, tokenData);
      res.redirect(`${loginUrl}?error=token_exchange_failed`);
      return;
    }

    const userInfoRes = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {
      const errText = await userInfoRes.text().catch(() => "");
      console.error("Naver user info fetch failed:", userInfoRes.status, errText);
      res.redirect(`${loginUrl}?error=userinfo_failed`);
      return;
    }

    const naverData = await userInfoRes.json() as {
      response: {
        id: string;
        email?: string;
        name?: string;
        profile_image?: string;
      };
    };

    const naverId = naverData.response?.id;
    const email = naverData.response?.email;
    const name = naverData.response?.name || "네이버 사용자";
    const avatarUrl = naverData.response?.profile_image || null;

    if (!naverId) {
      console.error("Naver user data missing ID:", naverData);
      res.redirect(`${loginUrl}?error=userinfo_failed`);
      return;
    }

    const pendingInviteToken = req.session.pendingInviteToken;
    delete req.session.pendingInviteToken;

    let [existingUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.naverId, naverId));

    if (!existingUser) {
      if (!email) {
        console.error("Naver user data missing email (required for signup):", naverData);
        if (pendingInviteToken) {
          res.redirect(`${frontendBase}join?token=${pendingInviteToken}&error=no_email`);
        } else {
          res.redirect(`${loginUrl}?error=userinfo_failed`);
        }
        return;
      }

      const [emailUser] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email));

      if (emailUser) {
        if (emailUser.passwordHash) {
          res.redirect(`${loginUrl}?error=email_already_exists`);
          return;
        }
        await db
          .update(usersTable)
          .set({
            naverId,
            ...(avatarUrl && emailUser.avatarUrl !== avatarUrl ? { avatarUrl } : {}),
          })
          .where(eq(usersTable.id, emailUser.id));

        if (pendingInviteToken) {
          const joinErrBase = `${frontendBase}join?token=${pendingInviteToken}`;
          const { error } = await applyPendingInvite(emailUser.id, emailUser.email, pendingInviteToken);
          if (error) {
            req.session.userId = emailUser.id;
            req.session.save(() => res.redirect(`${joinErrBase}&error=${error}`));
            return;
          }
        }

        req.session.userId = emailUser.id;
        req.session.save(() => res.redirect(frontendBase));
        return;
      }

      if (pendingInviteToken) {
        const joinErrBase = `${frontendBase}join?token=${pendingInviteToken}`;
        const [invitation] = await db
          .select()
          .from(invitationsTable)
          .where(eq(invitationsTable.token, pendingInviteToken));

        if (!invitation || invitation.status !== "pending") {
          res.redirect(`${joinErrBase}&error=invalid_invite`);
          return;
        }
        if (invitation.expiresAt && invitation.expiresAt < new Date()) {
          res.redirect(`${joinErrBase}&error=expired`);
          return;
        }
        if (invitation.toEmail.toLowerCase() !== email.toLowerCase()) {
          res.redirect(`${joinErrBase}&error=email_mismatch`);
          return;
        }

        const [fromUser] = await db.select().from(usersTable).where(eq(usersTable.id, invitation.fromUserId));
        if (!fromUser?.familyId) {
          res.redirect(`${joinErrBase}&error=invalid_invite`);
          return;
        }

        const [newGuardian] = await db
          .insert(usersTable)
          .values({
            email,
            name,
            naverId,
            avatarUrl,
            familyId: fromUser.familyId,
            role: "guardian",
            onboardingCompleted: true,
          })
          .returning();
        existingUser = newGuardian;

        await db.update(invitationsTable)
          .set({ status: "accepted" })
          .where(eq(invitationsTable.id, invitation.id));
      } else {
        const [family] = await db.insert(familiesTable).values({}).returning();
        const [newOwner] = await db
          .insert(usersTable)
          .values({
            email,
            name,
            naverId,
            avatarUrl,
            familyId: family.id,
            role: "owner",
          })
          .returning();
        existingUser = newOwner;

        req.session.userId = existingUser.id;
        req.session.save(() => {
          res.redirect(`${frontendBase}onboarding`);
        });
        return;
      }
    } else {
      if (avatarUrl && existingUser.avatarUrl !== avatarUrl) {
        await db
          .update(usersTable)
          .set({ avatarUrl })
          .where(eq(usersTable.id, existingUser.id));
      }

      if (pendingInviteToken) {
        const joinErrBase = `${frontendBase}join?token=${pendingInviteToken}`;
        const { error } = await applyPendingInvite(existingUser.id, existingUser.email, pendingInviteToken);
        if (error) {
          req.session.userId = existingUser.id;
          req.session.save(() => {
            res.redirect(`${joinErrBase}&error=${error}`);
          });
          return;
        }
      }
    }

    req.session.userId = existingUser.id;
    req.session.save(() => {
      res.redirect(frontendBase);
    });
  } catch (err) {
    console.error("Naver OAuth callback error:", err);
    res.redirect(`${loginUrl}?error=server_error`);
  }
});

export default router;
