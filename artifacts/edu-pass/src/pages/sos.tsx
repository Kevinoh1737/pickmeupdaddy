import { useState } from "react";
import {
  useGetFamilyMembers,
  getGetFamilyMembersQueryKey,
  useSosToss,
  useGetSosHistory,
  getGetSosHistoryQueryKey,
  getGetTodayDashboardQueryKey,
  getGetPendingSosTossesQueryKey,
} from "@workspace/api-client-react";
import type { SosTossRecord } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Shield, ArrowRightLeft, Clock, AlertTriangle, CheckCircle, XCircle, Hourglass } from "lucide-react";

export default function SosPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: members } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const { data: history, isLoading: historyLoading } = useGetSosHistory({ query: { queryKey: getGetSosHistoryQueryKey() } });
  const sosMutation = useSosToss();

  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pendingToss, setPendingToss] = useState<SosTossRecord | null>(null);

  const otherMembers = (members as any[])?.filter((m: any) => m.role !== "me") || [];

  const handleSos = () => {
    if (!targetId) {
      toast({ title: "보호자를 선택해주세요", variant: "destructive" });
      return;
    }

    sosMutation.mutate(
      { data: { targetGuardianId: parseInt(targetId), message: message || undefined } },
      {
        onSuccess: (result: any) => {
          queryClient.invalidateQueries({ queryKey: getGetSosHistoryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTodayDashboardQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPendingSosTossesQueryKey() });
          setConfirmed(false);
          setMessage("");
          setPendingToss(result);
          toast({ title: "SOS 전달 요청 완료", description: "상대방이 수락하면 픽업이 이전됩니다." });
        },
        onError: () => {
          toast({ title: "SOS 전달 실패", variant: "destructive" });
        },
      }
    );
  };

  const statusBadge = (status: string) => {
    if (status === "accepted") return (
      <Badge className="bg-green-100 text-green-700 border-green-200 gap-1 text-xs">
        <CheckCircle className="w-3 h-3" />수락됨
      </Badge>
    );
    if (status === "declined") return (
      <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-xs">
        <XCircle className="w-3 h-3" />거절됨
      </Badge>
    );
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1 text-xs">
        <Hourglass className="w-3 h-3" />수락 대기 중
      </Badge>
    );
  };

  return (
    <div className="space-y-4" data-testid="sos-page">
      <h1 className="text-xl font-bold text-foreground">SOS 긴급 전달</h1>
      <p className="text-sm text-muted-foreground">남은 픽업을 다른 보호자에게 전달 요청합니다</p>

      {pendingToss && pendingToss.status === "pending" && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Hourglass className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-amber-800">수락 대기 중</p>
                <p className="text-sm text-amber-700 mt-1">
                  {pendingToss.transferredSchedules}건의 픽업 전달 요청을 보냈습니다.
                  상대방이 수락하면 픽업이 이전됩니다.
                </p>
                {pendingToss.message && (
                  <p className="text-xs text-amber-600 mt-1 italic">"{pendingToss.message}"</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <p className="font-semibold text-foreground">긴급 전달</p>
              <p className="text-xs text-muted-foreground">오늘 남은 모든 픽업 전달을 요청합니다</p>
            </div>
          </div>

          {otherMembers.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">전달할 가족 구성원이 없습니다.</p>
              <p className="text-xs text-muted-foreground mt-1">먼저 가족 탭에서 보호자를 초대하세요.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>전달 대상</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger data-testid="select-sos-target">
                    <SelectValue placeholder="보호자 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherMembers.map((m: any) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>메시지 (선택)</Label>
                <Input
                  placeholder="예: 회의 중이라 부탁드립니다"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  data-testid="input-sos-message"
                />
              </div>

              {!confirmed ? (
                <Button
                  variant="destructive"
                  className="w-full gap-2 h-12 text-base"
                  onClick={() => setConfirmed(true)}
                  disabled={!targetId}
                  data-testid="button-sos-prepare"
                >
                  <AlertTriangle className="w-5 h-5" />
                  SOS 전달 요청
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-destructive text-center font-medium">정말 전달 요청하시겠습니까? 상대방이 수락해야 픽업이 이전됩니다.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setConfirmed(false)} data-testid="button-sos-cancel">
                      취소
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 gap-1"
                      onClick={handleSos}
                      disabled={sosMutation.isPending}
                      data-testid="button-sos-confirm"
                    >
                      <Shield className="w-4 h-4" />
                      {sosMutation.isPending ? "요청 중..." : "전달 요청"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            SOS 이력
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : (history as any[])?.length ? (
            <div className="space-y-2">
              {(history as any[]).map((record: any) => (
                <div key={record.id} className="flex items-start gap-3 p-2 bg-muted/30 rounded-lg" data-testid={`card-sos-${record.id}`}>
                  <ArrowRightLeft className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm">
                        <span className="font-medium">{record.fromGuardianName}</span>
                        {" → "}
                        <span className="font-medium">{record.toGuardianName}</span>
                      </p>
                      {statusBadge(record.status)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{record.transferredSchedules}건</span>
                      <span>{new Date(record.createdAt).toLocaleDateString()}</span>
                    </div>
                    {record.message && (
                      <p className="text-xs text-muted-foreground italic mt-0.5">{record.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">SOS 이력이 없습니다</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
