import { ArrowUpRight, CheckCircle as CheckCircle2, CircleNotch as Loader2, Robot as Bot } from '@phosphor-icons/react'
import type { ClaudeCodeStatus } from '../hooks/useClaudeCodeStatus'
import { openExternalUrl } from '../utils/url'
import { Button } from './ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card'

const CLAUDE_CODE_INSTALL_URL = 'https://docs.anthropic.com/en/docs/claude-code'

interface ClaudeCodeOnboardingPromptProps {
  status: ClaudeCodeStatus
  onContinue: () => void
}

function getPromptCopy(status: ClaudeCodeStatus) {
  if (status === 'installed') {
    return {
      accentClassName: 'bg-[var(--feedback-success-bg)] text-[var(--feedback-success-text)]',
      description: 'HS-Hub의 AI 기능을 사용할 준비가 되었습니다.',
      icon: <CheckCircle2 className="size-7" />,
      title: 'Claude Code가 감지되었습니다',
    }
  }

  if (status === 'missing') {
    return {
      accentClassName: 'bg-[var(--feedback-warning-bg)] text-[var(--feedback-warning-text)]',
      description: 'AI 코딩 에이전트를 설치하면 HS-Hub를 더 효과적으로 사용할 수 있습니다.',
      icon: <Bot className="size-7" />,
      title: 'Claude Code를 찾을 수 없습니다',
    }
  }

  return {
    accentClassName: 'bg-muted text-muted-foreground',
    description: '이 기기에서 Claude Code를 사용할 수 있는지 확인하는 중입니다.',
    icon: <Loader2 className="size-7 animate-spin" />,
    title: 'Claude Code 확인 중',
  }
}

export function ClaudeCodeOnboardingPrompt({
  status,
  onContinue,
}: ClaudeCodeOnboardingPromptProps) {
  const copy = getPromptCopy(status)

  return (
    <div
      className="flex h-full w-full items-center justify-center bg-sidebar px-6 py-10"
      data-testid="claude-onboarding-screen"
    >
      <Card className="w-full max-w-2xl border-border bg-background shadow-sm">
        <CardHeader className="items-center gap-5 text-center">
          <div className={`flex size-16 items-center justify-center rounded-2xl ${copy.accentClassName}`}>
            {copy.icon}
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl tracking-tight">
              {copy.title}
            </CardTitle>
            <p className="text-sm leading-6 text-muted-foreground" data-testid="claude-onboarding-description">
              {status === 'installed' && '✅ '}
              {status === 'missing' && '🤖 '}
              {copy.description}
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 text-center">
          {status === 'missing' && (
            <p className="text-sm leading-6 text-muted-foreground">
              AI 기반 노트 관리를 사용하려면 Claude Code를 설치하세요.
            </p>
          )}
        </CardContent>

        <CardFooter className="justify-center gap-3">
          {status === 'missing' && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void openExternalUrl(CLAUDE_CODE_INSTALL_URL)}
              data-testid="claude-onboarding-install"
            >
              Claude Code 설치
              <ArrowUpRight className="size-4" />
            </Button>
          )}
          <Button
            type="button"
            onClick={onContinue}
            disabled={status === 'checking'}
            data-testid="claude-onboarding-continue"
          >
            {status === 'missing' ? '설치 없이 계속' : status === 'installed' ? '계속' : '확인 중…'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
