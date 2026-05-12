import { Link } from "wouter";

export function BusinessFooter() {
  return (
    <footer className="mt-8 pt-4 border-t border-border/30 text-center space-y-1">
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
      <p className="text-[10px] text-muted-foreground/60 pt-1">
        <Link href="/terms" className="underline underline-offset-2">
          서비스 이용 약관
        </Link>
      </p>
    </footer>
  );
}
