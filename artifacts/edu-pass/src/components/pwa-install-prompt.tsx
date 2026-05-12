import { useState, useEffect } from "react";
import { X, Share, PlusSquare, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed) return;

    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && (navigator as any).standalone);
    if (isStandalone) return;

    const ua = navigator.userAgent;
    const iosDevice = /iPhone|iPad|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);

    if (iosDevice && isSafari) {
      setIsIos(true);
      setShow(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    }
    setShow(false);
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-install-dismissed", Date.now().toString());
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white border border-teal-200 rounded-2xl shadow-lg p-4">
        <button onClick={handleDismiss} className="absolute top-3 right-3 text-muted-foreground">
          <X className="w-4 h-4" />
        </button>

        {isIos ? (
          <div className="space-y-2">
            <p className="font-semibold text-sm text-foreground">홈 화면에 추가하기</p>
            <p className="text-xs text-muted-foreground">
              PickMeUpDaddy를 홈 화면에 추가하면 앱처럼 사용하고 알림도 받을 수 있어요.
            </p>
            <div className="flex items-center gap-2 text-xs text-teal-700 bg-teal-50 rounded-lg p-2.5 mt-2">
              <span className="flex-shrink-0">1.</span>
              <span>하단의</span>
              <Share className="w-4 h-4 flex-shrink-0" />
              <span>공유 버튼을 누르세요</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-teal-700 bg-teal-50 rounded-lg p-2.5">
              <span className="flex-shrink-0">2.</span>
              <PlusSquare className="w-4 h-4 flex-shrink-0" />
              <span>"홈 화면에 추가"를 선택하세요</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <img src="/icons/favicon.png" alt="PickMeUpDaddy" className="w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">앱 설치하기</p>
              <p className="text-xs text-muted-foreground">홈 화면에 추가하여 앱처럼 사용하세요</p>
            </div>
            <Button size="sm" onClick={handleInstall} className="gap-1 flex-shrink-0">
              <Download className="w-3.5 h-3.5" />
              설치
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
