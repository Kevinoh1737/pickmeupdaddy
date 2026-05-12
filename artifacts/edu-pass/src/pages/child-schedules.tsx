import React, { useState } from "react";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import {
  useGetFamilyPlaces,
  getGetFamilyPlacesQueryKey,
  useGetTimeSlots,
  getGetTimeSlotsQueryKey,
  useCreateTimeSlot,
  useDeleteTimeSlot,
  useUpdateTimeSlot,
  useGetFamilyMembers,
  getGetFamilyMembersQueryKey,
  useGetChildren,
  getGetChildrenQueryKey,
} from "@workspace/api-client-react";
import type { Place, TimeSlot, Child, FamilyMember } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ArrowLeft, GraduationCap, BookOpen, Clock, Building2, Bus, MapPin, User, Home } from "lucide-react";

function detectPlaceType(name: string): "school" | "academy" | "care" {
  const schoolKeywords = ["학교", "초등", "중학", "고등", "elementary", "middle", "high school"];
  const careKeywords = ["돌봄", "방과후", "care"];
  const lower = name.toLowerCase();
  if (schoolKeywords.some(kw => lower.includes(kw))) return "school";
  if (careKeywords.some(kw => lower.includes(kw))) return "care";
  return "academy";
}

const ACADEMY_HOURS = Array.from({ length: 10 }, (_, i) => i + 13);
const SCHOOL_HOURS = Array.from({ length: 16 }, (_, i) => i + 7);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const DURATION_OPTIONS = [
  { value: 30, label: "30분" },
  { value: 60, label: "1시간" },
  { value: 90, label: "1시간 30분" },
  { value: 120, label: "2시간" },
  { value: 150, label: "2시간 30분" },
  { value: 180, label: "3시간" },
];

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function diffMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function nearestDuration(minutes: number): number {
  const valid = DURATION_OPTIONS.map(d => d.value);
  const clamped = Math.max(30, Math.min(180, minutes));
  return valid.reduce((prev, curr) => Math.abs(curr - clamped) < Math.abs(prev - clamped) ? curr : prev, 60);
}

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

const DAYS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" },
];

export default function ChildSchedulesPage() {
  const [, params] = useRoute("/children/:childId/schedules");
  const childId = params?.childId ? parseInt(params.childId, 10) : 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const { data: places, isLoading: placesLoading } = useGetFamilyPlaces({ query: { queryKey: getGetFamilyPlacesQueryKey() } });
  const { data: timeSlots, isLoading: slotsLoading } = useGetTimeSlots(childId, { query: { enabled: !!childId, queryKey: getGetTimeSlotsQueryKey(childId) } });
  const { data: children } = useGetChildren({ query: { queryKey: getGetChildrenQueryKey() } });
  const { data: members } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });

  const createSlotMutation = useCreateTimeSlot();
  const deleteSlotMutation = useDeleteTimeSlot();
  const updateSlotMutation = useUpdateTimeSlot();

  const childrenList = (children || []) as Child[];
  const child = childrenList.find(c => c.id === childId);
  const placesList = (places || []) as Place[];
  const slotsList = (timeSlots || []) as TimeSlot[];

  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);

  const [deleteSlotDialogOpen, setDeleteSlotDialogOpen] = useState(false);
  const [deletingSlot, setDeletingSlot] = useState<TimeSlot | null>(null);

  const [editSlotDialogOpen, setEditSlotDialogOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null);
  const [editSlotForm, setEditSlotForm] = useState({
    startTime: "09:00",
    endTime: "10:00",
    durationMinutes: 60,
    primaryGuardianId: null as number | null,
    backupGuardianId: null as number | null,
    mobilityType: null as string | null,
    shuttleArrivalTime: null as string | null,
    parentAccompany: false,
    dropOffType: null as string | null,
    dropOffGuardianId: null as number | null,
    pickUpType: null as string | null,
    pickUpShuttleArrivalTime: null as string | null,
  });

  const [slotForm, setSlotForm] = useState({
    placeId: 0,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "10:00",
    durationMinutes: 60,
    primaryGuardianId: null as number | null,
    backupGuardianId: null as number | null,
    mobilityType: null as string | null,
    shuttleArrivalTime: null as string | null,
    parentAccompany: false,
    dropOffType: null as string | null,
    dropOffGuardianId: null as number | null,
    pickUpType: null as string | null,
    pickUpShuttleArrivalTime: null as string | null,
  });

  const [placeBatchDialogOpen, setPlaceBatchDialogOpen] = useState(false);
  const [placeBatchForm, setPlaceBatchForm] = useState({
    placeId: 0,
    placeType: "academy" as "school" | "academy" | "care",
    days: [] as number[],
    startTime: "13:00",
    endTime: "14:00",
    durationMinutes: 60,
    dropOffType: null as string | null,
    dropOffGuardianId: null as number | null,
    pickUpType: null as string | null,
    pickUpShuttleArrivalTime: null as string | null,
    primaryGuardianId: null as number | null,
    backupGuardianId: null as number | null,
  });
  const [placeBatchPending, setPlaceBatchPending] = useState(false);

  const selectedPlace = placesList.find(p => p.id === slotForm.placeId);
  const isSchoolPlace = selectedPlace?.type === "school";
  const isCarePlace = selectedPlace?.type === "care";
  const isAcademyPlace = selectedPlace?.type === "academy";

  const carePrerequisiteMet = (() => {
    if (!isCarePlace) return true;
    return slotsList.some(
      s => s.dayOfWeek === slotForm.dayOfWeek && (s.placeType === "school" || s.placeType === "academy")
    );
  })();

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

  const resetSlotForm = () => setSlotForm({ placeId: 0, dayOfWeek: selectedDay, startTime: "09:00", endTime: "10:00", durationMinutes: 60, primaryGuardianId: null, backupGuardianId: null, mobilityType: null, shuttleArrivalTime: null, parentAccompany: false, dropOffType: null, dropOffGuardianId: null, pickUpType: null, pickUpShuttleArrivalTime: null });

  const handleCreateSlot = () => {
    if (!slotForm.placeId) {
      toast({ title: "장소를 선택해주세요", variant: "destructive" });
      return;
    }
    const computedEndTime = (isSchoolPlace || isCarePlace)
      ? slotForm.endTime
      : addMinutesToTime(slotForm.startTime, slotForm.durationMinutes);
    createSlotMutation.mutate(
      {
        childId,
        data: {
          placeId: slotForm.placeId,
          dayOfWeek: slotForm.dayOfWeek,
          startTime: slotForm.startTime,
          endTime: computedEndTime,
          primaryGuardianId: slotForm.primaryGuardianId,
          backupGuardianId: slotForm.backupGuardianId,
          dropOffType: slotForm.dropOffType as "shuttle" | "parent" | null,
          dropOffGuardianId: slotForm.dropOffType === "parent" ? slotForm.dropOffGuardianId : undefined,
          pickUpType: slotForm.pickUpType as "shuttle" | "parent" | null,
          pickUpShuttleArrivalTime: slotForm.pickUpType === "shuttle" ? slotForm.pickUpShuttleArrivalTime : undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTimeSlotsQueryKey(childId) });
          resetSlotForm();
          setSlotDialogOpen(false);
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

  const handlePlaceBatch = async () => {
    if (placeBatchForm.days.length === 0) {
      toast({ title: "요일을 선택해주세요", variant: "destructive" });
      return;
    }
    setPlaceBatchPending(true);
    const endTime = placeBatchForm.placeType === "school"
      ? placeBatchForm.endTime
      : addMinutesToTime(placeBatchForm.startTime, placeBatchForm.durationMinutes);
    const results = await Promise.allSettled(
      placeBatchForm.days.map(day =>
        createSlotMutation.mutateAsync({
          childId,
          data: {
            placeId: placeBatchForm.placeId,
            dayOfWeek: day,
            startTime: placeBatchForm.startTime,
            endTime,
            primaryGuardianId: placeBatchForm.primaryGuardianId,
            backupGuardianId: placeBatchForm.backupGuardianId,
            dropOffType: placeBatchForm.dropOffType as "shuttle" | "parent" | null,
            dropOffGuardianId: placeBatchForm.dropOffType === "parent" ? placeBatchForm.dropOffGuardianId : undefined,
            pickUpType: placeBatchForm.pickUpType as "shuttle" | "parent" | null,
            pickUpShuttleArrivalTime: placeBatchForm.pickUpType === "shuttle" ? placeBatchForm.pickUpShuttleArrivalTime : undefined,
          },
        })
      )
    );
    setPlaceBatchPending(false);
    const dayOrder = [1, 2, 3, 4, 5, 6, 0];
    const succeededDays = placeBatchForm.days
      .filter((_, i) => results[i].status === "fulfilled")
      .sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
    const failedDays = placeBatchForm.days
      .filter((_, i) => results[i].status === "rejected")
      .sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
    if (succeededDays.length > 0) {
      queryClient.invalidateQueries({ queryKey: getGetTimeSlotsQueryKey(childId) });
      const succeededLabels = succeededDays.map(d => DAYS.find(x => x.value === d)?.label).join("·");
      toast({ title: `${succeededLabels} ${succeededDays.length}개 일정이 추가됐어요` });
    }
    if (failedDays.length > 0) {
      const failedLabels = failedDays.map(d => DAYS.find(x => x.value === d)?.label).join("·");
      toast({ title: `${failedLabels} 일정 추가 실패`, variant: "destructive" });
    }
    if (succeededDays.length > 0) {
      setPlaceBatchDialogOpen(false);
      setPlaceBatchForm({ placeId: 0, placeType: "academy", days: [], startTime: "13:00", endTime: "14:00", durationMinutes: 60, dropOffType: null, dropOffGuardianId: null, pickUpType: null, pickUpShuttleArrivalTime: null, primaryGuardianId: null, backupGuardianId: null });
    }
    if (succeededDays.length === 0) {
      toast({ title: "일정 추가에 실패했습니다", variant: "destructive" });
    }
  };

  const handleDeleteSlot = (slot: TimeSlot) => {
    setDeletingSlot(slot);
    setDeleteSlotDialogOpen(true);
  };

  const confirmDeleteSlot = (deleteAll: boolean) => {
    if (!deletingSlot) return;
    deleteSlotMutation.mutate(
      { id: deletingSlot.id, params: deleteAll ? { deleteAll: true } : undefined },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTimeSlotsQueryKey(childId) });
          toast({ title: deleteAll ? "이후 동일 학원 일정이 모두 삭제되었습니다" : "일정이 삭제되었습니다" });
          setDeleteSlotDialogOpen(false);
          setDeletingSlot(null);
        },
      }
    );
  };

  const handleEditSlot = (slot: TimeSlot) => {
    setEditingSlot(slot);
    const diffMin = diffMinutes(slot.startTime, slot.endTime);
    setEditSlotForm({
      startTime: slot.startTime,
      endTime: slot.endTime,
      durationMinutes: nearestDuration(diffMin),
      primaryGuardianId: slot.primaryGuardianId ?? null,
      backupGuardianId: slot.backupGuardianId ?? null,
      mobilityType: slot.mobilityType ?? null,
      shuttleArrivalTime: slot.shuttleArrivalTime ?? null,
      parentAccompany: slot.parentAccompany ?? false,
      dropOffType: slot.dropOffType ?? null,
      dropOffGuardianId: slot.dropOffGuardianId ?? null,
      pickUpType: slot.pickUpType ?? null,
      pickUpShuttleArrivalTime: slot.pickUpShuttleArrivalTime ?? null,
    });
    setEditSlotDialogOpen(true);
  };

  const handleUpdateSlot = () => {
    if (!editingSlot) return;
    const effectiveStartTime = editSchoolStartTimeLocked && editExistingSchoolStartTime ? editExistingSchoolStartTime : editSlotForm.startTime;
    const computedEditEndTime = isEditingSchoolPlace
      ? editSlotForm.endTime
      : addMinutesToTime(effectiveStartTime, editSlotForm.durationMinutes);
    updateSlotMutation.mutate(
      {
        id: editingSlot.id,
        data: {
          startTime: effectiveStartTime,
          endTime: computedEditEndTime,
          primaryGuardianId: editSlotForm.primaryGuardianId,
          backupGuardianId: editSlotForm.backupGuardianId,
          dropOffType: editSlotForm.dropOffType as "shuttle" | "parent" | null,
          dropOffGuardianId: editSlotForm.dropOffType === "parent" ? editSlotForm.dropOffGuardianId : undefined,
          pickUpType: editSlotForm.pickUpType as "shuttle" | "parent" | null,
          pickUpShuttleArrivalTime: editSlotForm.pickUpType === "shuttle" ? editSlotForm.pickUpShuttleArrivalTime : undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTimeSlotsQueryKey(childId) });
          setEditSlotDialogOpen(false);
          setEditingSlot(null);
          toast({ title: "일정이 수정되었습니다" });
        },
        onError: (err: unknown) => {
          const errorObj = err as { data?: { error?: string }; message?: string };
          const errorMsg = errorObj?.data?.error || errorObj?.message || "일정 수정에 실패했습니다";
          toast({ title: errorMsg, variant: "destructive" });
        },
      }
    );
  };

  const editingSlotPlace = editingSlot ? placesList.find(p => p.id === editingSlot.placeId) : null;
  const isEditingSchoolPlace = editingSlotPlace?.type === "school";
  const isEditingCarePlace = editingSlotPlace?.type === "care";

  const editSchoolStartTimeLocked = (() => {
    if (!isEditingSchoolPlace || !editingSlot) return false;
    const otherSchoolSlot = slotsList.find(s => s.placeId === editingSlot.placeId && s.id !== editingSlot.id);
    return !!otherSchoolSlot;
  })();

  const editExistingSchoolStartTime = (() => {
    if (!editSchoolStartTimeLocked || !editingSlot) return null;
    const otherSchoolSlot = slotsList.find(s => s.placeId === editingSlot.placeId && s.id !== editingSlot.id);
    return otherSchoolSlot?.startTime || null;
  })();

  const daySlotsMap = new Map<number, TimeSlot[]>();
  DAYS.forEach(d => daySlotsMap.set(d.value, []));
  slotsList.forEach(s => {
    const arr = daySlotsMap.get(s.dayOfWeek) || [];
    arr.push(s);
    daySlotsMap.set(s.dayOfWeek, arr);
  });

  const typeIcon = (type: string) => {
    if (type === "school") return <GraduationCap className="w-4 h-4 text-blue-600" />;
    if (type === "care") return <Building2 className="w-4 h-4 text-purple-600" />;
    if (type === "home") return <Home className="w-4 h-4 text-yellow-600" />;
    return <BookOpen className="w-4 h-4 text-green-600" />;
  };

  const typeBg = (type: string) => {
    if (type === "school") return "bg-blue-100";
    if (type === "care") return "bg-purple-100";
    if (type === "home") return "bg-yellow-100";
    return "bg-green-100";
  };

  const typeLabel = (type: string) => {
    if (type === "school") return "학교";
    if (type === "care") return "돌봄교실";
    if (type === "home") return "집";
    return "학원";
  };

  return (
    <div className="space-y-6" data-testid="child-schedules-page">
      <div className="flex items-center gap-3">
        <Link href="/children">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">{child?.name || "아이"}의 일정</h1>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground">학교/학원 관리</h2>
        </div>

        {placesLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : placesList.length ? (
          <div className="space-y-2">
            {placesList.map(p => (
              <Card key={p.id} data-testid={`card-place-${p.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${typeBg(p.type)}`}>
                        {typeIcon(p.type)}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{p.placeName}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{p.address?.substring(0, 20)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">{typeLabel(p.type)}</Badge>
                      {isOwner && (p.type === "academy" || p.type === "school" || p.type === "care") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 px-2"
                          onClick={() => {
                            if (p.type === "care") {
                              const careAutoStart = (() => {
                                const daySlotsForDay = slotsList.filter(s => s.dayOfWeek === selectedDay);
                                if (daySlotsForDay.length === 0) return "13:00";
                                const latest = daySlotsForDay.reduce((prev, curr) => {
                                  const [ph, pm] = prev.endTime.split(":").map(Number);
                                  const [ch, cm] = curr.endTime.split(":").map(Number);
                                  return (ch * 60 + cm) > (ph * 60 + pm) ? curr : prev;
                                });
                                return latest.endTime;
                              })();
                              setSlotForm(f => ({ ...f, placeId: p.id, dayOfWeek: selectedDay, startTime: careAutoStart, endTime: addMinutesToTime(careAutoStart, 60), dropOffType: null, pickUpType: null, pickUpShuttleArrivalTime: null, primaryGuardianId: null, backupGuardianId: null }));
                              setSlotDialogOpen(true);
                            } else if (p.type === "school") {
                              const existingSlot = slotsList.find(s => s.placeId === p.id);
                              const prefillStart = existingSlot?.startTime || "08:30";
                              setPlaceBatchForm({ placeId: p.id, placeType: "school", days: [], startTime: prefillStart, endTime: "13:00", durationMinutes: 60, dropOffType: null, dropOffGuardianId: null, pickUpType: null, pickUpShuttleArrivalTime: null, primaryGuardianId: null, backupGuardianId: null });
                              setPlaceBatchDialogOpen(true);
                            } else {
                              setPlaceBatchForm({ placeId: p.id, placeType: "academy", days: [], startTime: "13:00", endTime: "14:00", durationMinutes: 60, dropOffType: null, dropOffGuardianId: null, pickUpType: null, pickUpShuttleArrivalTime: null, primaryGuardianId: null, backupGuardianId: null });
                              setPlaceBatchDialogOpen(true);
                            }
                          }}
                          data-testid={`button-batch-schedule-${p.id}`}
                        >
                          <Plus className="w-3 h-3" />
                          일정 추가
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-6 text-center">
              <MapPin className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">등록된 장소가 없습니다</p>
              <p className="text-xs text-muted-foreground mt-1">설정 &gt; 장소 관리에서 추가할 수 있습니다</p>
            </CardContent>
          </Card>
        )}
      </div>


      <Dialog open={slotDialogOpen} onOpenChange={(open) => {
            setSlotDialogOpen(open);
            if (open) {
              const isWeekend = selectedDay === 6 || selectedDay === 0;
              const availablePlaces = isWeekend ? placesList.filter(p => p.type !== "school" && p.type !== "home") : placesList.filter(p => p.type !== "home");
              const firstPlace = availablePlaces.length > 0 ? availablePlaces[0] : null;
              const isSchool = firstPlace && firstPlace.type === "school";
              const existingSlotForFirst = isSchool ? slotsList.find(s => s.placeId === firstPlace!.id) : null;
              const defaultStart = isSchool
                ? (existingSlotForFirst ? existingSlotForFirst.startTime : "08:30")
                : (isWeekend ? "09:00" : "13:00");
              const defaultEnd = isSchool ? "13:00" : (isWeekend ? "10:00" : "14:00");
              setSlotForm(f => ({ ...f, dayOfWeek: selectedDay, placeId: firstPlace?.id || 0, startTime: defaultStart, endTime: defaultEnd, parentAccompany: false, shuttleArrivalTime: null, dropOffType: null, pickUpType: null, pickUpShuttleArrivalTime: null }));
            }
          }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>새 일정</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>요일 *</Label>
                  <Select value={String(slotForm.dayOfWeek)} onValueChange={v => {
                    const newDay = parseInt(v);
                    const isWeekend = newDay === 6 || newDay === 0;
                    setSlotForm(f => {
                      const currentPlace = placesList.find(p => p.id === f.placeId);
                      const needsPlaceReset = isWeekend && currentPlace?.type === "school";
                      const availablePlaces = isWeekend ? placesList.filter(p => p.type !== "school" && p.type !== "home") : placesList.filter(p => p.type !== "home");
                      const newPlaceId = needsPlaceReset ? (availablePlaces[0]?.id || 0) : f.placeId;
                      const resolvedPlace = placesList.find(p => p.id === newPlaceId);
                      const isNonSchool = resolvedPlace && resolvedPlace.type !== "school";
                      let newStart = f.startTime;
                      let newEnd = f.endTime;
                      if (resolvedPlace?.type === "care") {
                        const daySlotsForCare = slotsList.filter(s => s.dayOfWeek === newDay);
                        if (daySlotsForCare.length > 0) {
                          const latest = daySlotsForCare.reduce((prev, curr) => {
                            const [ph, pm] = prev.endTime.split(":").map(Number);
                            const [ch, cm] = curr.endTime.split(":").map(Number);
                            return (ch * 60 + cm) > (ph * 60 + pm) ? curr : prev;
                          });
                          newStart = latest.endTime;
                          newEnd = addMinutesToTime(latest.endTime, 60);
                        }
                      } else if (isNonSchool) {
                        if (needsPlaceReset) {
                          newStart = isWeekend ? "09:00" : "13:00";
                          newEnd = isWeekend ? "10:00" : "14:00";
                        } else if (!isWeekend) {
                          const startHour = parseInt(f.startTime.split(":")[0]);
                          const endHour = parseInt(f.endTime.split(":")[0]);
                          if (startHour < 13) newStart = "13:00";
                          if (endHour < 13) newEnd = "14:00";
                        }
                      }
                      return { ...f, dayOfWeek: newDay, placeId: newPlaceId, startTime: newStart, endTime: newEnd };
                    });
                  }}>
                    <SelectTrigger data-testid="select-day">
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
                  {(() => {
                    const isWeekend = slotForm.dayOfWeek === 6 || slotForm.dayOfWeek === 0;
                    const availablePlaces = isWeekend ? placesList.filter(p => p.type !== "school" && p.type !== "home") : placesList.filter(p => p.type !== "home");
                    return (
                      <Select value={String(slotForm.placeId || "")} onValueChange={v => {
                        const newPlaceId = parseInt(v);
                        const newPlace = placesList.find(p => p.id === newPlaceId);
                        const existingSlotForSchool = newPlace?.type === "school"
                          ? slotsList.find(s => s.placeId === newPlaceId)
                          : null;
                        const careAutoStart = (() => {
                          if (newPlace?.type !== "care") return null;
                          const daySlotsForCare = slotsList.filter(s => s.dayOfWeek === slotForm.dayOfWeek);
                          if (daySlotsForCare.length === 0) return null;
                          const latest = daySlotsForCare.reduce((prev, curr) => {
                            const [ph, pm] = prev.endTime.split(":").map(Number);
                            const [ch, cm] = curr.endTime.split(":").map(Number);
                            return (ch * 60 + cm) > (ph * 60 + pm) ? curr : prev;
                          });
                          return latest.endTime;
                        })();
                        setSlotForm(f => {
                          const newStart = careAutoStart
                            ? careAutoStart
                            : existingSlotForSchool
                            ? existingSlotForSchool.startTime
                            : (newPlace?.type !== "school" ? (isWeekend ? "09:00" : "13:00") : "08:30");
                          const newEnd = careAutoStart
                            ? addMinutesToTime(careAutoStart, 60)
                            : newPlace?.type !== "school" ? (isWeekend ? "10:00" : "14:00") : f.endTime;
                          return {
                            ...f,
                            placeId: newPlaceId,
                            startTime: newStart,
                            endTime: newEnd,
                            parentAccompany: false,
                          };
                        });
                      }}>
                        <SelectTrigger data-testid="select-place">
                          <SelectValue placeholder="장소를 선택하세요" />
                        </SelectTrigger>
                        <SelectContent>
                          {availablePlaces.map(p => (
                            <SelectItem key={p.id} value={String(p.id)}>{p.placeName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </div>

                {isSchoolPlace ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TimeDropdown
                      label="등교 시간"
                      labelExtra={existingSchoolStartTime ? <span className="text-xs text-muted-foreground ml-1">(기존 등교 시간 자동 적용, 변경 가능)</span> : <span className="text-xs text-muted-foreground ml-1">(첫 등교 시간 입력)</span>}
                      hour={parseInt(slotForm.startTime.split(":")[0]) || 8}
                      minute={parseInt(slotForm.startTime.split(":")[1]) || 0}
                      onHourChange={h => setSlotForm(f => ({ ...f, startTime: `${String(h).padStart(2, "0")}:${f.startTime.split(":")[1] || "00"}` }))}
                      onMinuteChange={m => setSlotForm(f => ({ ...f, startTime: `${f.startTime.split(":")[0] || "08"}:${String(m).padStart(2, "0")}` }))}
                      hours={SCHOOL_HOURS}
                      testId="select-start-time"
                    />
                    <TimeDropdown
                      label="하교 시간"
                      hour={parseInt(slotForm.endTime.split(":")[0]) || 14}
                      minute={parseInt(slotForm.endTime.split(":")[1]) || 0}
                      onHourChange={h => setSlotForm(f => ({ ...f, endTime: `${String(h).padStart(2, "0")}:${f.endTime.split(":")[1] || "00"}` }))}
                      onMinuteChange={m => setSlotForm(f => ({ ...f, endTime: `${f.endTime.split(":")[0] || "14"}:${String(m).padStart(2, "0")}` }))}
                      hours={SCHOOL_HOURS}
                      testId="select-end-time"
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
                      testId="select-start-time"
                    />
                    <TimeDropdown
                      label="종료 시간"
                      hour={parseInt(slotForm.endTime.split(":")[0]) || 14}
                      minute={parseInt(slotForm.endTime.split(":")[1]) || 0}
                      onHourChange={h => setSlotForm(f => ({ ...f, endTime: `${String(h).padStart(2, "0")}:${f.endTime.split(":")[1] || "00"}` }))}
                      onMinuteChange={m => setSlotForm(f => ({ ...f, endTime: `${f.endTime.split(":")[0] || "14"}:${String(m).padStart(2, "0")}` }))}
                      hours={SCHOOL_HOURS}
                      minuteOptions={MINUTES}
                      testId="select-end-time"
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
                      hours={(slotForm.dayOfWeek === 6 || slotForm.dayOfWeek === 0) ? SCHOOL_HOURS : ACADEMY_HOURS}
                      testId="select-start-time"
                    />
                    <div className="space-y-2">
                      <Label>수업 길이</Label>
                      <Select value={String(slotForm.durationMinutes)} onValueChange={v => setSlotForm(f => ({ ...f, durationMinutes: parseInt(v) }))} data-testid="select-duration">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DURATION_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {isCarePlace && !carePrerequisiteMet && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    이 요일에 먼저 학교 또는 학원 일정을 입력해주세요
                  </div>
                )}

                {isAcademyPlace && !academyPrerequisiteMet && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    학원 일정은 학교 일정이 등록된 요일에만 추가할 수 있습니다
                  </div>
                )}

                <div className="space-y-2">
                  <Label>데려다 주기 (등원)</Label>
                  <Select value={slotForm.dropOffType || "none"} onValueChange={v => setSlotForm(f => ({ ...f, dropOffType: v === "none" ? null : v, dropOffGuardianId: v !== "parent" ? null : f.dropOffGuardianId }))}>
                    <SelectTrigger data-testid="select-drop-off">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">미설정</SelectItem>
                      {!isCarePlace && <SelectItem value="shuttle">셔틀</SelectItem>}
                      <SelectItem value="parent">부모</SelectItem>
                    </SelectContent>
                  </Select>
                  {slotForm.dropOffType === "parent" && (() => {
                    const membersList = (members || []) as FamilyMember[];
                    if (membersList.length === 0) return null;
                    return (
                      <Select value={String(slotForm.dropOffGuardianId || "none")} onValueChange={v => setSlotForm(f => ({ ...f, dropOffGuardianId: v === "none" ? null : parseInt(v) }))}>
                        <SelectTrigger data-testid="select-drop-off-guardian">
                          <SelectValue placeholder="등원 담당 보호자 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">담당 보호자 미지정</SelectItem>
                          {membersList.map(m => (
                            <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </div>

                <div className="space-y-2">
                  <Label>데려오기 (하원)</Label>
                  <Select value={slotForm.pickUpType || "none"} onValueChange={v => setSlotForm(f => ({ ...f, pickUpType: v === "none" ? null : v, pickUpShuttleArrivalTime: v === "shuttle" ? (f.pickUpShuttleArrivalTime || "15:00") : null }))}>
                    <SelectTrigger data-testid="select-pick-up">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">미설정</SelectItem>
                      <SelectItem value="shuttle">셔틀</SelectItem>
                      <SelectItem value="parent">부모</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {slotForm.pickUpType === "shuttle" && (
                  <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Bus className="w-4 h-4 text-teal-600" />
                      <Label className="text-sm font-medium">셔틀 도착 시간 (하원)</Label>
                    </div>
                    <div className="flex gap-2">
                      <Select value={String(parseInt((slotForm.pickUpShuttleArrivalTime || "15:00").split(":")[0]))} onValueChange={v => setSlotForm(f => ({ ...f, pickUpShuttleArrivalTime: `${String(parseInt(v)).padStart(2, "0")}:${(f.pickUpShuttleArrivalTime || "15:00").split(":")[1]}` }))}>
                        <SelectTrigger className="flex-1" data-testid="select-pickup-shuttle-hour">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACADEMY_HOURS.map(h => (
                            <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}시</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={String(parseInt((slotForm.pickUpShuttleArrivalTime || "15:00").split(":")[1]))} onValueChange={v => setSlotForm(f => ({ ...f, pickUpShuttleArrivalTime: `${(f.pickUpShuttleArrivalTime || "15:00").split(":")[0]}:${String(parseInt(v)).padStart(2, "0")}` }))}>
                        <SelectTrigger className="flex-1" data-testid="select-pickup-shuttle-minute">
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

                {(() => {
                  const membersList = (members || []) as FamilyMember[];
                  if (membersList.length === 0) return null;
                  return (
                    <>
                      <div className="space-y-2">
                        <Label>주 보호자</Label>
                        <Select value={String(slotForm.primaryGuardianId || "none")} onValueChange={v => {
                            const newId = v === "none" ? null : parseInt(v);
                            setSlotForm(f => ({
                              ...f,
                              primaryGuardianId: newId,
                              backupGuardianId: newId !== null && f.backupGuardianId === newId ? null : f.backupGuardianId,
                            }));
                          }}>
                          <SelectTrigger data-testid="select-primary-guardian">
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
                          <SelectTrigger data-testid="select-backup-guardian">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">미지정</SelectItem>
                            {membersList.filter(m => m.id !== slotForm.primaryGuardianId).map(m => (
                              <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  );
                })()}

                <div className="flex gap-2 justify-end">
                  <DialogClose asChild>
                    <Button variant="outline">취소</Button>
                  </DialogClose>
                  <Button onClick={handleCreateSlot} disabled={createSlotMutation.isPending || (isCarePlace && !carePrerequisiteMet) || (isAcademyPlace && !academyPrerequisiteMet)} data-testid="button-confirm-add-timeslot">
                    {createSlotMutation.isPending ? "추가 중..." : "일정 추가"}
                  </Button>
                </div>
              </div>
            </DialogContent>
      </Dialog>

      <Dialog open={placeBatchDialogOpen} onOpenChange={setPlaceBatchDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{placeBatchForm.placeType === "school" ? "학교 일정 등록" : "학원 일정 등록"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {(() => {
              const batchPlace = placesList.find(p => p.id === placeBatchForm.placeId);
              return (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${typeBg(placeBatchForm.placeType)}`}>
                    {typeIcon(placeBatchForm.placeType)}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{batchPlace?.placeName || (placeBatchForm.placeType === "school" ? "학교" : "학원")}</p>
                    <p className="text-xs text-muted-foreground">{typeLabel(placeBatchForm.placeType)}</p>
                  </div>
                </div>
              );
            })()}

            {(() => {
              const isBatchAcademy = placeBatchForm.placeType === "academy";
              const schoolDaysSet = new Set(
                slotsList.filter(s => s.placeType === "school").map(s => s.dayOfWeek)
              );
              const daysWithoutSchool = isBatchAcademy
                ? DAYS.filter(d => !schoolDaysSet.has(d.value))
                : [];
              return (
                <>
                  {isBatchAcademy && daysWithoutSchool.length > 0 && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      학원 일정은 학교 일정이 등록된 요일에만 추가할 수 있습니다.
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>요일 선택 (다중)</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {DAYS.map(d => {
                        const alreadyHasSlot = slotsList.some(s => s.placeId === placeBatchForm.placeId && s.dayOfWeek === d.value);
                        const noSchoolForDay = isBatchAcademy && !schoolDaysSet.has(d.value);
                        const isDisabled = alreadyHasSlot || noSchoolForDay;
                        const isSelected = placeBatchForm.days.includes(d.value);
                        return (
                          <button
                            key={d.value}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => {
                              if (isDisabled) return;
                              setPlaceBatchForm(f => ({
                                ...f,
                                days: f.days.includes(d.value)
                                  ? f.days.filter(x => x !== d.value)
                                  : [...f.days, d.value],
                              }));
                            }}
                            className={`h-9 w-10 rounded-md text-sm font-medium border transition-colors
                              ${alreadyHasSlot ? "opacity-30 cursor-not-allowed bg-muted text-muted-foreground border-border" :
                                noSchoolForDay ? "opacity-40 cursor-not-allowed bg-amber-50 text-amber-700 border-amber-200" :
                                isSelected ? "bg-primary text-primary-foreground border-primary" :
                                "bg-background text-foreground border-border hover:bg-accent"}`}
                            title={noSchoolForDay ? "학교 일정 없음" : undefined}
                            data-testid={`batch-day-chip-${d.value}`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}

            <TimeDropdown
              label={placeBatchForm.placeType === "school" ? "등교 시간" : "시작 시간"}
              hour={parseInt(placeBatchForm.startTime.split(":")[0]) || (placeBatchForm.placeType === "school" ? 8 : 13)}
              minute={parseInt(placeBatchForm.startTime.split(":")[1]) || 0}
              onHourChange={h => setPlaceBatchForm(f => ({ ...f, startTime: `${String(h).padStart(2, "0")}:${f.startTime.split(":")[1] || "00"}` }))}
              onMinuteChange={m => setPlaceBatchForm(f => ({ ...f, startTime: `${f.startTime.split(":")[0] || (placeBatchForm.placeType === "school" ? "08" : "13")}:${String(m).padStart(2, "0")}` }))}
              hours={placeBatchForm.placeType === "school" ? SCHOOL_HOURS : ACADEMY_HOURS}
              testId="batch-select-start-time"
            />

            {placeBatchForm.placeType === "school" ? (
              <TimeDropdown
                label="하교 시간"
                hour={parseInt(placeBatchForm.endTime.split(":")[0]) || 13}
                minute={parseInt(placeBatchForm.endTime.split(":")[1]) || 0}
                onHourChange={h => setPlaceBatchForm(f => ({ ...f, endTime: `${String(h).padStart(2, "0")}:${f.endTime.split(":")[1] || "00"}` }))}
                onMinuteChange={m => setPlaceBatchForm(f => ({ ...f, endTime: `${f.endTime.split(":")[0] || "13"}:${String(m).padStart(2, "0")}` }))}
                hours={SCHOOL_HOURS}
                testId="batch-select-end-time"
              />
            ) : (
              <div className="space-y-2">
                <Label>수업 길이</Label>
                <Select value={String(placeBatchForm.durationMinutes)} onValueChange={v => setPlaceBatchForm(f => ({ ...f, durationMinutes: parseInt(v) }))} data-testid="batch-select-duration">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  종료 시간: {addMinutesToTime(placeBatchForm.startTime, placeBatchForm.durationMinutes)}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>데려다 주기 (등원)</Label>
              <Select value={placeBatchForm.dropOffType || "none"} onValueChange={v => setPlaceBatchForm(f => ({ ...f, dropOffType: v === "none" ? null : v, dropOffGuardianId: v !== "parent" ? null : f.dropOffGuardianId }))} data-testid="batch-select-drop-off">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">미설정</SelectItem>
                  <SelectItem value="shuttle">셔틀</SelectItem>
                  <SelectItem value="parent">부모</SelectItem>
                </SelectContent>
              </Select>
              {placeBatchForm.dropOffType === "parent" && (() => {
                const membersList = (members || []) as FamilyMember[];
                if (membersList.length === 0) return null;
                return (
                  <Select value={String(placeBatchForm.dropOffGuardianId || "none")} onValueChange={v => setPlaceBatchForm(f => ({ ...f, dropOffGuardianId: v === "none" ? null : parseInt(v) }))}>
                    <SelectTrigger data-testid="batch-select-drop-off-guardian">
                      <SelectValue placeholder="등원 담당 보호자 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">담당 보호자 미지정</SelectItem>
                      {membersList.map(m => (
                        <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })()}
            </div>

            <div className="space-y-2">
              <Label>데려오기 (하원)</Label>
              <Select value={placeBatchForm.pickUpType || "none"} onValueChange={v => setPlaceBatchForm(f => ({ ...f, pickUpType: v === "none" ? null : v, pickUpShuttleArrivalTime: v === "shuttle" ? (placeBatchForm.pickUpShuttleArrivalTime || "15:00") : null }))} data-testid="batch-select-pick-up">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">미설정</SelectItem>
                  <SelectItem value="shuttle">셔틀</SelectItem>
                  <SelectItem value="parent">부모</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {placeBatchForm.pickUpType === "shuttle" && (
              <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Bus className="w-4 h-4 text-teal-600" />
                  <Label className="text-sm font-medium">셔틀 도착 시간 (하원)</Label>
                </div>
                <div className="flex gap-2">
                  <Select value={String(parseInt((placeBatchForm.pickUpShuttleArrivalTime || "15:00").split(":")[0]))} onValueChange={v => setPlaceBatchForm(f => ({ ...f, pickUpShuttleArrivalTime: `${String(parseInt(v)).padStart(2, "0")}:${(f.pickUpShuttleArrivalTime || "15:00").split(":")[1]}` }))}>
                    <SelectTrigger className="flex-1" data-testid="batch-select-pickup-shuttle-hour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACADEMY_HOURS.map(h => (
                        <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}시</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={String(parseInt((placeBatchForm.pickUpShuttleArrivalTime || "15:00").split(":")[1]))} onValueChange={v => setPlaceBatchForm(f => ({ ...f, pickUpShuttleArrivalTime: `${(f.pickUpShuttleArrivalTime || "15:00").split(":")[0]}:${String(parseInt(v)).padStart(2, "0")}` }))}>
                    <SelectTrigger className="flex-1" data-testid="batch-select-pickup-shuttle-minute">
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

            {(() => {
              const membersList = (members || []) as FamilyMember[];
              if (membersList.length === 0) return null;
              return (
                <>
                  <div className="space-y-2">
                    <Label>주 보호자</Label>
                    <Select value={String(placeBatchForm.primaryGuardianId || "none")} onValueChange={v => {
                        const newId = v === "none" ? null : parseInt(v);
                        setPlaceBatchForm(f => ({
                          ...f,
                          primaryGuardianId: newId,
                          backupGuardianId: newId !== null && f.backupGuardianId === newId ? null : f.backupGuardianId,
                        }));
                      }} data-testid="batch-select-primary-guardian">
                      <SelectTrigger>
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
                    <Select value={String(placeBatchForm.backupGuardianId || "none")} onValueChange={v => setPlaceBatchForm(f => ({ ...f, backupGuardianId: v === "none" ? null : parseInt(v) }))} data-testid="batch-select-backup-guardian">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">미지정</SelectItem>
                        {membersList.filter(m => m.id !== placeBatchForm.primaryGuardianId).map(m => (
                          <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              );
            })()}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setPlaceBatchDialogOpen(false)}>취소</Button>
              <Button
                onClick={handlePlaceBatch}
                disabled={placeBatchPending || placeBatchForm.days.length === 0}
                data-testid="button-confirm-batch-schedule"
              >
                {placeBatchPending ? "등록 중..." : placeBatchForm.days.length === 0
                  ? "일정 등록"
                  : `${placeBatchForm.days.sort((a, b) => { const order = [1,2,3,4,5,6,0]; return order.indexOf(a) - order.indexOf(b); }).map(d => DAYS.find(x => x.value === d)?.label).join("·")} ${placeBatchForm.days.length}개 일정 등록`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
