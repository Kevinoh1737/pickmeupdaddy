import React, { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateChild,
  getGetChildrenQueryKey,
  useCreateFamilyPlace,
  useGetFamilyPlaces,
  getGetFamilyPlacesQueryKey,
  useCreateTimeSlot,
  getGetTimeSlotsQueryKey,
  useCompleteOnboarding,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import type { Child, Place } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Check, User, MapPin, Clock, ArrowRight, Plus, X, ChevronLeft } from "lucide-react";
import KakaoKeywordSearch from "@/components/kakao-keyword-search";
import type { KakaoKeywordResult } from "@/components/kakao-keyword-search";

const DAY_NUMS = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES_KO = ["월", "화", "수", "목", "금", "토", "일"];

function detectPlaceType(name: string): "school" | "academy" | "care" {
  const schoolKeywords = ["학교", "초등", "중학", "고등", "elementary", "middle", "high school"];
  const careKeywords = ["돌봄", "방과후", "care"];
  const lower = name.toLowerCase();
  if (schoolKeywords.some(kw => lower.includes(kw))) return "school";
  if (careKeywords.some(kw => lower.includes(kw))) return "care";
  return "academy";
}

function typeLabel(type: string) {
  if (type === "school") return "학교";
  if (type === "care") return "돌봄";
  if (type === "home") return "집";
  return "학원";
}

const STEPS = [
  { label: "아이 추가", icon: User },
  { label: "장소 추가", icon: MapPin },
  { label: "일정 추가", icon: Clock },
];

type PendingSlot = {
  childId: number;
  childName: string;
  placeId: number;
  placeName: string;
  days: number[];
  startTime: string;
  endTime: string;
  pickUpType: "shuttle" | "parent" | null;
};

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);

  const [createdChildren, setCreatedChildren] = useState<Child[]>([]);
  const [childNameInput, setChildNameInput] = useState("");

  const [createdPlaces, setCreatedPlaces] = useState<Place[]>([]);
  const [placeForm, setPlaceForm] = useState({
    placeName: "",
    address: "",
    type: "school" as "school" | "academy" | "care" | "home",
    lat: null as number | null,
    lng: null as number | null,
  });

  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null);
  const [slotForm, setSlotForm] = useState({
    days: [] as number[],
    startTime: "14:00",
    endTime: "15:00",
    pickUpType: null as "shuttle" | "parent" | null,
  });
  const [pendingSlots, setPendingSlots] = useState<PendingSlot[]>([]);

  const createChildMutation = useCreateChild();
  const createPlaceMutation = useCreateFamilyPlace();
  const createSlotMutation = useCreateTimeSlot();
  const completeOnboardingMutation = useCompleteOnboarding();

  const { data: placesData } = useGetFamilyPlaces({
    query: { queryKey: getGetFamilyPlacesQueryKey(), enabled: step === 2 },
  });
  const familyPlaces: Place[] = Array.isArray(placesData) ? placesData : [];

  const markComplete = () => {
    completeOnboardingMutation.mutate(undefined, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        refreshUser();
        setLocation("/");
      },
      onError: () => {
        toast({ title: "온보딩 완료에 실패했습니다. 다시 시도해주세요.", variant: "destructive" });
      },
    });
  };

  const handleAddChild = (afterSuccess?: () => void) => {
    if (!childNameInput.trim()) {
      toast({ title: "아이 이름을 입력해주세요", variant: "destructive" });
      return;
    }
    createChildMutation.mutate(
      { data: { name: childNameInput.trim() } },
      {
        onSuccess: (child) => {
          queryClient.invalidateQueries({ queryKey: getGetChildrenQueryKey() });
          setCreatedChildren(prev => [...prev, child]);
          setChildNameInput("");
          afterSuccess?.();
        },
        onError: () => {
          toast({ title: "아이 추가에 실패했습니다", variant: "destructive" });
        },
      }
    );
  };

  const handleNextStep0 = () => {
    if (childNameInput.trim()) {
      handleAddChild(() => setStep(1));
    } else {
      setStep(1);
    }
  };

  const handleKakaoSelect = (result: KakaoKeywordResult) => {
    setPlaceForm({
      placeName: result.placeName,
      address: result.address,
      type: detectPlaceType(result.placeName),
      lat: result.lat ?? null,
      lng: result.lng ?? null,
    });
  };

  const handleAddPlace = (afterSuccess?: () => void) => {
    if (!placeForm.placeName.trim()) {
      toast({ title: "장소명을 입력해주세요", variant: "destructive" });
      return;
    }
    if (placeForm.type !== "home" && !placeForm.address.trim()) {
      toast({ title: "주소를 입력해주세요", variant: "destructive" });
      return;
    }
    createPlaceMutation.mutate(
      {
        data: {
          placeName: placeForm.placeName.trim(),
          address: placeForm.address.trim(),
          type: placeForm.type,
          lat: placeForm.lat,
          lng: placeForm.lng,
        },
      },
      {
        onSuccess: (place) => {
          queryClient.invalidateQueries({ queryKey: getGetFamilyPlacesQueryKey() });
          setCreatedPlaces(prev => [...prev, place]);
          setPlaceForm({ placeName: "", address: "", type: "school", lat: null, lng: null });
          afterSuccess?.();
        },
        onError: () => {
          toast({ title: "장소 추가에 실패했습니다", variant: "destructive" });
        },
      }
    );
  };

  const handleNextStep1 = () => {
    if (placeForm.placeName.trim()) {
      handleAddPlace(() => setStep(2));
    } else {
      setStep(2);
    }
  };

  const handleAddPendingSlot = () => {
    const child = createdChildren.find(c => c.id === selectedChildId) ?? createdChildren[0];
    const allPlaces = familyPlaces.length > 0 ? familyPlaces : createdPlaces;
    const place = allPlaces.find(p => p.id === selectedPlaceId) ?? allPlaces[0];

    if (!child) {
      toast({ title: "아이를 선택해주세요", variant: "destructive" });
      return;
    }
    if (!place) {
      toast({ title: "장소를 선택해주세요", variant: "destructive" });
      return;
    }
    if (slotForm.days.length === 0) {
      toast({ title: "요일을 하나 이상 선택해주세요", variant: "destructive" });
      return;
    }
    if (slotForm.startTime >= slotForm.endTime) {
      toast({ title: "종료 시간은 시작 시간보다 늦어야 합니다", variant: "destructive" });
      return;
    }

    setPendingSlots(prev => [
      ...prev,
      {
        childId: child.id,
        childName: child.name,
        placeId: place.id,
        placeName: place.placeName,
        days: slotForm.days,
        startTime: slotForm.startTime,
        endTime: slotForm.endTime,
        pickUpType: slotForm.pickUpType,
      },
    ]);
    setSlotForm(f => ({ ...f, days: [] }));
  };

  const handleRemovePendingSlot = (idx: number) => {
    setPendingSlots(prev => prev.filter((_, i) => i !== idx));
  };

  const handleComplete = async () => {
    if (pendingSlots.length === 0) {
      markComplete();
      return;
    }
    try {
      await Promise.all(
        pendingSlots.flatMap(slot =>
          slot.days.map(day =>
            createSlotMutation.mutateAsync({
              childId: slot.childId,
              data: {
                placeId: slot.placeId,
                dayOfWeek: day,
                startTime: slot.startTime,
                endTime: slot.endTime,
                primaryGuardianId: null,
                backupGuardianId: null,
                dropOffType: null,
                pickUpType: slot.pickUpType,
              },
            })
          )
        )
      );
      for (const child of createdChildren) {
        queryClient.invalidateQueries({ queryKey: getGetTimeSlotsQueryKey(child.id) });
      }
      markComplete();
    } catch {
      toast({ title: "일정 추가에 실패했습니다", variant: "destructive" });
    }
  };

  const toggleDay = (day: number) => {
    setSlotForm(f => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day],
    }));
  };

  const allPlacesForStep2 = familyPlaces.length > 0 ? familyPlaces : createdPlaces;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-start px-4 pt-10 pb-8 max-w-md mx-auto w-full">
        <div className="mb-8 text-center">
          <img src="/logo.png" alt="PickMeUpDaddy" className="w-40 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground">시작하기</h1>
          <p className="text-sm text-muted-foreground mt-1">아이 픽업 관리를 설정해요</p>
        </div>


        <div className="flex items-start justify-center gap-0 mb-8 w-full max-w-xs">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <React.Fragment key={i}>
                <div className="flex flex-col items-center gap-1 flex-none">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                      done
                        ? "bg-primary text-primary-foreground"
                        : active
                        ? "bg-primary/20 text-primary border-2 border-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={`text-xs ${active ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 mt-[18px] rounded ${i < step ? "bg-primary" : "bg-muted"}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {step === 0 && (
          <>
            <Card className="w-full">
              <CardContent className="pt-6 space-y-4">
                <div className="text-center mb-2">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <User className="w-7 h-7 text-primary" />
                  </div>
                  <h2 className="font-semibold text-lg">아이를 추가해요</h2>
                  <p className="text-sm text-muted-foreground mt-1">픽업할 아이의 이름을 입력하세요</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="child-name">아이 이름</Label>
                  <div className="flex gap-2">
                    <Input
                      id="child-name"
                      placeholder="예: 민준"
                      value={childNameInput}
                      onChange={e => setChildNameInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleAddChild(); }}
                      autoFocus
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={() => handleAddChild()}
                      disabled={createChildMutation.isPending || !childNameInput.trim()}
                      className="gap-1 shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      추가
                    </Button>
                  </div>
                </div>

                {createdChildren.length > 0 && (
                  <div className="space-y-1.5">
                    {createdChildren.map(child => (
                      <div key={child.id} className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">{child.name}</span>
                        <Check className="w-3.5 h-3.5 text-primary ml-auto shrink-0" />
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={handleNextStep0}
                  disabled={createdChildren.length === 0 && !childNameInput.trim() || createChildMutation.isPending || completeOnboardingMutation.isPending}
                >
                  다음
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={markComplete}
                  disabled={completeOnboardingMutation.isPending || createChildMutation.isPending}
                >
                  나중에 입력하기
                </Button>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground text-center mt-3">
              아이는 설정 &gt; 아이 관리에서 언제든지 추가·수정할 수 있어요
            </p>
          </>
        )}

        {step === 1 && (
          <>
            <Card className="w-full">
              <CardContent className="pt-6 space-y-4">
                <div className="text-center mb-2">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <MapPin className="w-7 h-7 text-primary" />
                  </div>
                  <h2 className="font-semibold text-lg">장소를 추가해요</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {createdChildren.length > 0
                      ? `${createdChildren.map(c => c.name).join(", ")}이(가) 다니는 학교나 학원을 추가하세요`
                      : "학교나 학원을 추가하세요"}
                  </p>
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5 text-left">
                    <span className="text-blue-500 mt-0.5 shrink-0">ℹ️</span>
                    <p className="text-xs text-blue-700 leading-relaxed">
                      학교를 먼저 추가한 뒤 학원을 추가하세요. 학원 일정은 학교가 등록된 요일에만 추가할 수 있어요.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <KakaoKeywordSearch
                    placeName={placeForm.placeName}
                    address={placeForm.address}
                    onSelect={handleKakaoSelect}
                    onClear={() => setPlaceForm(f => ({ ...f, placeName: "", address: "", lat: null, lng: null }))}
                    onPlaceNameChange={name => setPlaceForm(f => ({ ...f, placeName: name }))}
                  />

                  <div className="space-y-2">
                    <Label>장소 유형</Label>
                    <Select
                      value={placeForm.type}
                      onValueChange={v => setPlaceForm(f => ({ ...f, type: v as "school" | "academy" | "care" | "home" }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="school">학교</SelectItem>
                        <SelectItem value="academy">학원</SelectItem>
                        <SelectItem value="care">돌봄</SelectItem>
                        <SelectItem value="home">집</SelectItem>
                      </SelectContent>
                    </Select>
                    {(placeForm.type === "academy" || placeForm.type === "care") &&
                      !createdPlaces.some(p => p.type === "school") && (
                      <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                        <span className="text-amber-500 mt-0.5 shrink-0">⚠️</span>
                        <p className="text-xs text-amber-700 leading-relaxed">
                          학교가 없으면 학원·돌봄 일정을 등록할 수 없어요. 학교를 먼저 추가해 주세요.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full gap-1"
                  onClick={() => handleAddPlace()}
                  disabled={createPlaceMutation.isPending || !placeForm.placeName.trim()}
                >
                  <Plus className="w-4 h-4" />
                  {createPlaceMutation.isPending ? "추가 중..." : "장소 추가"}
                </Button>

                {createdPlaces.length > 0 && (
                  <div className="space-y-1.5">
                    {createdPlaces.map(place => (
                      <div key={place.id} className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium flex-1 truncate">{place.placeName}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{typeLabel(place.type)}</Badge>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 w-full">
                  <Button
                    variant="outline"
                    className="w-24 shrink-0"
                    onClick={() => setStep(step - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    이전
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleNextStep1}
                    disabled={createdPlaces.length === 0 && !placeForm.placeName.trim() || createPlaceMutation.isPending || completeOnboardingMutation.isPending}
                  >
                    다음
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={markComplete}
                  disabled={completeOnboardingMutation.isPending || createPlaceMutation.isPending}
                >
                  나중에 입력하기
                </Button>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground text-center mt-3">
              장소는 설정 &gt; 장소 관리에서 언제든지 추가·수정할 수 있어요
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <Card className="w-full">
              <CardContent className="pt-6 space-y-4">
                <div className="text-center mb-2">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-7 h-7 text-primary" />
                  </div>
                  <h2 className="font-semibold text-lg">일정을 추가해요</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    장소별 수업 일정을 입력하세요
                  </p>
                </div>

                <div className="space-y-3">
                  {createdChildren.length > 0 && (
                    <div className="space-y-2">
                      <Label>아이 선택</Label>
                      <Select
                        value={selectedChildId ? String(selectedChildId) : String(createdChildren[0]?.id ?? "")}
                        onValueChange={v => setSelectedChildId(Number(v))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="아이를 선택하세요" />
                        </SelectTrigger>
                        <SelectContent>
                          {createdChildren.map(c => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>장소 선택</Label>
                    <Select
                      value={selectedPlaceId ? String(selectedPlaceId) : String(allPlacesForStep2[0]?.id ?? "")}
                      onValueChange={v => setSelectedPlaceId(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="장소를 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {allPlacesForStep2.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.placeName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>수업 요일</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {DAY_NUMS.map((day, i) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${
                            slotForm.days.includes(day)
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/70"
                          }`}
                        >
                          {DAY_NAMES_KO[i]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>시작 시간</Label>
                      <Input
                        type="time"
                        value={slotForm.startTime}
                        onChange={e => setSlotForm(f => ({ ...f, startTime: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>종료 시간</Label>
                      <Input
                        type="time"
                        value={slotForm.endTime}
                        onChange={e => setSlotForm(f => ({ ...f, endTime: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>픽업 방식</Label>
                    <Select
                      value={slotForm.pickUpType ?? "none"}
                      onValueChange={v =>
                        setSlotForm(f => ({
                          ...f,
                          pickUpType: v === "none" ? null : (v as "shuttle" | "parent"),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="픽업 방식 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">미지정</SelectItem>
                        <SelectItem value="parent">부모 픽업</SelectItem>
                        <SelectItem value="shuttle">셔틀버스</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full gap-1"
                  onClick={handleAddPendingSlot}
                  disabled={createSlotMutation.isPending}
                >
                  <Plus className="w-4 h-4" />
                  일정 추가
                </Button>

                {pendingSlots.length > 0 && (
                  <div className="space-y-1.5">
                    {pendingSlots.map((slot, idx) => (
                      <div key={idx} className="flex items-start gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{slot.childName} · {slot.placeName}</p>
                          <p className="text-xs text-muted-foreground">
                            {slot.days.map(d => DAY_NAMES_KO[DAY_NUMS.indexOf(d)]).join("·")}
                            {" "}
                            {slot.startTime}–{slot.endTime}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePendingSlot(idx)}
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 w-full">
                  <Button
                    variant="outline"
                    className="w-24 shrink-0"
                    onClick={() => setStep(step - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    이전
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleComplete}
                    disabled={createSlotMutation.isPending || completeOnboardingMutation.isPending}
                  >
                    {createSlotMutation.isPending || completeOnboardingMutation.isPending ? "저장 중..." : "완료"}
                    <Check className="w-4 h-4 ml-1" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={markComplete}
                  disabled={completeOnboardingMutation.isPending || createSlotMutation.isPending}
                >
                  나중에 입력하기
                </Button>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground text-center mt-3">
              일정은 설정 &gt; 일정 관리에서 언제든지 추가·수정할 수 있어요
            </p>
          </>
        )}
      </div>
    </div>
  );
}
