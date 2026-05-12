import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useDeviceUser } from "@/lib/device-user-context";
import {
  useLogout,
  useGetVapidPublicKey,
  useGetNotificationPreferences,
  useUpdateNotificationPreferences,
  useSubscribePush,
  useUnsubscribePush,
  useGetChildren,
  getGetChildrenQueryKey,
  useCreateChild,
  useDeleteChild,
  useUpdateChildDeviationAlerts,
  useGetFamilyMembers,
  getGetFamilyMembersQueryKey,
  useGetMyInvitations,
  getGetMyInvitationsQueryKey,
  useInviteFamily,
  useAcceptInvitation,
  useDeclineInvitation,
  useRemoveFamilyMember,
  useDeleteMe,
  useSetFamilyMemberAlias,
  useDeleteFamilyMemberAlias,
  useGetFamilyPlaces,
  getGetFamilyPlacesQueryKey,
  useCreateFamilyPlace,
  useDeletePlace,
} from "@workspace/api-client-react";
import type { Child, FamilyMember, FamilyInvitation, Place } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { BusinessFooter } from "@/components/business-footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Phone, LogOut, Bell, BellOff, Smartphone, Plus, Trash2, Users, Check, X, Crown, Pencil, MapPin, GraduationCap, BookOpen, Home, Heart } from "lucide-react";
import KakaoKeywordSearch from "@/components/kakao-keyword-search";
import type { KakaoKeywordResult } from "@/components/kakao-keyword-search";
import { useEffect, useCallback } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const MINUTES_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { isChildMode, activeChild, setActiveChild, clearChildMode } = useDeviceUser();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const logoutMutation = useLogout();
  const { data: childrenData, isLoading: childrenLoading } = useGetChildren({ query: { queryKey: getGetChildrenQueryKey() } });
  const { data: vapidData } = useGetVapidPublicKey();
  const { data: prefData, refetch: refetchPrefs } = useGetNotificationPreferences();
  const updatePrefsMutation = useUpdateNotificationPreferences();
  const subscribeMutation = useSubscribePush();
  const unsubscribeMutation = useUnsubscribePush();

  const createChildMutation = useCreateChild();
  const deleteChildMutation = useDeleteChild();
  const updateDeviationAlertsMutation = useUpdateChildDeviationAlerts();

  const { data: membersData, isLoading: membersLoading } = useGetFamilyMembers({ query: { queryKey: getGetFamilyMembersQueryKey() } });
  const { data: invitationsData, isLoading: invitationsLoading } = useGetMyInvitations({ query: { queryKey: getGetMyInvitationsQueryKey() } });
  const inviteMutation = useInviteFamily();
  const acceptMutation = useAcceptInvitation();
  const declineMutation = useDeclineInvitation();

  const [notifEnabled, setNotifEnabled] = useState(false);
  const [minutesBefore, setMinutesBefore] = useState(15);
  const [permissionState, setPermissionState] = useState<NotificationPermission | "unsupported">("default");
  const [isToggling, setIsToggling] = useState(false);

  const [newChildName, setNewChildName] = useState("");
  const [childDialogOpen, setChildDialogOpen] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [memberToRemove, setMemberToRemove] = useState<FamilyMember | null>(null);
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false);

  const [editingAliasId, setEditingAliasId] = useState<number | null>(null);
  const [aliasInput, setAliasInput] = useState("");

  const removeMemberMutation = useRemoveFamilyMember();
  const deleteAccountMutation = useDeleteMe();
  const setAliasMutation = useSetFamilyMemberAlias();
  const deleteAliasMutation = useDeleteFamilyMemberAlias();

  const { data: placesData, isLoading: placesLoading } = useGetFamilyPlaces({ query: { queryKey: getGetFamilyPlacesQueryKey() } });
  const createPlaceMutation = useCreateFamilyPlace();
  const deletePlaceMutation = useDeletePlace();

  const [placeDialogOpen, setPlaceDialogOpen] = useState(false);
  const [placeForm, setPlaceForm] = useState({ placeName: "", address: "", type: "academy" as "school" | "academy" | "care" | "home", lat: null as number | null, lng: null as number | null });
  const [placeToDelete, setPlaceToDelete] = useState<Place | null>(null);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermissionState("unsupported");
      return;
    }
    setPermissionState(Notification.permission);
  }, []);

  useEffect(() => {
    if (prefData) {
      setNotifEnabled(prefData.enabled);
      setMinutesBefore(prefData.minutesBefore);
    }
  }, [prefData]);

  const registerAndSubscribe = useCallback(async () => {
    if (!vapidData?.publicKey) {
      throw new Error("VAPID 키를 불러올 수 없습니다");
    }

    const registration = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { scope: import.meta.env.BASE_URL }
    );

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
      });
    }

    const json = subscription.toJSON();
    await subscribeMutation.mutateAsync({
      data: {
        endpoint: json.endpoint!,
        p256dh: json.keys!.p256dh!,
        auth: json.keys!.auth!,
      },
    });
  }, [vapidData, subscribeMutation]);

  const handleToggle = async () => {
    setIsToggling(true);
    try {
      if (!notifEnabled) {
        const permission = await Notification.requestPermission();
        setPermissionState(permission);
        if (permission !== "granted") {
          setIsToggling(false);
          return;
        }

        await registerAndSubscribe();
        await updatePrefsMutation.mutateAsync({ data: { enabled: true, minutesBefore } });
        setNotifEnabled(true);
      } else {
        const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
        if (registration) {
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            await unsubscribeMutation.mutateAsync({ data: { endpoint: subscription.endpoint } });
            await subscription.unsubscribe();
          }
        }
        await updatePrefsMutation.mutateAsync({ data: { enabled: false, minutesBefore } });
        setNotifEnabled(false);
      }
      refetchPrefs();
    } catch (err) {
      console.error("Notification toggle error:", err);
    } finally {
      setIsToggling(false);
    }
  };

  const handleMinutesChange = async (value: number) => {
    setMinutesBefore(value);
    if (notifEnabled) {
      await updatePrefsMutation.mutateAsync({ data: { enabled: true, minutesBefore: value } });
      refetchPrefs();
    }
  };

  const handleClearChildMode = () => {
    clearChildMode(activeChild?.id);
  };

  const handleLogout = () => {
    clearChildMode();
    logoutMutation.mutate(undefined as any, {
      onSuccess: () => {
        refreshUser();
        setLocation("/login");
      },
    });
  };

  const handleCreateChild = () => {
    if (!newChildName.trim()) return;
    createChildMutation.mutate(
      { data: { name: newChildName.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetChildrenQueryKey() });
          setNewChildName("");
          setChildDialogOpen(false);
          toast({ title: "아이가 추가되었습니다" });
        },
        onError: () => {
          toast({ title: "아이 추가에 실패했습니다", variant: "destructive" });
        },
      }
    );
  };

  const handleDeleteChild = (id: number) => {
    deleteChildMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetChildrenQueryKey() });
          toast({ title: "아이가 삭제되었습니다" });
        },
      }
    );
  };

  const handleDeviationToggle = (child: Child) => {
    updateDeviationAlertsMutation.mutate(
      { id: child.id, data: { enabled: !child.deviationAlertsEnabled } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetChildrenQueryKey() });
        },
        onError: () => {
          toast({ title: "설정 변경에 실패했습니다", variant: "destructive" });
        },
      }
    );
  };

  const handleInvite = () => {
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate(
      { data: { email: inviteEmail.trim() } },
      {
        onSuccess: () => {
          setInviteEmail("");
          toast({ title: "초대가 발송되었습니다" });
        },
        onError: () => {
          toast({ title: "초대 발송에 실패했습니다", variant: "destructive" });
        },
      }
    );
  };

  const handleAccept = (id: number) => {
    acceptMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMyInvitationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetFamilyMembersQueryKey() });
          toast({ title: "초대를 수락했습니다" });
        },
      }
    );
  };

  const handleDecline = (id: number) => {
    declineMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMyInvitationsQueryKey() });
          toast({ title: "초대를 거절했습니다" });
        },
      }
    );
  };

  const handleRemoveMember = () => {
    if (!memberToRemove) return;
    removeMemberMutation.mutate(
      { id: memberToRemove.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFamilyMembersQueryKey() });
          setMemberToRemove(null);
          toast({ title: `${memberToRemove.name}님을 가족에서 제거했습니다` });
        },
        onError: () => {
          setMemberToRemove(null);
          toast({ title: "가족 구성원 제거에 실패했습니다", variant: "destructive" });
        },
      }
    );
  };

  const startEditAlias = (member: FamilyMember) => {
    setEditingAliasId(member.id);
    setAliasInput(member.alias ?? "");
  };

  const cancelEditAlias = () => {
    setEditingAliasId(null);
    setAliasInput("");
  };

  const handleSaveAlias = (memberId: number) => {
    const trimmed = aliasInput.trim();
    if (!trimmed) {
      handleClearAlias(memberId);
      return;
    }
    setAliasMutation.mutate(
      { id: memberId, data: { alias: trimmed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFamilyMembersQueryKey() });
          setEditingAliasId(null);
          setAliasInput("");
          toast({ title: "별칭이 저장되었습니다" });
        },
        onError: () => {
          toast({ title: "별칭 저장에 실패했습니다", variant: "destructive" });
        },
      }
    );
  };

  const handleClearAlias = (memberId: number) => {
    deleteAliasMutation.mutate(
      { id: memberId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFamilyMembersQueryKey() });
          setEditingAliasId(null);
          setAliasInput("");
          toast({ title: "별칭이 삭제되었습니다" });
        },
        onError: () => {
          toast({ title: "별칭 삭제에 실패했습니다", variant: "destructive" });
        },
      }
    );
  };

  const handleKakaoSelect = (result: KakaoKeywordResult) => {
    setPlaceForm(f => ({
      ...f,
      placeName: result.placeName,
      address: result.address,
      lat: result.lat ?? null,
      lng: result.lng ?? null,
    }));
  };

  const handleCreatePlace = () => {
    if (!placeForm.placeName.trim()) {
      toast({ title: "장소명을 입력해주세요", variant: "destructive" });
      return;
    }
    if (placeForm.type !== "home" && !placeForm.address.trim()) {
      toast({ title: "주소를 입력해주세요", variant: "destructive" });
      return;
    }
    createPlaceMutation.mutate(
      { data: { placeName: placeForm.placeName.trim(), address: placeForm.address.trim(), type: placeForm.type, lat: placeForm.lat, lng: placeForm.lng } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFamilyPlacesQueryKey() });
          setPlaceForm({ placeName: "", address: "", type: "academy", lat: null, lng: null });
          setPlaceDialogOpen(false);
          toast({ title: "장소가 추가되었습니다" });
        },
        onError: () => {
          toast({ title: "장소 추가에 실패했습니다", variant: "destructive" });
        },
      }
    );
  };

  const handleDeletePlace = () => {
    if (!placeToDelete) return;
    deletePlaceMutation.mutate(
      { id: placeToDelete.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFamilyPlacesQueryKey() });
          setPlaceToDelete(null);
          toast({ title: "장소가 삭제되었습니다" });
        },
        onError: () => {
          setPlaceToDelete(null);
          toast({ title: "장소 삭제에 실패했습니다", variant: "destructive" });
        },
      }
    );
  };

  const handleDeleteAccount = () => {
    deleteAccountMutation.mutate(undefined, {
      onSuccess: () => {
        clearChildMode();
        refreshUser();
        setLocation("/login");
      },
      onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
        setDeleteAccountDialogOpen(false);
        const msg = err?.response?.data?.error ?? err?.message ?? "회원 탈퇴에 실패했습니다";
        toast({ title: msg, variant: "destructive" });
      },
    });
  };

  const childrenList = (childrenData ?? []) as Child[];
  const membersList = (membersData ?? []) as FamilyMember[];
  const invitationsList = (invitationsData ?? []) as FamilyInvitation[];
  const placesList = (placesData ?? []) as Place[];
  const currentUserRole = membersList.find(m => m.id === user?.id)?.role ?? "guardian";
  const isOwner = currentUserRole === "owner";

  const placeTypeLabel = (type: string) => {
    if (type === "school") return "학교";
    if (type === "academy") return "학원";
    if (type === "care") return "돌봄";
    if (type === "home") return "집";
    return type;
  };

  const placeTypeIcon = (type: string) => {
    if (type === "school") return <GraduationCap className="w-4 h-4 text-blue-600 flex-shrink-0" />;
    if (type === "academy") return <BookOpen className="w-4 h-4 text-green-600 flex-shrink-0" />;
    if (type === "care") return <Heart className="w-4 h-4 text-purple-600 flex-shrink-0" />;
    if (type === "home") return <Home className="w-4 h-4 text-yellow-600 flex-shrink-0" />;
    return <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
  };

  return (
    <div className="space-y-4" data-testid="settings-page">
      <h1 className="text-xl font-bold text-foreground">설정</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">프로필</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground" data-testid="text-user-name">{user?.name}</p>
              <Badge variant="secondary" className="text-[10px]">
                {user?.familyId ? "가족 연결됨" : "가족 없음"}
              </Badge>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span data-testid="text-user-email">{user?.email}</span>
            </div>
            {user?.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span>{user.phone}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 우리 아이 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              우리 아이
            </CardTitle>
            {isOwner && (
            <Dialog open={childDialogOpen} onOpenChange={setChildDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" data-testid="button-add-child">
                  <Plus className="w-3 h-3" />
                  추가
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>아이 추가</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="아이 이름"
                    value={newChildName}
                    onChange={e => setNewChildName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCreateChild()}
                    data-testid="input-child-name"
                  />
                  <div className="flex gap-2 justify-end">
                    <DialogClose asChild>
                      <Button variant="outline">취소</Button>
                    </DialogClose>
                    <Button
                      onClick={handleCreateChild}
                      disabled={createChildMutation.isPending || !newChildName.trim()}
                      data-testid="button-confirm-add-child"
                    >
                      {createChildMutation.isPending ? "추가 중..." : "추가"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {childrenLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : childrenList.length ? (
            <div className="space-y-3">
              {childrenList.map((child: Child) => (
                <div key={child.id} className="p-3 bg-muted/30 rounded-lg space-y-2" data-testid={`card-child-${child.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">{child.name.slice(0, 1)}</span>
                      </div>
                      <p className="font-medium text-sm text-foreground" data-testid={`text-child-name-${child.id}`}>{child.name}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDeleteChild(child.id)}
                      data-testid={`button-delete-child-${child.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between pl-11">
                    <div>
                      <p className="text-xs font-medium text-foreground">이탈 감지 알림</p>
                      <p className="text-[10px] text-muted-foreground">
                        {child.deviationAlertsEnabled
                          ? "활성화됨 — 평소 경로에서 벗어나면 알림 발송"
                          : "1~2주간 이동 후 패턴이 쌓이면 활성화하세요"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeviationToggle(child)}
                      disabled={updateDeviationAlertsMutation.isPending}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        child.deviationAlertsEnabled ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          child.deviationAlertsEnabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground">등록된 아이가 없습니다</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 장소 관리 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              장소 관리
            </CardTitle>
            {isOwner && (
              <Dialog open={placeDialogOpen} onOpenChange={(open) => {
                setPlaceDialogOpen(open);
                if (!open) setPlaceForm({ placeName: "", address: "", type: "academy", lat: null, lng: null });
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" data-testid="button-add-place">
                    <Plus className="w-3 h-3" />
                    장소 추가
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>장소 추가</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
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
                    </div>
                    <div className="flex gap-2 justify-end">
                      <DialogClose asChild>
                        <Button variant="outline">취소</Button>
                      </DialogClose>
                      <Button
                        onClick={handleCreatePlace}
                        disabled={createPlaceMutation.isPending || !placeForm.placeName.trim()}
                        data-testid="button-confirm-add-place"
                      >
                        {createPlaceMutation.isPending ? "추가 중..." : "추가"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {placesLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : placesList.length ? (
            <div className="space-y-2">
              {placesList.map((place: Place) => (
                <div key={place.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg" data-testid={`card-place-${place.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {placeTypeIcon(place.type)}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{place.placeName}</p>
                      {place.address && (
                        <p className="text-xs text-muted-foreground truncate">{place.address}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <Badge variant="outline" className="text-[10px]">{placeTypeLabel(place.type)}</Badge>
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setPlaceToDelete(place)}
                        data-testid={`button-delete-place-${place.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground">
                {isOwner ? "장소 추가 버튼을 눌러 추가하세요" : "가족 대표에게 요청하세요"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!placeToDelete} onOpenChange={open => { if (!open) setPlaceToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>장소 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{placeToDelete?.placeName}</strong>을(를) 삭제하시겠습니까?
              이 장소에 연결된 일정에 영향을 줄 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeletePlace}
              disabled={deletePlaceMutation.isPending}
            >
              {deletePlaceMutation.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 가족 구성원 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            가족 구성원
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isOwner && (
            <div className="flex gap-2">
              <Input
                placeholder="초대할 이메일 주소"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleInvite()}
                data-testid="input-invite-email"
              />
              <Button
                size="sm"
                onClick={handleInvite}
                disabled={inviteMutation.isPending || !inviteEmail.trim()}
                data-testid="button-invite"
              >
                {inviteMutation.isPending ? "..." : "초대"}
              </Button>
            </div>
          )}

          {invitationsLoading ? (
            <Skeleton className="h-10 rounded-lg" />
          ) : invitationsList.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">대기 중인 초대</p>
              {invitationsList.map((inv: FamilyInvitation) => (
                <div key={inv.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg" data-testid={`card-invitation-${inv.id}`}>
                  <div>
                    <p className="text-sm font-medium">{inv.fromUserName}</p>
                    <p className="text-xs text-muted-foreground">초대 수신 ({inv.toEmail})</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 text-green-600 border-green-200"
                      onClick={() => handleAccept(inv.id)}
                      disabled={acceptMutation.isPending}
                      data-testid={`button-accept-invitation-${inv.id}`}
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 text-destructive border-destructive/20"
                      onClick={() => handleDecline(inv.id)}
                      disabled={declineMutation.isPending}
                      data-testid={`button-decline-invitation-${inv.id}`}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {membersLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : membersList.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">현재 구성원</p>
              {membersList.map((member: FamilyMember) => {
                const isMe = member.id === user?.id;
                const isEditing = editingAliasId === member.id;
                const displayName = member.alias ?? member.name;

                return (
                <div key={member.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg" data-testid={`card-member-${member.id}`}>
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-blue-600">{displayName.slice(0, 1)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-1.5">
                        <Input
                          value={aliasInput}
                          onChange={e => setAliasInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") handleSaveAlias(member.id);
                            if (e.key === "Escape") cancelEditAlias();
                          }}
                          placeholder={member.name}
                          maxLength={20}
                          className="h-7 text-sm px-2"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => handleSaveAlias(member.id)}
                            disabled={setAliasMutation.isPending || deleteAliasMutation.isPending}
                          >
                            저장
                          </Button>
                          {member.alias && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs px-2 text-muted-foreground"
                              onClick={() => handleClearAlias(member.id)}
                              disabled={deleteAliasMutation.isPending}
                            >
                              별칭 삭제
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs px-2"
                            onClick={cancelEditAlias}
                          >
                            취소
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{displayName}</p>
                            {member.role === "owner" && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                <Crown className="w-2.5 h-2.5" />
                                주 보호자
                              </span>
                            )}
                          </div>
                          {member.alias ? (
                            <p className="text-xs text-muted-foreground truncate">{member.name}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                          )}
                        </div>
                        {!isMe && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground flex-shrink-0"
                            onClick={() => startEditAlias(member)}
                            data-testid={`button-edit-alias-${member.id}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  {!isEditing && isOwner && member.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive flex-shrink-0"
                      onClick={() => setMemberToRemove(member)}
                      data-testid={`button-remove-member-${member.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">가족 구성원이 없습니다</p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!memberToRemove} onOpenChange={open => { if (!open) setMemberToRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>가족 구성원 제거</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{memberToRemove?.name}</strong>님을 가족에서 제거하시겠습니까?
              이 구성원은 더 이상 가족의 아이, 일정, 장소 등 공유 데이터를 볼 수 없게 됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRemoveMember}
              disabled={removeMemberMutation.isPending}
            >
              {removeMemberMutation.isPending ? "제거 중..." : "제거"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isOwner && childrenList.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              이 기기 사용자
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">
              자녀가 이 기기를 사용하는 경우 선택하세요. 자녀 모드에서는 위치가 자녀 이름으로 공유됩니다.
            </p>
            <button
              onClick={handleClearChildMode}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                !isChildMode
                  ? "border-primary bg-primary/5 text-primary font-medium"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name} (부모 본인)</p>
              </div>
              {!isChildMode && (
                <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">현재</span>
              )}
            </button>
            {childrenList.map((child: Child) => (
              <button
                key={child.id}
                onClick={() => setActiveChild({ id: child.id, name: child.name })}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                  isChildMode && activeChild?.id === child.id
                    ? "border-primary bg-primary/5 text-primary font-medium"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-blue-600">{child.name.slice(0, 1)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{child.name}</p>
                </div>
                {isChildMode && activeChild?.id === child.id && (
                  <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">현재</span>
                )}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="w-4 h-4" />
            알림 설정
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {permissionState === "unsupported" ? (
            <p className="text-sm text-muted-foreground">이 브라우저는 푸시 알림을 지원하지 않습니다.</p>
          ) : permissionState === "denied" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <BellOff className="w-4 h-4" />
                <span>알림이 차단되었습니다</span>
              </div>
              <p className="text-xs text-muted-foreground">브라우저 설정에서 알림 권한을 허용해주세요.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">픽업 알림</p>
                  <p className="text-xs text-muted-foreground">픽업/셔틀 시간 전 알림을 받습니다</p>
                </div>
                <Button
                  variant={notifEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={handleToggle}
                  disabled={isToggling}
                  className="min-w-[60px]"
                >
                  {isToggling ? "..." : notifEnabled ? "켜짐" : "꺼짐"}
                </Button>
              </div>

              {notifEnabled && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">알림 시점</label>
                  <select
                    value={minutesBefore}
                    onChange={(e) => handleMinutesChange(Number(e.target.value))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {MINUTES_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}분 전
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    픽업 시간 또는 셔틀 도착 시간 기준으로 선택한 시간 전에 알림을 보냅니다.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Button
        variant="destructive"
        className="w-full gap-2"
        onClick={handleLogout}
        disabled={logoutMutation.isPending}
        data-testid="button-logout"
      >
        <LogOut className="w-4 h-4" />
        {logoutMutation.isPending ? "로그아웃 중..." : "로그아웃"}
      </Button>

      <Button
        variant="ghost"
        className="w-full gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        onClick={() => setDeleteAccountDialogOpen(true)}
        data-testid="button-delete-account"
      >
        <Trash2 className="w-4 h-4" />
        회원 탈퇴
      </Button>

      <AlertDialog open={deleteAccountDialogOpen} onOpenChange={setDeleteAccountDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정말 탈퇴하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              회원 탈퇴 시 계정 및 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
              {isOwner && membersList.filter(m => m.role !== "owner").length > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  먼저 가족 구성원을 모두 제거한 후 탈퇴할 수 있습니다.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteAccount}
              disabled={
                deleteAccountMutation.isPending ||
                (isOwner && membersList.filter(m => m.role !== "owner").length > 0)
              }
            >
              {deleteAccountMutation.isPending ? "탈퇴 중..." : "탈퇴하기"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BusinessFooter />
    </div>
  );
}
