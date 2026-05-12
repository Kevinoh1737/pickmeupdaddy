import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, RotateCcw, Search, Loader2, Phone } from "lucide-react";
import { useSearchPlaces } from "@workspace/api-client-react";
import type { PlaceSearchResult } from "@workspace/api-client-react";

export interface KakaoKeywordResult {
  placeName: string;
  address: string;
  lat?: number;
  lng?: number;
  phone?: string;
}

interface KakaoKeywordSearchProps {
  placeName: string;
  address: string;
  onSelect: (result: KakaoKeywordResult) => void;
  onClear: () => void;
  onPlaceNameChange: (name: string) => void;
}

function useUserLocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setCoords(null);
      },
      { timeout: 5000, maximumAge: 60_000 }
    );
  }, []);

  return coords;
}

export default function KakaoKeywordSearch({
  placeName,
  address,
  onSelect,
  onClear,
  onPlaceNameChange,
}: KakaoKeywordSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userLocation = useUserLocation();

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(value);
    }, 400);
  }, []);

  const searchParams = {
    query: debouncedQuery,
    ...(userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : {}),
  };

  const { data: results, isFetching } = useSearchPlaces(
    searchParams,
    {
      query: {
        enabled: debouncedQuery.length >= 2,
        staleTime: 30_000,
      },
    }
  );

  useEffect(() => {
    if (results && results.length > 0 && debouncedQuery.length >= 2) {
      setDropdownOpen(true);
    } else {
      setDropdownOpen(false);
    }
  }, [results, debouncedQuery]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (item: PlaceSearchResult) => {
      onSelect({
        placeName: item.placeName,
        address: item.address,
        lat: item.lat,
        lng: item.lng,
        phone: item.phone,
      });
      setDropdownOpen(false);
      setQuery("");
      setDebouncedQuery("");
    },
    [onSelect]
  );

  if (address) {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Input
            value={placeName}
            onChange={e => onPlaceNameChange(e.target.value)}
            placeholder="장소명을 입력하세요"
            data-testid="input-place-name"
          />
        </div>
        <div className="flex gap-2 items-start">
          <div className="flex-1 relative">
            <MapPin className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              value={address}
              readOnly
              className="pl-8 text-sm bg-muted/50"
              data-testid="input-address"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 h-10 gap-1"
            onClick={onClear}
            data-testid="button-clear-address"
          >
            <RotateCcw className="w-3 h-3" />
            다시 검색
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="학원·학교 이름으로 검색"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            onFocus={() => {
              if (results && results.length > 0 && debouncedQuery.length >= 2) {
                setDropdownOpen(true);
              }
            }}
            data-testid="input-place-search"
          />
        </div>
        {isFetching && (
          <div className="flex items-center px-2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {userLocation && (
        <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          현재 위치 기준 가까운 순으로 표시
        </p>
      )}

      {dropdownOpen && results && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-md shadow-md max-h-60 overflow-y-auto">
          {results.map((item, idx) => (
            <button
              key={idx}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted/60 focus:bg-muted/60 focus:outline-none transition-colors"
              onMouseDown={e => {
                e.preventDefault();
                handleSelect(item);
              }}
              data-testid={`place-result-${idx}`}
            >
              <p className="text-sm font-medium text-foreground">{item.placeName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.address}</p>
              {item.phone && (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Phone className="w-3 h-3 shrink-0" />
                  {item.phone}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {debouncedQuery.length >= 2 && !isFetching && results?.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-md shadow-md px-3 py-3 text-sm text-muted-foreground text-center">
          검색 결과가 없습니다
        </div>
      )}
    </div>
  );
}
