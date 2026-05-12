import { useMemo } from "react";
import {
  useGetTodayDashboard, getGetTodayDashboardQueryKey,
  useGetWarnings, getGetWarningsQueryKey,
  useGetFamilyMembers, getGetFamilyMembersQueryKey,
  useGetPendingSosRequests, getGetPendingSosRequestsQueryKey,
  useGetPendingSosTosses, getGetPendingSosTossesQueryKey,
  useAcceptSosToss, useDeclineSosToss,
  useCreateSosRequest,
  useAcceptSosRequest,
  useDeclineSosRequest,
  useGetChildren, getGetChildrenQueryKey,
} from "@workspace/api-client-react";
import type {
  DashboardItem, ScheduleWarning, FamilyMember, SosRequestDetail, SosTossRecord,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { useDeviceUser } from "@/lib/device-user-context";
import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, MapPin, Users, CalendarDays, Shield, PhoneCall, Check, X, ArrowRight, ArrowLeft, ArrowLeftRight } from "lucide-react";

const CHILD_COLORS = [
  { bg: "bg-blue-500", text: "text-white", light: "bg-blue-50", border: "border-l-blue-400" },
  { bg: "bg-orange-400", text: "text-white", light: "bg-orange-50", border: "border-l-orange-400" },
  { bg: "bg-violet-500", text: "text-white", light: "bg-violet-50", border: "border-l-violet-400" },
  { bg: "bg-emerald-500", text: "text-white", light: "bg-emerald-50", border: "border-l-emerald-400" },
  { bg: "bg-pink-500", text: "text-white", light: "bg-pink-50", border: "border-l-pink-400" },
];

function buildChildColorMap(children: { name: string }[]): Map<string, typeof CHILD_COLORS[number]> {
  const map = new Map<string, typeof CHILD_COLORS[number]>();
  children.forEach((child, idx) => {
    map.set(child.name, CHILD_COLORS[idx % CHILD_COLORS.length]);
  });
  return map;
}

function getTodayKorean(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];
  const dow = dayLabels[today.getDay()];
  return `${year}년 ${month}월 ${day}일 ${dow}요일`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const { isChildMode } = useDeviceUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: myDashboard, isLoading: myDashLoading } = useGetTodayDashboard(
    { filter: "mine" },
    { query: { queryKey: getGetTodayDashboardQueryKey({ filter: "mine" }) } }
  );
  const { data: allDashboard, isLoading: allDashLoading } = useGetTodayDashboard(
    { filter: "all" },
    { query: { queryKey: getGetTodayDashboardQueryKey({ filter: "all" }) } }
  );
  const { data: warnings } = useGetWarnings({ query: { queryKey: getGetWarningsQueryKey() } });
  const { data: familyMembers } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const { data: pendingRequests } = useGetPendingSosRequests({ query: { queryKey: getGetPendingSosRequestsQueryKey(), refetchInterval: 30000 } });
  const { data: pendingTosses } = useGetPendingSosTosses({ query: { queryKey: getGetPendingSosTossesQueryKey(), refetchInterval: 30000 } });
  const createSosMutation = useCreateSosRequest();
  const acceptSosMutation = useAcceptSosRequest();
  const declineSosMutation = useDeclineSosRequest();
  const acceptTossMutation = useAcceptSosToss();
  const declineTossMutation = useDeclineSosToss();

  const [sosDialogOpen, setSosDialogOpen] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [warningsDismissed, setWarningsDismissed] = useState(false);

  const { data: children } = useGetChildren({ query: { queryKey: getGetChildrenQueryKey() } });

  const childColorMap = useMemo(
    () => buildChildColorMap((children ?? []) as { name: string }[]),
    [children]
  );

  const handleSosClick = (timeSlotId: number) => {
    setSelectedSlotId(timeSlotId);
    setSosDialogOpen(true);
  };

  const handleSendSosRequest = (toUserId: number) => {
    if (!selectedSlotId) return;
    createSosMutation.mutate(
      { data: { timeSlotId: selectedSlotId, toUserId } },
      {
        onSuccess: () => {
          toast({ title: "SOS 요청 전송 완료", description: "상대방에게 도움 요청을 보냈습니다." });
          setSosDialogOpen(false);
          setSelectedSlotId(null);
          queryClient.invalidateQueries({ queryKey: getGetPendingSosRequestsQueryKey() });
        },
        onError: () => {
          toast({ title: "요청 실패", description: "다시 시도해주세요.", variant: "destructive" });
        },
      }
    );
  };

  const handleAccept = (requestId: number) => {
    acceptSosMutation.mutate(
      { id: requestId },
      {
        onSuccess: () => {
          toast({ title: "수락 완료", description: "픽업 담당이 변경되었습니다." });
          queryClient.invalidateQueries({ queryKey: getGetPendingSosRequestsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTodayDashboardQueryKey() });
        },
        onError: () => {
          toast({ title: "수락 실패", description: "다시 시도해주세요.", variant: "destructive" });
        },
      }
    );
  };

  const handleDecline = (requestId: number) => {
    declineSosMutation.mutate(
      { id: requestId },
      {
        onSuccess: () => {
          toast({ title: "거절 완료", description: "요청자에게 알림을 보냈습니다." });
          queryClient.invalidateQueries({ queryKey: getGetPendingSosRequestsQueryKey() });
        },
        onError: () => {
          toast({ title: "거절 실패", description: "다시 시도해주세요.", variant: "destructive" });
        },
      }
    );
  };

  const handleAcceptToss = (tossId: number) => {
    acceptTossMutation.mutate(
      { id: tossId },
      {
        onSuccess: () => {
          toast({ title: "긴급 전달 수락", description: "픽업 담당이 변경되었습니다." });
          queryClient.invalidateQueries({ queryKey: getGetPendingSosTossesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTodayDashboardQueryKey() });
        },
        onError: () => {
          toast({ title: "수락 실패", description: "다시 시도해주세요.", variant: "destructive" });
        },
      }
    );
  };

  const handleDeclineToss = (tossId: number) => {
    declineTossMutation.mutate(
      { id: tossId },
      {
        onSuccess: () => {
          toast({ title: "긴급 전달 거절", description: "요청자에게 알림을 보냈습니다." });
          queryClient.invalidateQueries({ queryKey: getGetPendingSosTossesQueryKey() });
        },
        onError: () => {
          toast({ title: "거절 실패", description: "다시 시도해주세요.", variant: "destructive" });
        },
      }
    );
  };

  const typedMembers = (familyMembers ?? []) as FamilyMember[];
  const typedPending = (pendingRequests ?? []) as SosRequestDetail[];
  const typedPendingTosses = (pendingTosses ?? []) as SosTossRecord[];
  const otherMembers = typedMembers.filter((m) => m.id !== user?.id);

  const statusColors: Record<string, string> = {
    upcoming: "bg-blue-100 text-blue-700",
    in_progress: "bg-green-100 text-green-700",
    completed: "bg-gray-100 text-gray-500",
    warning: "bg-amber-100 text-amber-700",
  };

  const statusLabels: Record<string, string> = {
    upcoming: "예정",
    in_progress: "진행 중",
    completed: "완료",
    warning: "주의",
  };

  const myItems = (myDashboard?.items ?? []) as DashboardItem[];
  const allItems = (allDashboard?.items ?? []) as DashboardItem[];
  const warningsList = (warnings ?? []) as ScheduleWarning[];
  const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const roleConfig = {
    dropOff: { label: "데려다 주기", icon: ArrowRight },
    pickUp:  { label: "데려오기",   icon: ArrowLeft },
    both:    { label: "등하원",     icon: ArrowLeftRight },
  };

  const renderScheduleCard = (item: DashboardItem, showGuardian = false, section: "my" | "all" = "my") => {
    const color = childColorMap.get(item.childName) ?? CHILD_COLORS[0];
    const role = section === "my" && item.myRole ? roleConfig[item.myRole as keyof typeof roleConfig] : null;
    const RoleIcon = role?.icon;
    return (
      <Card
        key={item.timeSlotId}
        className={`overflow-hidden border-l-4 ${color.border} ${color.light}`}
        data-testid={`card-${section}-${item.timeSlotId}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color.bg} ${color.text}`}>
                  {item.childName}
                </span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColors[item.status] || ""}`}>
                  {statusLabels[item.status] || item.status}
                </Badge>
              </div>
              <p className="text-sm text-foreground font-medium">{item.placeName}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {role && RoleIcon && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <RoleIcon className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">{role.label}</span>
                </div>
              )}
              {!isChildMode && item.guardianId === user?.id && item.status !== "completed" && otherMembers.length > 0 && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1 text-xs"
                  onClick={() => handleSosClick(item.timeSlotId)}
                  data-testid={`button-sos-${item.timeSlotId}`}
                >
                  <PhoneCall className="w-3 h-3" />
                  SOS
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {item.startTime} - {item.endTime}
            </span>
            {item.address && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {item.address.substring(0, 20)}{item.address.length > 20 ? "..." : ""}
              </span>
            )}
          </div>
          {showGuardian && item.guardianName && (
            <p className="text-xs text-muted-foreground mt-1">
              보호자: {item.guardianName}
            </p>
          )}
          {item.warning && (
            <div className="flex items-center gap-1 mt-2 text-xs text-amber-600">
              <AlertTriangle className="w-3 h-3" />
              {item.warning}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4" data-testid="dashboard-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground" data-testid="text-greeting">
            안녕하세요, {user?.name}님
          </h1>
          <p className="text-sm text-muted-foreground">{getTodayKorean()}</p>
        </div>
        {!isChildMode && (
          <Link href="/sos">
            <Button variant="destructive" size="sm" className="gap-1 shadow-lg" data-testid="button-sos-quick">
              <Shield className="w-4 h-4" />
              SOS
            </Button>
          </Link>
        )}
      </div>

      {!isChildMode && typedPending.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-red-500" />
            <span className="text-sm font-semibold text-red-700">SOS 도움 요청</span>
            <Badge variant="destructive" className="text-xs">{typedPending.length}</Badge>
          </div>
          {typedPending.map((req: SosRequestDetail) => (
            <Card key={req.id} className="border-red-200 bg-red-50">
              <CardContent className="p-3">
                <div className="mb-2">
                  <p className="text-sm font-medium text-red-800">
                    {req.fromUserName}님이 픽업 도움을 요청했습니다
                  </p>
                  <p className="text-xs text-red-600 mt-1">
                    {req.childName} - {req.placeName} ({dayLabels[req.dayOfWeek]}요일 {req.endTime})
                  </p>
                  {req.address && (
                    <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {req.address}
                    </p>
                  )}
                  {req.message && (
                    <p className="text-xs text-red-500 mt-1 italic">"{req.message}"</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => handleAccept(req.id)}
                    disabled={acceptSosMutation.isPending}
                  >
                    <Check className="w-3 h-3" />
                    수락
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1"
                    onClick={() => handleDecline(req.id)}
                    disabled={declineSosMutation.isPending}
                  >
                    <X className="w-3 h-3" />
                    거절
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isChildMode && typedPendingTosses.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-semibold text-orange-700">긴급 전달 요청</span>
            <Badge className="text-xs bg-orange-500">{typedPendingTosses.length}</Badge>
          </div>
          {typedPendingTosses.map((toss: SosTossRecord) => (
            <Card key={toss.id} className="border-orange-200 bg-orange-50">
              <CardContent className="p-3">
                <div className="mb-2">
                  <p className="text-sm font-medium text-orange-800">
                    {toss.fromGuardianName}님이 오늘 남은 {toss.transferredSchedules}건 픽업을 넘기려 합니다
                  </p>
                  {toss.message && (
                    <p className="text-xs text-orange-600 mt-1 italic">"{toss.message}"</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => handleAcceptToss(toss.id)}
                    disabled={acceptTossMutation.isPending}
                  >
                    <Check className="w-3 h-3" />
                    수락
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1"
                    onClick={() => handleDeclineToss(toss.id)}
                    disabled={declineTossMutation.isPending}
                  >
                    <X className="w-3 h-3" />
                    거절
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {warningsList.length > 0 && !warningsDismissed && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800 flex-1">일정 경고</span>
              <button
                onClick={() => setWarningsDismissed(true)}
                className="text-amber-500 hover:text-amber-700 transition-colors"
                data-testid="button-dismiss-warnings"
                aria-label="경고 닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {warningsList.slice(0, 3).map((w) => (
              <p key={w.id} className="text-xs text-amber-700 ml-6" data-testid={`text-warning-${w.id}`}>{w.message}</p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex rounded-lg border overflow-hidden text-xs" data-testid="filter-toggle">
        <button
          className="flex-1 px-3 py-2 transition-colors bg-primary text-primary-foreground"
          onClick={() => scrollToSection("my-roles")}
          data-testid="filter-mine"
        >
          내가 맡은 일정
        </button>
        <button
          className="flex-1 px-3 py-2 transition-colors bg-background text-muted-foreground hover:bg-muted"
          onClick={() => scrollToSection("all-schedules")}
          data-testid="filter-all"
        >
          아이들 전체 일정
        </button>
      </div>

      <div id="my-roles">
        <h2 className="font-semibold text-foreground mb-3">오늘 내가 맡은 역할</h2>
        {myDashLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : myItems.length > 0 ? (
          <div className="space-y-3">
            {myItems.map((item) => renderScheduleCard(item, false, "my"))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">오늘 맡은 일정이 없습니다</p>
              {isOwner && (
                <Link href="/children">
                  <Button variant="outline" size="sm" className="mt-3" data-testid="button-add-schedule">
                    일정 추가
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div id="all-schedules" className="pb-4">
        <h2 className="font-semibold text-foreground mb-3">아이들 전체 일정</h2>
        {allDashLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : allItems.length > 0 ? (
          <div className="space-y-3">
            {allItems.map((item) => renderScheduleCard(item, true, "all"))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">오늘 일정이 없습니다</p>
            </CardContent>
          </Card>
        )}
      </div>

      {!isChildMode && <Dialog open={sosDialogOpen} onOpenChange={setSosDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>SOS 도움 요청</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            이 픽업을 대신해줄 가족 구성원을 선택하세요.
          </p>
          <div className="space-y-2">
            {otherMembers.map((member: FamilyMember) => (
              <Button
                key={member.id}
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => handleSendSosRequest(member.id)}
                disabled={createSosMutation.isPending}
              >
                <Users className="w-4 h-4" />
                {member.name}
                <span className="text-xs text-muted-foreground ml-auto">요청하기</span>
              </Button>
            ))}
          </div>
          {otherMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              가족 구성원이 없습니다. 먼저 가족을 초대해주세요.
            </p>
          )}
        </DialogContent>
      </Dialog>}
    </div>
  );
}
