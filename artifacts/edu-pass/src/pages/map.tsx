import { useEffect, useRef, useState, useCallback } from "react";
import { useGetFamilyLocations, useUpdateMyLocation, useGetChildLocationHistory } from "@workspace/api-client-react";
import { MapPin, Loader2, AlertCircle, Shield, Route } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDeviceUser } from "@/lib/device-user-context";

declare global {
  interface Window {
    kakao: {
      maps: {
        load: (callback: () => void) => void;
        Map: new (container: HTMLElement, options: object) => KakaoMap;
        LatLng: new (lat: number, lng: number) => KakaoLatLng;
        LatLngBounds: new () => KakaoLatLngBounds;
        Marker: new (options: object) => KakaoMarker;
        CustomOverlay: new (options: object) => KakaoCustomOverlay;
        InfoWindow: new (options: object) => KakaoInfoWindow;
        Polyline: new (options: object) => KakaoPolyline;
        event: {
          addListener: (target: object, type: string, handler: () => void) => void;
        };
      };
    };
  }
}

interface KakaoMap {
  setCenter: (latlng: KakaoLatLng) => void;
  setBounds: (bounds: KakaoLatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number) => void;
  getLevel: () => number;
  setLevel: (level: number) => void;
  panTo: (latlng: KakaoLatLng) => void;
}
interface KakaoLatLng { getLat: () => number; getLng: () => number; }
interface KakaoLatLngBounds { extend: (latlng: KakaoLatLng) => void; isEmpty: () => boolean; }
interface KakaoMarker { setMap: (map: KakaoMap | null) => void; }
interface KakaoCustomOverlay { setMap: (map: KakaoMap | null) => void; }
interface KakaoInfoWindow { open: (map: KakaoMap, marker: KakaoMarker) => void; close: () => void; }
interface KakaoPolyline { setMap: (map: KakaoMap | null) => void; }

function loadKakaoSdk(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps?.load) {
      window.kakao.maps.load(resolve);
      return;
    }
    const script = document.createElement("script");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    script.onload = () => window.kakao.maps.load(resolve);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function calcDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * 111000;
  const dLng = (lng2 - lng1) * 111000 * Math.cos(lat1 * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

const VITE_KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
const MIN_SEND_DISTANCE_M = 5;

const COLORS = ["#0d9488", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981"];

function ChildPolyline({ childId, colorIndex, map }: { childId: number; colorIndex: number; map: KakaoMap }) {
  const { data: history } = useGetChildLocationHistory(childId, {
    query: { refetchInterval: 10000 },
  });
  const polylineRef = useRef<KakaoPolyline | null>(null);

  useEffect(() => {
    if (!history || history.length < 2) {
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
      return;
    }

    polylineRef.current?.setMap(null);

    const path = history.map(pt => new window.kakao.maps.LatLng(pt.lat, pt.lng));
    const color = COLORS[colorIndex % COLORS.length];
    const polyline = new window.kakao.maps.Polyline({
      path,
      strokeWeight: 4,
      strokeColor: color,
      strokeOpacity: 0.8,
      strokeStyle: "solid",
    });
    polyline.setMap(map);
    polylineRef.current = polyline;

    return () => {
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
    };
  }, [history, map, colorIndex]);

  return null;
}

export default function MapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const myOverlayRef = useRef<KakaoCustomOverlay | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [showRoutes, setShowRoutes] = useState(true);
  const [myPosition, setMyPosition] = useState<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const hasAutoStartedRef = useRef(false);
  const { toast } = useToast();
  const { isChildMode, activeChild } = useDeviceUser();

  const { data: locations } = useGetFamilyLocations({
    query: { refetchInterval: 3000 },
  });

  const updateLocation = useUpdateMyLocation();

  const sendLocation = useCallback((lat: number, lng: number, accuracy?: number) => {
    if (isChildMode && activeChild) {
      updateLocation.mutate({ data: { lat, lng, accuracy, childId: activeChild.id } });
    }
    setMyPosition({ lat, lng });
  }, [updateLocation, isChildMode, activeChild]);

  useEffect(() => {
    if (!VITE_KAKAO_JS_KEY) {
      setSdkError("카카오 지도 키가 설정되지 않았습니다.");
      return;
    }
    loadKakaoSdk(VITE_KAKAO_JS_KEY)
      .then(() => setMapReady(true))
      .catch(() => setSdkError("카카오 지도 SDK 로드 실패"));
  }, []);

  useEffect(() => {
    if (!mapReady || !mapContainerRef.current || mapRef.current) return;
    const map = new window.kakao.maps.Map(mapContainerRef.current, {
      center: new window.kakao.maps.LatLng(37.5665, 126.9780),
      level: 8,
    });
    mapRef.current = map;
  }, [mapReady]);

  const childLocationsFromServer = (locations ?? []).filter(loc => !loc.isMe);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current = [];

    const bounds = new window.kakao.maps.LatLngBounds();
    let hasPoint = false;

    childLocationsFromServer.forEach((loc, idx) => {
      const color = COLORS[idx % COLORS.length];
      const latlng = new window.kakao.maps.LatLng(loc.lat, loc.lng);
      bounds.extend(latlng);
      hasPoint = true;

      const label = loc.name.slice(0, 2);
      const content = `
        <div style="
          background:${color};color:#fff;border-radius:50%;
          width:38px;height:38px;display:flex;align-items:center;
          justify-content:center;font-size:11px;font-weight:700;
          border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);
          transform:translateX(-50%) translateY(-50%);
          white-space:nowrap;
        ">${label}</div>
        <div style="
          position:absolute;left:50%;transform:translateX(-50%);
          top:22px;background:rgba(0,0,0,0.7);color:#fff;
          padding:2px 6px;border-radius:4px;font-size:10px;white-space:nowrap;
        ">${loc.name}</div>
      `;
      const overlay = new window.kakao.maps.CustomOverlay({
        position: latlng,
        content,
        zIndex: 5,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });

    if (hasPoint) {
      map.setBounds(bounds, 80, 80, 80, 80);
      const lvl = map.getLevel();
      if (lvl < 4) map.setLevel(4);
    }
  }, [locations]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    myOverlayRef.current?.setMap(null);
    myOverlayRef.current = null;

    if (!myPosition) return;

    const latlng = new window.kakao.maps.LatLng(myPosition.lat, myPosition.lng);
    const content = `
      <div style="
        background:#6b7280;color:#fff;border-radius:50%;
        width:38px;height:38px;display:flex;align-items:center;
        justify-content:center;font-size:11px;font-weight:700;
        border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);
        transform:translateX(-50%) translateY(-50%);
        white-space:nowrap;
      ">나</div>
      <div style="
        position:absolute;left:50%;transform:translateX(-50%);
        top:22px;background:rgba(0,0,0,0.7);color:#fff;
        padding:2px 6px;border-radius:4px;font-size:10px;white-space:nowrap;
      ">나 (내 위치)</div>
    `;
    const overlay = new window.kakao.maps.CustomOverlay({
      position: latlng,
      content,
      zIndex: 10,
    });
    overlay.setMap(map);
    myOverlayRef.current = overlay;
  }, [myPosition, mapReady]);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ title: "GPS 불가", description: "이 기기는 GPS를 지원하지 않습니다.", variant: "destructive" });
      return;
    }
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        sendLocation(lat, lng, accuracy);
        lastSentPosRef.current = { lat, lng };
      },
      () => {
        toast({ title: "위치 권한 필요", description: "위치 권한을 허용해주세요.", variant: "destructive" });
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setMyPosition({ lat, lng });
        const last = lastSentPosRef.current;
        if (!last || calcDistanceMeters(last.lat, last.lng, lat, lng) >= MIN_SEND_DISTANCE_M) {
          sendLocation(lat, lng, accuracy);
          lastSentPosRef.current = { lat, lng };
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  }, [toast, sendLocation]);

  useEffect(() => {
    if (mapReady && !hasAutoStartedRef.current) {
      hasAutoStartedRef.current = true;
      startTracking();
    }
  }, [mapReady, startTracking]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const rawChildLocations = locations?.filter(loc => loc.childId != null) ?? [];
  const childLocations = rawChildLocations.filter(
    (loc, idx, arr) => arr.findIndex(l => l.childId === loc.childId) === idx
  );

  if (sdkError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{sdkError}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">아이 위치</h1>
        {isChildMode && activeChild ? (
          <p className="text-sm text-muted-foreground">{activeChild.name} 모드로 공유 중</p>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <Shield className="w-3 h-3 flex-shrink-0" />
            <span>내 위치 정보는 다른 가족 구성원에게 공유되지 않습니다.</span>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {childLocations.length > 0 && (
          <button
            onClick={() => setShowRoutes(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showRoutes
                ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Route className="w-4 h-4" />
            {showRoutes ? "경로 숨기기" : "경로 보기"}
          </button>
        )}
      </div>

      <div className="relative rounded-2xl overflow-hidden border border-border bg-muted" style={{ height: "55vh" }}>
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
        <div ref={mapContainerRef} className="w-full h-full" />
        {mapReady && mapRef.current && showRoutes && childLocations.map((loc, idx) => {
          const globalIdx = locations?.indexOf(loc) ?? idx;
          return (
            <ChildPolyline
              key={`polyline-${loc.childId}`}
              childId={loc.childId!}
              colorIndex={globalIdx}
              map={mapRef.current!}
            />
          );
        })}
      </div>

      {childLocations.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">아이 위치 목록</h2>
          <div className="flex flex-col gap-2">
            {childLocations.map((loc, idx) => {
              const color = COLORS[idx % COLORS.length];
              const now = Date.now();
              const updatedMs = new Date(loc.updatedAt).getTime();
              const diffMin = Math.round((now - updatedMs) / 60000);
              const timeLabel = diffMin < 1 ? "방금" : diffMin < 60 ? `${diffMin}분 전` : `${Math.round(diffMin / 60)}시간 전`;
              return (
                <div key={`${loc.userId}-${loc.childId ?? 'parent'}`} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: color }}
                  >
                    {loc.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{loc.name}</p>
                    <p className="text-xs text-muted-foreground">{timeLabel} 업데이트</p>
                  </div>
                  {loc.accuracy !== null && loc.accuracy !== undefined && (
                    <span className="text-xs text-muted-foreground">±{Math.round(loc.accuracy)}m</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {childLocations.length === 0 && mapReady && (
        <div className="bg-card rounded-2xl border border-border p-6 text-center">
          <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">아이의 위치가 없습니다.</p>
          <p className="text-xs text-muted-foreground mt-1">아이 기기에서 위치를 공유하면 여기에 표시됩니다.</p>
        </div>
      )}
    </div>
  );
}
