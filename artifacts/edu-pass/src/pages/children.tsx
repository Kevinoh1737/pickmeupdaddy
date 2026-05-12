import { useGetChildren, getGetChildrenQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, User, Settings } from "lucide-react";

export default function ChildrenPage() {
  const { data: children, isLoading } = useGetChildren({ query: { queryKey: getGetChildrenQueryKey() } });

  return (
    <div className="space-y-4" data-testid="children-page">
      <h1 className="text-xl font-bold text-foreground">일정</h1>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (children as any[])?.length ? (
        <div className="space-y-3">
          {(children as any[]).map((child: any) => (
            <Link key={child.id} href={`/children/${child.id}/schedules`}>
              <Card className="cursor-pointer hover:bg-muted/30 transition-colors" data-testid={`card-child-${child.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground" data-testid={`text-child-name-${child.id}`}>{child.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <span>일정 추가</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <User className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">등록된 아이가 없습니다</p>
            <p className="text-xs text-muted-foreground mb-4">설정에서 아이를 추가하세요</p>
            <Link href="/settings">
              <Button variant="outline" size="sm" className="gap-1" data-testid="button-go-settings">
                <Settings className="w-4 h-4" />
                설정으로 이동
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
