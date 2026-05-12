import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, usersTable, invitationsTable, familiesTable, familyMemberAliasesTable } from "@workspace/db";
import { InviteFamilyBody, AcceptInvitationParams, DeclineInvitationParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { Resend } from "resend";
import { hashPassword } from "../lib/password";
import { z } from "zod/v4";

const router: IRouter = Router();

function getAppUrl(req: { get(name: string): string | undefined }): string {
  const host = req.get("host");
  if (host) {
    const proto = req.get("x-forwarded-proto") || "https";
    return `${proto}://${host}`;
  }
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}`;
}

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function buildInviteEmailHtml(inviterName: string, appUrl: string, token: string): string {
  const joinUrl = `${appUrl}/join?token=${token}`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>픽미업대디 가족 초대</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#4f46e5;padding:32px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">픽미업대디</p>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">PickMeUpDaddy</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 32px 32px;">
              <p style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">가족 초대를 받으셨어요 🎉</p>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                <strong style="color:#111827;">${inviterName}</strong>님이 픽미업대디 가족으로 초대했습니다.<br/>
                아이들의 등·하원 일정을 함께 관리해보세요.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${joinUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:8px;">가족 합류하기</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
                이 초대 링크는 7일 후 만료됩니다.<br/>
                버튼이 작동하지 않으면 아래 링크를 브라우저에 붙여넣으세요:<br/>
                <a href="${joinUrl}" style="color:#4f46e5;word-break:break-all;">${joinUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">픽미업대디 · 맞벌이 가족을 위한 등하원 관리 서비스</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

router.post("/family/invite", requireAuth, async (req, res): Promise<void> => {
  const parsed = InviteFamilyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  if (currentUser.role !== "owner") {
    res.status(403).json({ error: "가족 초대는 주 보호자만 할 수 있습니다." });
    return;
  }

  if (parsed.data.email === currentUser.email) {
    res.status(400).json({ error: "Cannot invite yourself" });
    return;
  }

  const resend = getResend();
  if (!resend) {
    res.status(503).json({ error: "이메일 서비스가 설정되지 않았습니다. 관리자에게 문의하세요." });
    return;
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const appUrl = getAppUrl(req);

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "픽미업대디 <noreply@pickmeupdaddy.com>";
    const { error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: [parsed.data.email],
      subject: `${currentUser.name}님이 픽미업대디 가족으로 초대했습니다`,
      html: buildInviteEmailHtml(currentUser.name, appUrl, token),
    });
    if (sendError) {
      console.error("Resend API error:", sendError);
      res.status(502).json({ error: `초대 이메일 발송에 실패했습니다: ${sendError.message}` });
      return;
    }
  } catch (err) {
    console.error("Failed to send invitation email:", err);
    res.status(502).json({ error: "초대 이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요." });
    return;
  }

  const [invitation] = await db.insert(invitationsTable).values({
    fromUserId: userId,
    toEmail: parsed.data.email,
    status: "pending",
    token,
    expiresAt,
  }).returning();

  res.json({
    id: invitation.id,
    fromUserId: invitation.fromUserId,
    fromUserName: currentUser.name,
    toEmail: invitation.toEmail,
    status: invitation.status,
    createdAt: invitation.createdAt.toISOString(),
  });
});

router.get("/family/invite/preview", async (req, res): Promise<void> => {
  const token = req.query.token as string | undefined;
  if (!token) {
    res.status(400).json({ error: "Token required" });
    return;
  }

  const [invitation] = await db
    .select({
      id: invitationsTable.id,
      toEmail: invitationsTable.toEmail,
      status: invitationsTable.status,
      expiresAt: invitationsTable.expiresAt,
      fromUserName: usersTable.name,
      fromUserEmail: usersTable.email,
    })
    .from(invitationsTable)
    .leftJoin(usersTable, eq(invitationsTable.fromUserId, usersTable.id))
    .where(eq(invitationsTable.token, token));

  if (!invitation) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  if (invitation.status !== "pending") {
    res.status(400).json({ error: "Invitation already used or declined" });
    return;
  }

  const expired = invitation.expiresAt ? invitation.expiresAt < new Date() : false;

  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, invitation.toEmail));

  res.json({
    inviterName: invitation.fromUserName || "Unknown",
    inviterEmail: invitation.fromUserEmail || "",
    toEmail: invitation.toEmail,
    expired,
    expiresAt: invitation.expiresAt ? invitation.expiresAt.toISOString() : null,
    isRegistered: !!existingUser,
  });
});

const JoinByTokenBodySchema = z.object({
  token: z.string(),
  name: z.string().optional(),
  password: z.string().optional(),
  phone: z.string().optional(),
});

router.post("/family/invite/join", async (req, res): Promise<void> => {
  const parsed = JoinByTokenBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { token, name, password, phone } = parsed.data;

  const [invitation] = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.token, token));

  if (!invitation) {
    res.status(400).json({ error: "Invalid invitation token" });
    return;
  }

  if (invitation.status !== "pending") {
    res.status(400).json({ error: "Invitation already used or declined" });
    return;
  }

  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    res.status(400).json({ error: "Invitation has expired" });
    return;
  }

  const [fromUser] = await db.select().from(usersTable).where(eq(usersTable.id, invitation.fromUserId));
  if (!fromUser || !fromUser.familyId) {
    res.status(400).json({ error: "Inviter has no family" });
    return;
  }

  let targetUserId: number;

  const sessionUserId = req.session?.userId;
  if (sessionUserId) {
    const [sessionUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
    if (!sessionUser) {
      res.status(401).json({ error: "Session user not found" });
      return;
    }
    if (sessionUser.email !== invitation.toEmail) {
      res.status(403).json({ error: "이 초대는 다른 이메일 주소로 발송되었습니다." });
      return;
    }
    targetUserId = sessionUserId;
    await db.update(usersTable).set({ familyId: fromUser.familyId, role: "guardian", onboardingCompleted: true }).where(eq(usersTable.id, targetUserId));
  } else {
    if (!name || !password) {
      res.status(400).json({ error: "Name and password required for new user registration" });
      return;
    }

    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, invitation.toEmail));
    if (existingUser) {
      res.status(400).json({ error: "이미 가입된 이메일입니다. 로그인 후 초대를 수락해주세요." });
      return;
    }

    const hashed = await hashPassword(password);
    const [newUser] = await db.insert(usersTable).values({
      name,
      email: invitation.toEmail,
      passwordHash: hashed,
      phone: phone || null,
      familyId: fromUser.familyId,
      role: "guardian",
      onboardingCompleted: true,
    }).returning();

    targetUserId = newUser.id;
    req.session.userId = newUser.id;
  }

  await db.update(invitationsTable).set({ status: "accepted" }).where(eq(invitationsTable.id, invitation.id));

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId));

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    familyId: user.familyId,
    role: user.role ?? "guardian",
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt.toISOString(),
  });
});

router.get("/family/invitations", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const invitations = await db
    .select({
      id: invitationsTable.id,
      fromUserId: invitationsTable.fromUserId,
      fromUserName: usersTable.name,
      toEmail: invitationsTable.toEmail,
      status: invitationsTable.status,
      createdAt: invitationsTable.createdAt,
    })
    .from(invitationsTable)
    .leftJoin(usersTable, eq(invitationsTable.fromUserId, usersTable.id))
    .where(
      and(
        eq(invitationsTable.toEmail, currentUser.email),
        eq(invitationsTable.status, "pending")
      )
    );

  res.json(invitations.map(inv => ({
    ...inv,
    fromUserName: inv.fromUserName || "Unknown",
    createdAt: inv.createdAt.toISOString(),
  })));
});

router.post("/family/invitations/:id/accept", requireAuth, async (req, res): Promise<void> => {
  const params = AcceptInvitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.session.userId!;
  const invId = params.data.id;

  const [invitation] = await db.select().from(invitationsTable).where(eq(invitationsTable.id, invId));
  if (!invitation) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  const [fromUser] = await db.select().from(usersTable).where(eq(usersTable.id, invitation.fromUserId));
  if (!fromUser || !fromUser.familyId) {
    res.status(400).json({ error: "Inviter has no family" });
    return;
  }

  await db.update(usersTable).set({ familyId: fromUser.familyId, role: "guardian", onboardingCompleted: true }).where(eq(usersTable.id, userId));
  await db.update(invitationsTable).set({ status: "accepted" }).where(eq(invitationsTable.id, invId));

  res.json({ message: "Invitation accepted" });
});

router.post("/family/invitations/:id/decline", requireAuth, async (req, res): Promise<void> => {
  const params = DeclineInvitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.update(invitationsTable).set({ status: "declined" }).where(eq(invitationsTable.id, params.data.id));

  res.json({ message: "Invitation declined" });
});

router.get("/family/members", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser || !currentUser.familyId) {
    res.json([]);
    return;
  }

  const members = await db.select().from(usersTable).where(eq(usersTable.familyId, currentUser.familyId));

  const aliases = await db
    .select()
    .from(familyMemberAliasesTable)
    .where(eq(familyMemberAliasesTable.userId, userId));

  const aliasMap = new Map(aliases.map(a => [a.targetUserId, a.alias]));

  res.json(members.map(m => ({
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    role: m.role,
    alias: aliasMap.get(m.id) ?? null,
  })));
});

const AliasParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const SetAliasBodySchema = z.object({
  alias: z.string().trim().min(1).max(20),
});

router.put("/family/members/:id/alias", requireAuth, async (req, res): Promise<void> => {
  const params = AliasParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid member id" });
    return;
  }

  const body = SetAliasBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "별칭은 1~20자 이내로 입력해주세요." });
    return;
  }

  const callerId = req.session.userId!;
  const targetId = params.data.id;

  if (targetId === callerId) {
    res.status(400).json({ error: "자기 자신에게 별칭을 붙일 수 없습니다." });
    return;
  }

  const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, callerId));
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId));

  if (!caller || !target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (caller.familyId === null || caller.familyId !== target.familyId) {
    res.status(403).json({ error: "같은 가족 구성원만 별칭을 설정할 수 있습니다." });
    return;
  }

  await db
    .insert(familyMemberAliasesTable)
    .values({ userId: callerId, targetUserId: targetId, alias: body.data.alias })
    .onConflictDoUpdate({
      target: [familyMemberAliasesTable.userId, familyMemberAliasesTable.targetUserId],
      set: { alias: body.data.alias, updatedAt: new Date() },
    });

  res.json({ alias: body.data.alias });
});

router.delete("/family/members/:id/alias", requireAuth, async (req, res): Promise<void> => {
  const params = AliasParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid member id" });
    return;
  }

  const callerId = req.session.userId!;
  const targetId = params.data.id;

  await db
    .delete(familyMemberAliasesTable)
    .where(
      and(
        eq(familyMemberAliasesTable.userId, callerId),
        eq(familyMemberAliasesTable.targetUserId, targetId)
      )
    );

  res.json({ message: "별칭이 삭제되었습니다." });
});

const RemoveMemberParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

router.delete("/family/members/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = RemoveMemberParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid member id" });
    return;
  }

  const callerId = req.session.userId!;
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, callerId));
  if (!caller) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  if (caller.role !== "owner") {
    res.status(403).json({ error: "가족 구성원 삭제는 주 보호자만 할 수 있습니다." });
    return;
  }

  const targetId = parsed.data.id;

  if (targetId === callerId) {
    res.status(400).json({ error: "자기 자신을 삭제할 수 없습니다." });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId));
  if (!target) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  if (target.familyId !== caller.familyId) {
    res.status(403).json({ error: "같은 가족 구성원이 아닙니다." });
    return;
  }

  await db.update(usersTable)
    .set({ familyId: null, role: "guardian" })
    .where(eq(usersTable.id, targetId));

  res.json({ message: "가족 구성원이 삭제되었습니다." });
});

export default router;
