import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetInvitePreview, useJoinByInviteToken, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Lock, User, Phone, Mail, AlertCircle, CheckCircle2, LogIn } from "lucide-react";

function getTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

function getErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("error");
}

function oauthErrorMessage(error: string): string {
  switch (error) {
    case "email_mismatch": return "초대받은 이메일과 소셜 계정 이메일이 다릅니다. 초대받은 이메일로 가입된 계정을 사용해주세요.";
    case "expired": return "초대 링크가 만료되었습니다. 초대자에게 새 초대를 요청해주세요.";
    case "already_in_family": return "이미 다른 가족에 소속되어 있습니다.";
    case "no_email": return "카카오 계정에 이메일 정보가 없습니다. 이메일/비밀번호로 가입해주세요.";
    case "invalid_invite": return "유효하지 않은 초대입니다. 초대 링크를 다시 확인해주세요.";
    default: return "오류가 발생했습니다. 다시 시도해주세요.";
  }
}

function OAuthButtons({ token }: { token: string }) {
  const BASE_URL = import.meta.env.BASE_URL ?? "/";
  const apiBase = BASE_URL.replace(/\/$/, "");
  return (
    <div className="space-y-3">
      <div className="relative flex items-center gap-3">
        <div className="flex-1 border-t border-border" />
        <span className="text-xs text-muted-foreground">또는</span>
        <div className="flex-1 border-t border-border" />
      </div>
      <a
        href={`${apiBase}/api/auth/google?invite_token=${encodeURIComponent(token)}`}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Google로 시작하기
      </a>
      <a
        href={`${apiBase}/api/auth/kakao?invite_token=${encodeURIComponent(token)}`}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-transparent bg-[#FEE500] px-4 py-2 text-sm font-medium text-[#191919] shadow-sm hover:bg-[#F5DC00] transition-colors"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.742 1.637 5.153 4.115 6.605L5.077 21l4.48-2.34C10.144 18.887 11.062 19 12 19c5.523 0 10-3.477 10-7.8S17.523 3 12 3z" fill="#191919"/>
        </svg>
        카카오로 시작하기
      </a>
    </div>
  );
}

export default function JoinPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();

  const token = getTokenFromUrl();
  const oauthError = getErrorFromUrl();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");

  const { data: preview, isLoading: previewLoading, isError: previewError } = useGetInvitePreview(
    { token: token! },
    { query: { enabled: !!token } }
  );

  const joinMutation = useJoinByInviteToken();

  useEffect(() => {
    if (user?.name) {
      setName(user.name);
    }
  }, [user]);

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <Card>
            <CardContent className="pt-8 pb-6 text-center space-y-3">
              <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
              <p className="font-semibold text-foreground">잘못된 초대 링크입니다</p>
              <p className="text-sm text-muted-foreground">초대 링크를 다시 확인해주세요.</p>
              <Button className="w-full mt-2" onClick={() => setLocation("/login")}>
                로그인으로 이동
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (previewLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">초대 정보를 불러오는 중...</p>
      </div>
    );
  }

  if (previewError || !preview) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <Card>
            <CardContent className="pt-8 pb-6 text-center space-y-3">
              <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
              <p className="font-semibold text-foreground">초대를 찾을 수 없습니다</p>
              <p className="text-sm text-muted-foreground">
                이미 사용되었거나 유효하지 않은 초대 링크입니다.
              </p>
              <Button className="w-full mt-2" onClick={() => setLocation("/login")}>
                로그인으로 이동
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (preview.expired) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <Card>
            <CardContent className="pt-8 pb-6 text-center space-y-3">
              <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto" />
              <p className="font-semibold text-foreground">초대가 만료되었습니다</p>
              <p className="text-sm text-muted-foreground">
                이 초대 링크는 만료되었습니다. <br />
                <strong>{preview.inviterName}</strong>님에게 새 초대를 요청해주세요.
              </p>
              <Button variant="outline" className="w-full mt-2" onClick={() => setLocation("/login")}>
                로그인으로 이동
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isLoggedIn = !!user;

  const handleJoin = () => {
    const body = isLoggedIn
      ? { token }
      : { token, name: name.trim(), password, phone: phone.trim() || undefined };

    if (!isLoggedIn && (!name.trim() || !password)) {
      toast({ title: "이름과 비밀번호를 입력해주세요", variant: "destructive" });
      return;
    }

    joinMutation.mutate(
      { data: body },
      {
        onSuccess: async () => {
          await refreshUser();
          await queryClient.refetchQueries({ queryKey: getGetMeQueryKey() });
          toast({ title: "가족에 합류했습니다! 🎉" });
          setLocation("/");
        },
        onError: () => {
          toast({ title: "합류에 실패했습니다. 링크를 확인하고 다시 시도해주세요.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="PickMeUpDaddy" className="w-48 mx-auto mb-2" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">가족 초대</CardTitle>
            <CardDescription>
              <strong>{preview.inviterName}</strong>님이 픽미업대디 가족으로 초대했습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {oauthError && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{oauthErrorMessage(oauthError)}</p>
              </div>
            )}

            <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-primary">초대받은 이메일</p>
                <p className="text-sm text-foreground">{preview.toEmail}</p>
              </div>
            </div>

            {isLoggedIn ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  <strong>{user.name}</strong>님으로 로그인되어 있습니다.<br />
                  아래 버튼을 누르면 가족에 즉시 합류합니다.
                </p>
                <Button
                  className="w-full"
                  onClick={handleJoin}
                  disabled={joinMutation.isPending}
                >
                  {joinMutation.isPending ? "합류 중..." : "이 가족에 합류하기"}
                </Button>
              </div>
            ) : preview.isRegistered ? (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <LogIn className="w-10 h-10 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">이미 가입된 계정이 있습니다</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      <strong>{preview.toEmail}</strong>로 로그인한 뒤 초대를 수락하거나,<br />
                      소셜 계정으로 바로 로그인하세요.
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => setLocation(`/login?next=/join?token=${token}`)}
                >
                  이메일로 로그인하고 수락하기
                </Button>
                <OAuthButtons token={token} />
              </div>
            ) : (
              <form
                onSubmit={e => { e.preventDefault(); handleJoin(); }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="join-email">이메일</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="join-email"
                      type="email"
                      value={preview.toEmail}
                      readOnly
                      className="pl-10 bg-muted/50 cursor-not-allowed"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="join-name">이름</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="join-name"
                      placeholder="이름을 입력하세요"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="join-password">비밀번호</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="join-password"
                      type="password"
                      placeholder="6자 이상 입력하세요"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pl-10"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="join-phone">전화번호 (선택)</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="join-phone"
                      placeholder="010-0000-0000"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={joinMutation.isPending}>
                  {joinMutation.isPending ? "가입 중..." : "계정 만들고 가족 합류하기"}
                </Button>
                <OAuthButtons token={token} />
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
