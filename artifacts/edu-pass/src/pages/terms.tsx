import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

const SECTIONS = [
  {
    title: "제1조 (목적)",
    content: `이 약관은 주식회사 신티아(이하 "회사")가 운영하는 픽미업대디(PickMeUpDaddy) 서비스(이하 "서비스")의 이용에 관한 조건 및 절차, 회사와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.`,
  },
  {
    title: "제2조 (용어의 정의)",
    content: `① "서비스"란 회사가 제공하는 가족 일정 관리, 자녀 픽업 조율, 통근 경로 최적화 등 모바일·웹 기반 서비스 일체를 말합니다.
② "이용자"란 이 약관에 동의하고 서비스를 이용하는 개인을 말합니다.
③ "계정"이란 이용자가 서비스 이용을 위해 생성한 고유 식별 정보를 말합니다.
④ "가족 그룹"이란 서비스 내에서 일정을 공유하는 이용자 집합을 말합니다.`,
  },
  {
    title: "제3조 (약관의 효력 및 변경)",
    content: `① 이 약관은 서비스 화면에 게시하거나 이용자에게 고지함으로써 효력이 발생합니다.
② 회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 적용 일자 및 사유를 7일 전에 공지합니다.
③ 이용자가 변경된 약관에 동의하지 않을 경우 서비스 이용을 중단하고 탈퇴할 수 있습니다.`,
  },
  {
    title: "제4조 (서비스 이용 계약의 성립)",
    content: `① 이용자가 약관의 내용에 동의하고 회원 가입을 신청하면 서비스 이용 계약이 성립됩니다.
② 회사는 다음 각 호에 해당하는 경우 가입을 거절하거나 취소할 수 있습니다.
• 실명이 아니거나 타인의 정보를 도용한 경우
• 허위 정보를 기재한 경우
• 만 14세 미만인 경우
• 기타 회사 정책에 위반되는 경우`,
  },
  {
    title: "제5조 (서비스 제공 및 변경)",
    content: `① 회사는 다음과 같은 서비스를 제공합니다.
• 가족 일정 스마트 플래너
• 자녀 픽업 담당 배정 및 조율
• 출발 알림(LeaveAt) 및 SOS 전달 기능
• 가족 공유 장소 관리
• 소셜 로그인(카카오, Google) 연동
② 회사는 운영·기술상 필요에 따라 서비스 내용을 변경할 수 있으며, 중요한 변경 사항은 사전 공지합니다.`,
  },
  {
    title: "제6조 (서비스 이용 제한)",
    content: `① 이용자는 다음 행위를 하여서는 안 됩니다.
• 타인의 계정 또는 개인정보 무단 이용
• 서비스의 정상적인 운영을 방해하는 행위
• 허위 정보 등록 또는 유포
• 관련 법령을 위반하는 행위
② 회사는 위반 시 사전 통지 없이 서비스 이용을 제한하거나 계정을 해지할 수 있습니다.`,
  },
  {
    title: "제7조 (개인정보 보호)",
    content: `회사는 관련 법령이 정하는 바에 따라 이용자의 개인정보를 보호하며, 개인정보 처리방침을 서비스 내에 공개합니다.`,
  },
  {
    title: "제8조 (회사의 의무)",
    content: `① 회사는 안정적인 서비스 제공을 위해 최선을 다합니다.
② 회사는 이용자의 개인정보를 본인의 동의 없이 제3자에게 제공하지 않습니다.
③ 시스템 점검·장애·천재지변 등 불가피한 사유로 서비스가 중단될 수 있으며, 이 경우 사전 또는 사후 공지합니다.`,
  },
  {
    title: "제9조 (이용자의 의무)",
    content: `① 이용자는 이 약관 및 관련 법령을 준수해야 합니다.
② 이용자는 계정 정보를 타인과 공유하거나 양도하지 않아야 합니다.
③ 이용자는 서비스 내 가족 그룹 구성원의 개인정보를 적법하게 처리해야 합니다.`,
  },
  {
    title: "제10조 (서비스 이용 요금)",
    content: `① 기본 서비스는 무료로 제공됩니다.
② 유료 서비스가 추가될 경우 별도 공지 후 적용되며, 이용자의 사전 동의를 받습니다.`,
  },
  {
    title: "제11조 (면책 조항)",
    content: `① 회사는 천재지변, 전쟁, 기간통신사업자의 서비스 중단 등 불가항력으로 인한 서비스 장애에 대해 책임을 지지 않습니다.
② 이용자의 귀책 사유로 인한 서비스 이용 장애에 대해 회사는 책임을 지지 않습니다.
③ 이용자가 서비스를 통해 기대하는 수익·성과를 얻지 못한 경우 회사는 책임을 지지 않습니다.`,
  },
  {
    title: "제12조 (분쟁 해결)",
    content: `① 서비스 이용과 관련하여 분쟁이 발생할 경우 상호 협의하여 해결합니다.
② 협의가 이루어지지 않을 경우 회사 소재지를 관할하는 법원을 전속 관할 법원으로 합니다.`,
  },
];

export default function TermsPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b border-border/40 px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 -ml-2"
          onClick={() => history.length > 1 ? history.back() : setLocation("/")}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-base font-semibold">서비스 이용 약관</h1>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>시행일: 2024년 1월 1일</span>
          <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-medium">버전 v1.0</span>
        </div>

        {SECTIONS.map((section) => (
          <section key={section.title} className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
              {section.content}
            </p>
          </section>
        ))}

        <section className="space-y-2 pt-4 border-t border-border/30">
          <h2 className="text-sm font-semibold text-foreground">부칙</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            이 약관은 2024년 1월 1일부터 시행합니다.
          </p>
        </section>

        <footer className="pt-4 border-t border-border/30 space-y-1 pb-8">
          <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
            상호: 주식회사 신티아 | 대표자: 오진환 | 사업자번호: 167-88-01746
          </p>
          <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
            통신판매업: 2024-서울강남-00719
          </p>
          <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
            서울시 동작구 노량진로 10, 서울창업센터 동작 202호
          </p>
          <p className="text-[10px] text-muted-foreground/60">
            고객센터:{" "}
            <a href="mailto:business@synthya.ai" className="underline underline-offset-2">
              business@synthya.ai
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
