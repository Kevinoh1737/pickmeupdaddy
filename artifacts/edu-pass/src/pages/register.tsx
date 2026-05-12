import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useRegister, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, User, Phone } from "lucide-react";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function KakaoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 3C7.029 3 3 6.364 3 10.5c0 2.569 1.647 4.834 4.148 6.193l-1.057 3.93a.188.188 0 0 0 .286.203L10.81 18.2A10.918 10.918 0 0 0 12 18c4.971 0 9-3.364 9-7.5S16.971 3 12 3z" fill="rgba(0,0,0,0.85)"/>
    </svg>
  );
}

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const registerMutation = useRegister();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(
      { data: { name, email, password, phone: phone || undefined } },
      {
        onSuccess: async () => {
          await queryClient.refetchQueries({ queryKey: getGetMeQueryKey() });
          setLocation("/onboarding");
        },
        onError: () => {
          toast({ title: "회원가입 실패", description: "입력 정보를 확인하고 다시 시도해주세요", variant: "destructive" });
        },
      }
    );
  };

  const handleGoogleSignup = () => {
    window.location.href = `${import.meta.env.BASE_URL}api/auth/google`.replace(/\/\//g, "/");
  };

  const handleKakaoSignup = () => {
    window.location.href = `${import.meta.env.BASE_URL}api/auth/kakao`.replace(/\/\//g, "/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="PickMeUpDaddy" className="w-48 mx-auto mb-2" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">회원가입</CardTitle>
            <CardDescription>가족 일정 관리를 시작하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-md font-medium text-sm mb-3 transition-opacity hover:opacity-90 active:opacity-80"
              style={{ backgroundColor: "#FEE500", color: "rgba(0,0,0,0.85)" }}
              onClick={handleKakaoSignup}
              data-testid="button-kakao-register"
            >
              <KakaoIcon className="w-5 h-5" />
              카카오로 시작하기
            </button>

            <Button
              type="button"
              variant="outline"
              className="w-full mb-4"
              onClick={handleGoogleSignup}
              data-testid="button-google-register"
            >
              <GoogleIcon className="w-5 h-5 mr-2" />
              Google로 회원가입
            </Button>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">또는</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">이름</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="name" placeholder="이름을 입력하세요" value={name} onChange={e => setName(e.target.value)} className="pl-10" required data-testid="input-name" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="example@email.com" value={email} onChange={e => setEmail(e.target.value)} className="pl-10" required data-testid="input-email" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="password" type="password" placeholder="6자 이상 입력하세요" value={password} onChange={e => setPassword(e.target.value)} className="pl-10" required minLength={6} data-testid="input-password" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">전화번호 (선택)</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="phone" placeholder="010-0000-0000" value={phone} onChange={e => setPhone(e.target.value)} className="pl-10" data-testid="input-phone" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={registerMutation.isPending} data-testid="button-register">
                {registerMutation.isPending ? "계정 생성 중..." : "계정 만들기"}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              이미 계정이 있으신가요?{" "}
              <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
                로그인
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
