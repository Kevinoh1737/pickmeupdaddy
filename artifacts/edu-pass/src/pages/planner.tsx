import React, { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  useGetWeeklyPlanner,
  getGetWeeklyPlannerQueryKey,
  useGetChildren,
  getGetChildrenQueryKey,
  useGetFamilyPlaces,
  getGetFamilyPlacesQueryKey,
  useGetTimeSlots,
  getGetTimeSlotsQueryKey,
  useCreateTimeSlot,
  useGetFamilyMembers,
  getGetFamilyMembersQueryKey,
} from "@workspace/api-client-react";
import type { Place, TimeSlot, Child, FamilyMember, CreateTimeSlotBodyMobilityType } from "@workspace/api-client-react";
import type { WeeklyPlanner, PlannerDay, PlannerItem } from "@workspace/api-zod";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, AlertTriangle, GraduationCap, BookOpen, Building2, Calendar, CalendarDays, Bus, UserCircle, Plus, Home } from "lucide-react";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const DAY_NAMES_FULL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

const ACADEMY_HOURS = Array.from({ length: 10 }, (_, i) => i + 13);
const SCHOOL_HOURS = Array.from({ length: 16 }, (_, i) => i + 7);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const HALF_MINUTES = [0, 30];
const DAYS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" },
];

function TimeDropdown({ hour, minute, onHourChange, onMinuteChange, label, testId, hours, disabled, labelExtra, minuteOptions }: {
  hour: number; minute: number;
  onHourChange: (h: number) => void; onMinuteChange: (m: number) => void;
  label: string; testId?: string; hours?: number[]; disabled?: boolean; labelExtra?: React.ReactNode; minuteOptions?: number[];
}) {
  const hourOptions = hours || ACADEMY_HOURS;
  const minOptions = minuteOptions || MINUTES;
  return (
    <div className="space-y-2">
      <Label>{label}{labelExtra}</Label>
      <div className="flex gap-2">
        <Select value={String(hour)} onValueChange={v => onHourChange(parseInt(v))} disabled={disabled} data-testid={testId ? `${testId}-hour` : undefined}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {hourOptions.map(h => (
              <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}시</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(minute)} onValueChange={v => onMinuteChange(parseInt(v))} disabled={disabled} data-testid={testId ? `${testId}-minute` : undefined}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {minOptions.map(m => (
              <SelectItem key={m} value={String(m)}>{String(m).padStart(2, "0")}분</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function AddScheduleDialog({ open, onOpenChange, defaultDayOfWeek, weekStarts }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDayOfWeek: number;
  weekStarts: string[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);

  const { data: children } = useGetChildren({ query: { queryKey: getGetChildrenQueryKey() } });
  const { data: members } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const { data: places } = useGetFamilyPlaces({
    query: { queryKey: getGetFamilyPlacesQueryKey() },
  });
  const { data: timeSlots } = useGetTimeSlots(selectedChildId || 0, {
    query: { enabled: !!selectedChildId, queryKey: getGetTimeSlotsQueryKey(selectedChildId || 0) },
  });
  const createSlotMutation = useCreateTimeSlot();

  const childrenList = (children || []) as Child[];
  const placesList = (places || []) as Place[];
  const schedulablePlaces = placesList.filter(p => p.type !== "home");
  const slotsList = (timeSlots || []) as TimeSlot[];
  const membersList = (members || []) as FamilyMember[];

  const [slotForm, setSlotForm] = useState({
    placeId: 0,
    dayOfWeek: defaultDayOfWeek,
    startTime: "09:00",
    endTime: "10:00",
    primaryGuardianId: null as number | null,
    backupGuardianId: null as number | null,
    mobilityType: null as string | null,
    shuttleArrivalTime: null as string | null,
    parentAccompany: false,
  });

  const selectedPlace = placesList.find(p => p.id === slotForm.placeId);
  const isSchoolPlace = selectedPlace?.type === "school";
  const isCarePlace = selectedPlace?.type === "care";
  const isAcademyPlace = selectedPlace?.type === "academy";

  const academyPrerequisiteMet = (() => {
    if (!isAcademyPlace) return true;
    return slotsList.some(
      s => s.dayOfWeek === slotForm.dayOfWeek && s.placeType === "school"
    );
  })();

  const existingSchoolStartTime = (() => {
    if (!isSchoolPlace || !selectedPlace) return null;
    const existingSchoolSlot = slotsList.find(s => s.placeId === selectedPlace.id);
    return existingSchoolSlot?.startTime || null;
  })();
  const schoolStartTimeLocked = isSchoolPlace && existingSchoolStartTime !== null;

  const resetForm = () => {
    setStep(1);
    setSelectedChildId(null);
    setSlotForm({
      placeId: 0,
      dayOfWeek: defaultDayOfWeek,
      startTime: "09:00",
      endTime: "10:00",
      primaryGuardianId: null,
      backupGuardianId: null,
      mobilityType: null,
      shuttleArrivalTime: null,
      parentAccompany: false,
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const handleSelectChild = (childId: number) => {
    setSelectedChildId(childId);
    setStep(2);
    setSlotForm(f => ({ ...f, dayOfWeek: defaultDayOfWeek }));
  };

  const handleCreateSlot = () => {
    if (!selectedChildId || !slotForm.placeId) {
      toast({ title: "장소를 선택해주세요", variant: "destructive" });
      return;
    }
    createSlotMutation.mutate(
      {
        childId: selectedChildId,
        data: {
          placeId: slotForm.placeId,
          dayOfWeek: slotForm.dayOfWeek,
          startTime: schoolStartTimeLocked ? existingSchoolStartTime! : slotForm.startTime,
          endTime: slotForm.endTime,
          primaryGuardianId: slotForm.primaryGuardianId ?? undefined,
          backupGuardianId: slotForm.backupGuardianId ?? undefined,
          mobilityType: (slotForm.mobilityType as CreateTimeSlotBodyMobilityType) ?? undefined,
          shuttleArrivalTime: slotForm.mobilityType === "shuttle" ? slotForm.shuttleArrivalTime ?? undefined : undefined,
          parentAccompany: isSchoolPlace ? slotForm.parentAccompany : undefined,
        },
      },
      {
        onSuccess: () => {
          weekStarts.forEach(ws => {
            if (ws) {
              queryClient.invalidateQueries({ queryKey: getGetWeeklyPlannerQueryKey({ startDate: ws }) });
            }
          });
          queryClient.invalidateQueries({ queryKey: getGetTimeSlotsQueryKey(selectedChildId) });
          handleOpenChange(false);
          toast({ title: "일정이 추가되었습니다" });
        },
        onError: (err: unknown) => {
          const errorObj = err as { data?: { error?: string }; message?: string };
          const errorMsg = errorObj?.data?.error || errorObj?.message || "일정 추가에 실패했습니다";
          toast({ title: errorMsg, variant: "destructive" });
        },
      }
    );
  };

  const prevSelectedChildRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedChildId && places && selectedChildId !== prevSelectedChildRef.current) {
      prevSelectedChildRef.current = selectedChildId;
      const firstPlace = schedulablePlaces.length > 0 ? schedulablePlaces[0] : null;
      const isAcademy = firstPlace && firstPlace.type !== "school";
      setSlotForm(f => ({
        ...f,
        placeId: firstPlace?.id || 0,
        startTime: isAcademy ? "13:00" : "09:00",
        endTime: isAcademy ? "14:00" : "10:00",
        parentAccompany: false,
        shuttleArrivalTime: null,
      }));
    }
    if (!selectedChildId) {
      prevSelectedChildRef.current = null;
    }
  }, [selectedChildId, places, placesList]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{step === 1 ? "아이 선택" : "새 일정"}</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-3">
            {childrenList.length === 0 ? (
              <div className="text-center py-8">
                <UserCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">등록된 아이가 없습니다</p>
                <p className="text-xs text-muted-foreground mt-1">먼저 아이를 등록해주세요</p>
              </div>
            ) : (
              childrenList.map((child: Child) => (
                <button
                  key={child.id}
                  onClick={() => handleSelectChild(child.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                  data-testid={`select-child-${child.id}`}
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{child.name}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                </button>
              ))
            )}
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>닫기</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <button onClick={() => { setStep(1); setSelectedChildId(null); prevSelectedChildRef.current = null; }} className="hover:text-foreground transition-colors">
                아이 선택
              </button>
              <ChevronRight className="w-3 h-3" />
              <span className="font-medium text-foreground">
                {childrenList.find(c => c.id === selectedChildId)?.name}
              </span>
            </div>

            {schedulablePlaces.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">등록된 장소가 없습니다</p>
                <p className="text-xs text-muted-foreground mt-1">아이의 일정 관리 페이지에서 장소를 먼저 등록해주세요</p>
                <div className="flex gap-2 justify-end pt-4">
                  <Button variant="outline" onClick={() => { setStep(1); setSelectedChildId(null); prevSelectedChildRef.current = null; }}>아이 다시 선택</Button>
                  <Button variant="outline" onClick={() => handleOpenChange(false)}>닫기</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>요일 *</Label>
                  <Select value={String(slotForm.dayOfWeek)} onValueChange={v => setSlotForm(f => ({ ...f, dayOfWeek: parseInt(v) }))}>
                    <SelectTrigger data-testid="planner-select-day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map(d => (
                        <SelectItem key={d.value} value={String(d.value)}>{d.label}요일</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>장소 *</Label>
                  <Select value={String(slotForm.placeId || "")} onValueChange={v => {
                    const newPlaceId = parseInt(v);
                    const newPlace = placesList.find(p => p.id === newPlaceId);
                    const existingSlotForSchool = newPlace?.type === "school"
                      ? slotsList.find(s => s.placeId === newPlaceId)
                      : null;
                    setSlotForm(f => ({
                      ...f,
                      placeId: newPlaceId,
                      startTime: existingSlotForSchool ? existingSlotForSchool.startTime : (newPlace?.type !== "school" ? "13:00" : f.startTime),
                      endTime: newPlace?.type !== "school" ? "14:00" : f.endTime,
                      parentAccompany: false,
                    }));
                  }}>
                    <SelectTrigger data-testid="planner-select-place">
                      <SelectValue placeholder="장소를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {schedulablePlaces.map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.placeName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isSchoolPlace ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TimeDropdown
                      label="등교 시간"
                      labelExtra={schoolStartTimeLocked ? <span className="text-xs text-muted-foreground ml-1">(기존 등교 시간 자동 적용)</span> : <span className="text-xs text-muted-foreground ml-1">(첫 등교 시간 입력)</span>}
                      hour={parseInt((schoolStartTimeLocked ? existingSchoolStartTime! : slotForm.startTime).split(":")[0]) || 8}
                      minute={parseInt((schoolStartTimeLocked ? existingSchoolStartTime! : slotForm.startTime).split(":")[1]) || 0}
                      onHourChange={h => setSlotForm(f => ({ ...f, startTime: `${String(h).padStart(2, "0")}:${f.startTime.split(":")[1] || "00"}` }))}
                      onMinuteChange={m => setSlotForm(f => ({ ...f, startTime: `${f.startTime.split(":")[0] || "08"}:${String(m).padStart(2, "0")}` }))}
                      hours={SCHOOL_HOURS}
                      disabled={schoolStartTimeLocked}
                      testId="planner-select-start-time"
                    />
                    <TimeDropdown
                      label="하교 시간"
                      hour={parseInt(slotForm.endTime.split(":")[0]) || 14}
                      minute={parseInt(slotForm.endTime.split(":")[1]) || 0}
                      onHourChange={h => setSlotForm(f => ({ ...f, endTime: `${String(h).padStart(2, "0")}:${f.endTime.split(":")[1] || "00"}` }))}
                      onMinuteChange={m => setSlotForm(f => ({ ...f, endTime: `${f.endTime.split(":")[0] || "14"}:${String(m).padStart(2, "0")}` }))}
                      hours={SCHOOL_HOURS}
                      testId="planner-select-end-time"
                    />
                  </div>
                ) : isCarePlace ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TimeDropdown
                      label="시작 시간"
                      hour={parseInt(slotForm.startTime.split(":")[0]) || 13}
                      minute={parseInt(slotForm.startTime.split(":")[1]) || 0}
                      onHourChange={h => setSlotForm(f => ({ ...f, startTime: `${String(h).padStart(2, "0")}:${f.startTime.split(":")[1] || "00"}` }))}
                      onMinuteChange={m => setSlotForm(f => ({ ...f, startTime: `${f.startTime.split(":")[0] || "13"}:${String(m).padStart(2, "0")}` }))}
                      hours={SCHOOL_HOURS}
                      testId="planner-select-start-time"
                    />
                    <TimeDropdown
                      label="종료 시간"
                      hour={parseInt(slotForm.endTime.split(":")[0]) || 14}
                      minute={parseInt(slotForm.endTime.split(":")[1]) || 0}
                      onHourChange={h => setSlotForm(f => ({ ...f, endTime: `${String(h).padStart(2, "0")}:${f.endTime.split(":")[1] || "00"}` }))}
                      onMinuteChange={m => setSlotForm(f => ({ ...f, endTime: `${f.endTime.split(":")[0] || "14"}:${String(m).padStart(2, "0")}` }))}
                      hours={SCHOOL_HOURS}
                      minuteOptions={MINUTES}
                      testId="planner-select-end-time"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TimeDropdown
                      label="시작 시간"
                      hour={parseInt(slotForm.startTime.split(":")[0]) || 13}
                      minute={parseInt(slotForm.startTime.split(":")[1]) || 0}
                      onHourChange={h => setSlotForm(f => ({ ...f, startTime: `${String(h).padStart(2, "0")}:${f.startTime.split(":")[1] || "00"}` }))}
                      onMinuteChange={m => setSlotForm(f => ({ ...f, startTime: `${f.startTime.split(":")[0] || "13"}:${String(m).padStart(2, "0")}` }))}
                      testId="planner-select-start-time"
                    />
                    <TimeDropdown
                      label="종료 시간"
                      hour={parseInt(slotForm.endTime.split(":")[0]) || 14}
                      minute={parseInt(slotForm.endTime.split(":")[1]) || 0}
                      onHourChange={h => setSlotForm(f => ({ ...f, endTime: `${String(h).padStart(2, "0")}:${f.endTime.split(":")[1] || "00"}` }))}
                      onMinuteChange={m => setSlotForm(f => ({ ...f, endTime: `${f.endTime.split(":")[0] || "14"}:${String(m).padStart(2, "0")}` }))}
                      minuteOptions={HALF_MINUTES}
                      testId="planner-select-end-time"
                    />
                  </div>
                )}

                {isSchoolPlace && (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label className="text-sm font-medium">등교 부모 동반</Label>
                      <p className="text-xs text-muted-foreground">등교 시 부모가 동반합니다</p>
                    </div>
                    <Switch
                      checked={slotForm.parentAccompany}
                      onCheckedChange={v => setSlotForm(f => ({ ...f, parentAccompany: v }))}
                      data-testid="planner-switch-parent-accompany"
                    />
                  </div>
                )}

                {isAcademyPlace && !academyPrerequisiteMet && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    학원 일정은 학교 일정이 등록된 요일에만 추가할 수 있습니다
                  </div>
                )}

                <div className="space-y-2">
                  <Label>이동 수단</Label>
                  <Select value={slotForm.mobilityType || "none"} onValueChange={v => setSlotForm(f => ({ ...f, mobilityType: v === "none" ? null : v, shuttleArrivalTime: v === "shuttle" ? (f.shuttleArrivalTime || "15:00") : null }))}>
                    <SelectTrigger data-testid="planner-select-mobility">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">미설정</SelectItem>
                      <SelectItem value="shuttle">셔틀</SelectItem>
                      <SelectItem value="parent">부모 픽업</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {slotForm.mobilityType === "shuttle" && (
                  <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Bus className="w-4 h-4 text-teal-600" />
                      <Label className="text-sm font-medium">셔틀 버스 예상 도착 시간</Label>
                    </div>
                    <div className="flex gap-2">
                      <Select value={String(parseInt((slotForm.shuttleArrivalTime || "15:00").split(":")[0]))} onValueChange={v => setSlotForm(f => ({ ...f, shuttleArrivalTime: `${String(parseInt(v)).padStart(2, "0")}:${(f.shuttleArrivalTime || "15:00").split(":")[1]}` }))}>
                        <SelectTrigger className="flex-1" data-testid="planner-select-shuttle-hour">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACADEMY_HOURS.map(h => (
                            <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}시</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={String(parseInt((slotForm.shuttleArrivalTime || "15:00").split(":")[1]))} onValueChange={v => setSlotForm(f => ({ ...f, shuttleArrivalTime: `${(f.shuttleArrivalTime || "15:00").split(":")[0]}:${String(parseInt(v)).padStart(2, "0")}` }))}>
                        <SelectTrigger className="flex-1" data-testid="planner-select-shuttle-minute">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MINUTES.map(m => (
                            <SelectItem key={m} value={String(m)}>{String(m).padStart(2, "0")}분</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {membersList.length > 0 && (
                  <>
                    <div className="space-y-2">
                      <Label>주 보호자</Label>
                      <Select value={String(slotForm.primaryGuardianId || "none")} onValueChange={v => setSlotForm(f => ({ ...f, primaryGuardianId: v === "none" ? null : parseInt(v) }))}>
                        <SelectTrigger data-testid="planner-select-primary-guardian">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">미지정</SelectItem>
                          {membersList.map(m => (
                            <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>보조 보호자</Label>
                      <Select value={String(slotForm.backupGuardianId || "none")} onValueChange={v => setSlotForm(f => ({ ...f, backupGuardianId: v === "none" ? null : parseInt(v) }))}>
                        <SelectTrigger data-testid="planner-select-backup-guardian">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">미지정</SelectItem>
                          {membersList.map(m => (
                            <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => handleOpenChange(false)}>취소</Button>
                  <Button onClick={handleCreateSlot} disabled={createSlotMutation.isPending || (isAcademyPlace && !academyPrerequisiteMet)} data-testid="planner-button-confirm-add">
                    {createSlotMutation.isPending ? "추가 중..." : "일정 추가"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeekStartDate(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthWeekStarts(year: number, month: number): string[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const starts: string[] = [];
  const firstWeekStart = getWeekStartDate(firstDay);
  let current = new Date(firstWeekStart);
  while (current <= lastDay) {
    starts.push(formatDateStr(current));
    current = new Date(current.getTime() + 7 * 86400000);
  }
  return starts;
}

function getMonthCalendarDates(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const dates: Date[] = [];
  const start = getWeekStartDate(firstDay);
  let current = new Date(start);
  for (let i = 0; i < 42; i++) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function dayDateStr(day: PlannerDay): string {
  return String(day.date).split("T")[0];
}

function useMultiWeekPlanner(weekStarts: string[]) {
  const w0 = useGetWeeklyPlanner(
    { startDate: weekStarts[0] || "" },
    { query: { enabled: !!weekStarts[0], queryKey: getGetWeeklyPlannerQueryKey({ startDate: weekStarts[0] || "" }) } }
  );
  const w1 = useGetWeeklyPlanner(
    { startDate: weekStarts[1] || "" },
    { query: { enabled: !!weekStarts[1], queryKey: getGetWeeklyPlannerQueryKey({ startDate: weekStarts[1] || "" }) } }
  );
  const w2 = useGetWeeklyPlanner(
    { startDate: weekStarts[2] || "" },
    { query: { enabled: !!weekStarts[2], queryKey: getGetWeeklyPlannerQueryKey({ startDate: weekStarts[2] || "" }) } }
  );
  const w3 = useGetWeeklyPlanner(
    { startDate: weekStarts[3] || "" },
    { query: { enabled: !!weekStarts[3], queryKey: getGetWeeklyPlannerQueryKey({ startDate: weekStarts[3] || "" }) } }
  );
  const w4 = useGetWeeklyPlanner(
    { startDate: weekStarts[4] || "" },
    { query: { enabled: !!weekStarts[4], queryKey: getGetWeeklyPlannerQueryKey({ startDate: weekStarts[4] || "" }) } }
  );
  const w5 = useGetWeeklyPlanner(
    { startDate: weekStarts[5] || "" },
    { query: { enabled: !!weekStarts[5], queryKey: getGetWeeklyPlannerQueryKey({ startDate: weekStarts[5] || "" }) } }
  );

  const allWeeks = [w0, w1, w2, w3, w4, w5];
  const isLoading = allWeeks.some((w, i) => weekStarts[i] && w.isLoading);

  const dayMap = useMemo(() => {
    const map = new Map<string, PlannerDay>();
    allWeeks.forEach((w, i) => {
      if (!weekStarts[i] || !w.data) return;
      const planner = w.data as WeeklyPlanner;
      if (planner.days) {
        planner.days.forEach((day: PlannerDay) => {
          const dateKey = dayDateStr(day);
          if (!map.has(dateKey)) {
            map.set(dateKey, day);
          }
        });
      }
    });
    return map;
  }, [w0.data, w1.data, w2.data, w3.data, w4.data, w5.data, weekStarts.join(",")]);

  return { dayMap, isLoading };
}

function useSingleWeekPlanner(startDate: string) {
  const enabled = !!startDate;
  const { data, isLoading } = useGetWeeklyPlanner(
    { startDate: startDate || "" },
    { query: { enabled, queryKey: getGetWeeklyPlannerQueryKey({ startDate: startDate || "" }) } }
  );

  const dayMap = useMemo(() => {
    const map = new Map<string, PlannerDay>();
    const planner = data as WeeklyPlanner | undefined;
    if (planner?.days) {
      planner.days.forEach((day: PlannerDay) => {
        map.set(dayDateStr(day), day);
      });
    }
    return map;
  }, [data]);

  return { dayMap, isLoading };
}

const CHILD_COLORS = [
  { bg: "bg-blue-500", text: "text-white" },
  { bg: "bg-orange-400", text: "text-white" },
  { bg: "bg-violet-500", text: "text-white" },
  { bg: "bg-emerald-500", text: "text-white" },
  { bg: "bg-pink-500", text: "text-white" },
];

function buildChildColorMap(children: { name: string }[]): Map<string, { bg: string; text: string }> {
  const map = new Map<string, { bg: string; text: string }>();
  children.forEach((child, idx) => {
    map.set(child.name, CHILD_COLORS[idx % CHILD_COLORS.length]);
  });
  return map;
}

function EventBars({ items, childColorMap, maxBars = 2 }: {
  items: PlannerItem[];
  childColorMap: Map<string, { bg: string; text: string }>;
  maxBars?: number;
}) {
  if (items.length === 0) return null;
  const visible = items.slice(0, maxBars);
  const overflow = items.length - maxBars;
  return (
    <div className="w-full flex flex-col gap-0.5 mt-0.5 px-0.5">
      {visible.map((item, i) => {
        const color = childColorMap.get(item.childName) ?? CHILD_COLORS[0];
        return (
          <div
            key={i}
            className={`${color.bg} ${color.text} rounded-sm px-1 h-3.5 flex items-center overflow-hidden`}
          >
            <span className="text-[9px] leading-none truncate">{item.placeName}</span>
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="text-[9px] leading-none text-muted-foreground text-center">+{overflow}</div>
      )}
    </div>
  );
}

const TIMELINE_START_HOUR = 7;
const TIMELINE_END_HOUR = 22;
const TIMELINE_TOTAL_MINUTES = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;
const TIMELINE_HOUR_PX = 56;
const TIMELINE_TOTAL_PX = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * TIMELINE_HOUR_PX;

function timeToTopPx(time: string): number {
  const [h, m] = time.split(":").map(Number);
  const mins = (h - TIMELINE_START_HOUR) * 60 + m;
  return Math.max(0, Math.min((mins / TIMELINE_TOTAL_MINUTES) * TIMELINE_TOTAL_PX, TIMELINE_TOTAL_PX));
}

function durationToHeightPx(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return Math.max(24, (mins / TIMELINE_TOTAL_MINUTES) * TIMELINE_TOTAL_PX);
}

function formatHourLabel(hour: number): string {
  if (hour < 12) return `오전 ${hour}시`;
  if (hour === 12) return "오후 12시";
  return `오후 ${hour - 12}시`;
}

function typeColorCls(type: string): { bg: string; text: string } {
  if (type === "school") return { bg: "bg-blue-500", text: "text-white" };
  if (type === "care") return { bg: "bg-purple-500", text: "text-white" };
  if (type === "home") return { bg: "bg-yellow-400", text: "text-yellow-900" };
  return { bg: "bg-green-500", text: "text-white" };
}

function DayTimelineSection({ date, day, addButton, childColorMap }: {
  date: string;
  day: PlannerDay | undefined;
  addButton?: React.ReactNode;
  childColorMap: Map<string, { bg: string; text: string }>;
}) {
  const dateObj = new Date(date + "T00:00:00");
  const month = dateObj.getMonth() + 1;
  const dayNum = dateObj.getDate();
  const dayName = DAY_NAMES_FULL[dateObj.getDay()];
  const todayStr = formatDateStr(new Date());
  const isToday = date === todayStr;
  const scrollRef = useRef<HTMLDivElement>(null);

  const childGroups = useMemo(() => {
    const map = new Map<string, PlannerItem[]>();
    const order: string[] = [];
    for (const item of day?.items ?? []) {
      if (!map.has(item.childName)) {
        map.set(item.childName, []);
        order.push(item.childName);
      }
      map.get(item.childName)!.push(item);
    }
    return order.map(name => [name, map.get(name)!] as [string, PlannerItem[]]);
  }, [day]);

  const displayGroups = childGroups.slice(0, 2);
  const extraChildren = childGroups.length - 2;

  useEffect(() => {
    if (!scrollRef.current) return;
    const allItems = day?.items ?? [];
    const sorted = [...allItems].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const firstItem = sorted[0];
    let targetPx: number;
    if (firstItem) {
      targetPx = Math.max(0, timeToTopPx(firstItem.startTime) - 24);
    } else {
      const now = new Date();
      const nowMins = (now.getHours() - TIMELINE_START_HOUR) * 60 + now.getMinutes();
      targetPx = Math.max(0, (nowMins / TIMELINE_TOTAL_MINUTES) * TIMELINE_TOTAL_PX - 24);
    }
    scrollRef.current.scrollTop = targetPx;
  }, [date, day]);

  const hourLines = Array.from({ length: TIMELINE_END_HOUR - TIMELINE_START_HOUR }, (_, i) => i);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-foreground">
            {month}월 {dayNum}일 {dayName}
          </h2>
          {isToday && <Badge variant="default" className="text-[10px] px-1.5 py-0">오늘</Badge>}
        </div>
        {addButton}
      </div>

      {extraChildren > 0 && (
        <p className="text-[11px] text-muted-foreground mb-2">
          외 {extraChildren}명은 표시되지 않습니다
        </p>
      )}

      {displayGroups.length >= 2 && (
        <div className="flex mb-0.5">
          <div className="w-14 flex-shrink-0" />
          {displayGroups.map(([childName, _], i) => {
            const color = childColorMap.get(childName) ?? CHILD_COLORS[0];
            return (
              <div
                key={childName}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1 bg-muted/10 ${i === 0 && displayGroups.length >= 2 ? "border-r border-border/30" : ""}`}
              >
                <span className={`w-2 h-2 rounded-full ${color.bg} flex-shrink-0`} />
                <span className="text-xs font-semibold text-foreground">{childName}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: 420 }} ref={scrollRef}>
        <div className="flex" style={{ height: TIMELINE_TOTAL_PX }}>

          <div className="w-14 flex-shrink-0 relative border-r border-border/20 bg-muted/10">
            {Array.from({ length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 }, (_, i) => TIMELINE_START_HOUR + i).map((h, i) => (
              <div
                key={h}
                className="absolute w-full pl-1 pr-0.5"
                style={{ top: (i / (TIMELINE_END_HOUR - TIMELINE_START_HOUR)) * TIMELINE_TOTAL_PX - 8 }}
              >
                <span className="text-[10px] text-muted-foreground leading-none">{formatHourLabel(h)}</span>
              </div>
            ))}
          </div>

          {displayGroups.length === 0 ? (
            <div className="flex-1 relative">
              {hourLines.map(i => (
                <div
                  key={i}
                  className="absolute w-full border-t border-border/20"
                  style={{ top: (i / (TIMELINE_END_HOUR - TIMELINE_START_HOUR)) * TIMELINE_TOTAL_PX }}
                />
              ))}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <CalendarDays className="w-8 h-8 text-muted-foreground/30 mx-auto mb-1" />
                  <p className="text-sm text-muted-foreground">이 날 일정이 없습니다</p>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="flex-1 grid"
              style={{ gridTemplateColumns: `repeat(${displayGroups.length}, 1fr)` }}
            >
              {displayGroups.map(([childName, items], colIdx) => {
                return (
                  <div
                    key={childName}
                    className={`relative ${colIdx < displayGroups.length - 1 ? "border-r border-border/30" : ""}`}
                  >
                      {hourLines.map(i => (
                        <div
                          key={i}
                          className="absolute w-full border-t border-border/30"
                          style={{ top: (i / (TIMELINE_END_HOUR - TIMELINE_START_HOUR)) * TIMELINE_TOTAL_PX }}
                        />
                      ))}

                      {items.map((item, idx) => {
                        const top = timeToTopPx(item.startTime);
                        const height = durationToHeightPx(item.startTime, item.endTime);
                        const { bg, text } = typeColorCls(item.type);
                        return (
                          <div
                            key={`${item.timeSlotId}-${idx}`}
                            className={`absolute left-0.5 right-0.5 ${bg} rounded-md px-1.5 py-0.5 overflow-hidden ${item.hasWarning ? "ring-1 ring-orange-400 ring-inset" : ""}`}
                            style={{ top, height: Math.max(24, height) }}
                          >
                            <p className={`text-[10px] font-semibold ${text} leading-tight truncate`}>
                              {item.placeName}
                            </p>
                            <p className={`text-[10px] ${text} opacity-75 leading-tight`}>
                              {item.startTime}
                            </p>
                            {item.hasWarning && height >= 52 && (
                              <p className="text-[10px] text-orange-200 leading-tight truncate">
                                ⚠ {item.warningMessage}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
  );
}

function MonthView({ selectedDate, onSelectDate, dayMap, year, month, childColorMap }: {
  selectedDate: string;
  onSelectDate: (d: string) => void;
  dayMap: Map<string, PlannerDay>;
  year: number;
  month: number;
  childColorMap: Map<string, { bg: string; text: string }>;
}) {
  const todayStr = formatDateStr(new Date());
  const calendarDates = useMemo(() => getMonthCalendarDates(year, month), [year, month]);
  const weeks: Date[][] = [];
  for (let i = 0; i < calendarDates.length; i += 7) {
    weeks.push(calendarDates.slice(i, i + 7));
  }

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((name, i) => (
          <div key={name} className={`text-center text-xs font-medium py-1 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"}`}>
            {name}
          </div>
        ))}
      </div>
      <div className="space-y-0">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((date) => {
              const dateStr = formatDateStr(date);
              const isCurrentMonth = date.getMonth() === month;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const dow = date.getDay();
              const day = dayMap.get(dateStr);
              const items = day?.items || [];

              return (
                <button
                  key={dateStr}
                  onClick={() => onSelectDate(dateStr)}
                  className={`
                    flex flex-col items-center py-1.5 min-h-[4rem] transition-colors rounded-md
                    ${isSelected ? "bg-primary/10" : "hover:bg-muted/50"}
                  `}
                >
                  <span className={`
                    text-sm leading-none
                    ${!isCurrentMonth ? "text-muted-foreground/40" : ""}
                    ${isCurrentMonth && dow === 0 ? "text-red-500" : ""}
                    ${isCurrentMonth && dow === 6 ? "text-blue-500" : ""}
                    ${isCurrentMonth && dow > 0 && dow < 6 ? "text-foreground" : ""}
                    ${isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center font-bold" : ""}
                    ${isSelected && !isToday ? "font-bold" : ""}
                  `}>
                    {date.getDate()}
                  </span>
                  {isCurrentMonth && <EventBars items={items} childColorMap={childColorMap} maxBars={2} />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekView({ selectedDate, onSelectDate, dayMap, weekStart, childColorMap }: {
  selectedDate: string;
  onSelectDate: (d: string) => void;
  dayMap: Map<string, PlannerDay>;
  weekStart: Date;
  childColorMap: Map<string, { bg: string; text: string }>;
}) {
  const todayStr = formatDateStr(new Date());
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="grid grid-cols-7 gap-0">
      {weekDates.map((date) => {
        const dateStr = formatDateStr(date);
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === selectedDate;
        const dow = date.getDay();
        const day = dayMap.get(dateStr);
        const items = day?.items || [];

        return (
          <button
            key={dateStr}
            onClick={() => onSelectDate(dateStr)}
            className={`
              flex flex-col items-center py-2 transition-colors rounded-lg
              ${isSelected ? "bg-primary/10" : "hover:bg-muted/50"}
            `}
          >
            <span className={`text-[10px] mb-1 ${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-muted-foreground"}`}>
              {DAY_NAMES[dow]}
            </span>
            <span className={`
              text-sm leading-none
              ${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-foreground"}
              ${isToday ? "bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center font-bold" : ""}
              ${isSelected && !isToday ? "font-bold" : ""}
            `}>
              {date.getDate()}
            </span>
            <EventBars items={items} childColorMap={childColorMap} maxBars={3} />
          </button>
        );
      })}
    </div>
  );
}

export default function PlannerPage() {
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(formatDateStr(today));
  const [monthYear, setMonthYear] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [addScheduleOpen, setAddScheduleOpen] = useState(false);

  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const { data: children } = useGetChildren({ query: { queryKey: getGetChildrenQueryKey() } });
  const childColorMap = useMemo(
    () => buildChildColorMap((children as { name: string }[] | undefined) ?? []),
    [children]
  );

  const weekStartForWeekView = useMemo(() => {
    const d = new Date(selectedDate + "T00:00:00");
    return getWeekStartDate(d);
  }, [selectedDate]);

  const monthWeekStarts = useMemo(() => getMonthWeekStarts(monthYear.year, monthYear.month), [monthYear.year, monthYear.month]);

  const monthData = useMultiWeekPlanner(viewMode === "month" ? monthWeekStarts : []);
  const weekData = useSingleWeekPlanner(viewMode === "week" ? formatDateStr(weekStartForWeekView) : "");

  const dayMap = viewMode === "month" ? monthData.dayMap : weekData.dayMap;
  const isLoading = viewMode === "month" ? monthData.isLoading : weekData.isLoading;

  const selectedDay = dayMap.get(selectedDate);

  const handlePrevMonth = () => {
    setMonthYear(prev => {
      const newMonth = prev.month === 0 ? 11 : prev.month - 1;
      const newYear = prev.month === 0 ? prev.year - 1 : prev.year;
      const selDay = new Date(selectedDate + "T00:00:00");
      const maxDay = new Date(newYear, newMonth + 1, 0).getDate();
      const clampedDay = Math.min(selDay.getDate(), maxDay);
      setSelectedDate(formatDateStr(new Date(newYear, newMonth, clampedDay)));
      return { year: newYear, month: newMonth };
    });
  };

  const handleNextMonth = () => {
    setMonthYear(prev => {
      const newMonth = prev.month === 11 ? 0 : prev.month + 1;
      const newYear = prev.month === 11 ? prev.year + 1 : prev.year;
      const selDay = new Date(selectedDate + "T00:00:00");
      const maxDay = new Date(newYear, newMonth + 1, 0).getDate();
      const clampedDay = Math.min(selDay.getDate(), maxDay);
      setSelectedDate(formatDateStr(new Date(newYear, newMonth, clampedDay)));
      return { year: newYear, month: newMonth };
    });
  };

  const handlePrevWeek = () => {
    setSelectedDate(prev => {
      const d = new Date(prev + "T00:00:00");
      d.setDate(d.getDate() - 7);
      return formatDateStr(d);
    });
  };

  const handleNextWeek = () => {
    setSelectedDate(prev => {
      const d = new Date(prev + "T00:00:00");
      d.setDate(d.getDate() + 7);
      return formatDateStr(d);
    });
  };

  const handleToday = () => {
    const now = new Date();
    const todayStr = formatDateStr(now);
    setSelectedDate(todayStr);
    setMonthYear({ year: now.getFullYear(), month: now.getMonth() });
  };

  const handleThisWeek = () => {
    setSelectedDate(formatDateStr(new Date()));
  };

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    if (viewMode === "month") {
      const d = new Date(dateStr + "T00:00:00");
      if (d.getMonth() !== monthYear.month || d.getFullYear() !== monthYear.year) {
        setMonthYear({ year: d.getFullYear(), month: d.getMonth() });
      }
    }
  };

  const monthLabel = `${monthYear.year}년 ${monthYear.month + 1}월`;
  const weekLabel = (() => {
    const end = new Date(weekStartForWeekView);
    end.setDate(end.getDate() + 6);
    const sm = weekStartForWeekView.getMonth() + 1;
    const sd = weekStartForWeekView.getDate();
    const em = end.getMonth() + 1;
    const ed = end.getDate();
    return `${sm}/${sd} ~ ${em}/${ed}`;
  })();

  return (
    <div className="space-y-0" data-testid="planner-page">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === "month" ? "default" : "ghost"}
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => {
              const d = new Date(selectedDate + "T00:00:00");
              setMonthYear({ year: d.getFullYear(), month: d.getMonth() });
              setViewMode("month");
            }}
            data-testid="button-month-view"
          >
            <Calendar className="w-3.5 h-3.5" />
            월
          </Button>
          <Button
            variant={viewMode === "week" ? "default" : "ghost"}
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => setViewMode("week")}
            data-testid="button-week-view"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            주
          </Button>
        </div>
        {viewMode === "month" ? (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleToday} data-testid="button-today">
            오늘
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleThisWeek} data-testid="button-this-week">
            이번 주
          </Button>
        )}
      </div>

      {viewMode === "month" ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevMonth} data-testid="button-prev-month">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-lg font-bold text-foreground">{monthLabel}</h1>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextMonth} data-testid="button-next-month">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {isLoading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : (
            <MonthView selectedDate={selectedDate} onSelectDate={handleSelectDate} dayMap={dayMap} year={monthYear.year} month={monthYear.month} childColorMap={childColorMap} />
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevWeek} data-testid="button-prev-week">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-lg font-bold text-foreground">{weekLabel}</h1>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextWeek} data-testid="button-next-week">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {isLoading ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : (
            <WeekView
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              dayMap={dayMap}
              weekStart={weekStartForWeekView}
              childColorMap={childColorMap}
            />
          )}
        </div>
      )}

      <div className="border-t pt-3 mt-2">
        {isLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : (
          <DayTimelineSection
            date={selectedDate}
            day={selectedDay}
            childColorMap={childColorMap}
            addButton={isOwner ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => setAddScheduleOpen(true)}
                data-testid="button-add-schedule-planner"
              >
                <Plus className="w-3 h-3" />
                일정 추가
              </Button>
            ) : undefined}
          />
        )}
      </div>

      {isOwner && (
        <AddScheduleDialog
          open={addScheduleOpen}
          onOpenChange={setAddScheduleOpen}
          defaultDayOfWeek={new Date(selectedDate + "T00:00:00").getDay()}
          weekStarts={[
            formatDateStr(weekStartForWeekView),
            ...monthWeekStarts,
          ].filter(Boolean)}
        />
      )}
    </div>
  );
}
