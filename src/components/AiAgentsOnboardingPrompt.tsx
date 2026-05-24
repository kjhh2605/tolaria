import { ArrowUpRight, CheckCircle as CheckCircle2, CircleNotch as Loader2, Cloud, HardDrive, Robot as Bot, Terminal } from '@phosphor-icons/react'
import {
  AI_AGENT_DEFINITIONS,
  getAiAgentAvailability,
  getAiAgentDefinition,
  hasAnyInstalledAiAgent,
  isAiAgentsStatusChecking,
  type AiAgentsStatus,
} from '../lib/aiAgents'
import { openExternalUrl } from '../utils/url'
import { OnboardingShell } from './OnboardingShell'
import { Button } from './ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card'

interface AiAgentsOnboardingPromptProps {
  statuses: AiAgentsStatus
  onContinue: () => void
}

function getPromptCopy(statuses: AiAgentsStatus) {
  if (isAiAgentsStatusChecking(statuses)) {
    return {
      accentClassName: 'bg-muted text-muted-foreground',
      description: '코딩 에이전트를 확인하는 중입니다. 로컬 모델이나 API 제공자도 사용할 수 있습니다.',
      icon: <Loader2 className="size-7 animate-spin" />,
      title: 'AI 에이전트 확인 중',
    }
  }

  if (!hasAnyInstalledAiAgent(statuses)) {
    return {
      accentClassName: 'bg-[var(--feedback-warning-bg)] text-[var(--feedback-warning-text)]',
      description: '로컬 모델, API 제공자 또는 데스크톱 코딩 에이전트를 연결하세요.',
      icon: <Bot className="size-7" />,
      title: 'HS-Hub에서 AI를 사용할 방식을 선택하세요',
    }
  }

  return {
    accentClassName: 'bg-[var(--feedback-success-bg)] text-[var(--feedback-success-text)]',
    description: '감지된 코딩 에이전트를 사용하거나 설정에서 로컬/API 모델을 추가할 수 있습니다.',
    icon: <CheckCircle2 className="size-7" />,
    title: 'AI 사용 준비 완료',
  }
}

function AiModeChoices() {
  const choices = [
    {
      icon: <HardDrive className="size-4" />,
      title: '로컬 모델',
      description: 'Ollama, LM Studio 또는 OpenAI 호환 로컬 엔드포인트를 사용합니다. 보통 API 키가 필요하지 않습니다.',
    },
    {
      icon: <Cloud className="size-4" />,
      title: 'API 제공자',
      description: 'OpenAI, Anthropic, OpenRouter 또는 게이트웨이를 사용합니다. API 키는 설정에 저장하지 않고 환경 변수에서 읽습니다.',
    },
    {
      icon: <Terminal className="size-4" />,
      title: '코딩 에이전트',
      description: 'Claude Code, Codex, OpenCode, Gemini CLI 또는 Pi로 데스크톱에서 도구 기반 볼트 편집을 사용합니다.',
    },
  ]

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {choices.map((choice) => (
        <div key={choice.title} className="rounded-lg border border-border bg-muted/20 p-3 text-left">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            {choice.icon}
            {choice.title}
          </div>
          <div className="text-xs leading-5 text-muted-foreground">{choice.description}</div>
        </div>
      ))}
    </div>
  )
}

function AgentStatusList({ statuses }: { statuses: AiAgentsStatus }) {
  return (
    <div className="space-y-3">
      {AI_AGENT_DEFINITIONS.map((definition) => {
        const status = getAiAgentAvailability(statuses, definition.id)
        const ready = status.status === 'installed'
        return (
          <div
            key={definition.id}
            className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm"
          >
            <div className="space-y-1 text-left">
              <div className="font-medium text-foreground">{definition.label}</div>
              <div className="text-xs text-muted-foreground">
                {ready
                  ? `${definition.label}${status.version ? ` ${status.version}` : ''} 사용 준비가 완료되었습니다.`
                  : `${definition.label}이 아직 설치되지 않았습니다.`}
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-[11px] font-medium ${ready ? 'bg-[var(--feedback-success-bg)] text-[var(--feedback-success-text)]' : 'bg-[var(--feedback-warning-bg)] text-[var(--feedback-warning-text)]'}`}
            >
              {ready ? '설치됨' : '미설치'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function AiAgentsOnboardingPrompt({
  statuses,
  onContinue,
}: AiAgentsOnboardingPromptProps) {
  const copy = getPromptCopy(statuses)
  const showLegacyClaudeCompatibility = getAiAgentAvailability(statuses, 'claude_code').status !== 'installed'
  const missingAgents = AI_AGENT_DEFINITIONS.filter((definition) => getAiAgentAvailability(statuses, definition.id).status === 'missing')

  return (
    <OnboardingShell
      className="bg-sidebar px-6 py-10"
      contentClassName="w-full max-w-2xl"
      testId="ai-agents-onboarding-screen"
    >
      <Card
        className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden border-border bg-background shadow-sm"
        data-testid="ai-agents-onboarding-card"
      >
        <CardHeader className="shrink-0 items-center gap-5 text-center">
          <div className={`flex size-16 items-center justify-center rounded-2xl ${copy.accentClassName}`}>
            {copy.icon}
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl tracking-tight">
              {copy.title}
            </CardTitle>
            <p className="text-sm leading-6 text-muted-foreground" data-testid="ai-agents-onboarding-description">
              {copy.description}
            </p>
          </div>
        </CardHeader>

        <CardContent
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain"
          data-testid="ai-agents-onboarding-scroll"
        >
          <AiModeChoices />
          {showLegacyClaudeCompatibility ? (
            <div
              className="rounded-lg border border-[var(--feedback-warning-border)] bg-[var(--feedback-warning-bg)] px-4 py-3 text-left"
              data-testid="claude-onboarding-screen"
            >
              <div className="text-sm font-medium text-[var(--feedback-warning-text)]">Claude Code를 찾을 수 없습니다</div>
              <p className="mt-1 text-xs leading-5 text-[var(--feedback-warning-text)]">
                Claude Code를 설치하거나 설치 없이 계속할 수 있습니다.
              </p>
            </div>
          ) : null}
          <AgentStatusList statuses={statuses} />
        </CardContent>

        <CardFooter className="shrink-0 flex-wrap justify-center gap-3">
          {missingAgents.map((definition) => (
            <Button
              key={definition.id}
              type="button"
              variant="outline"
              onClick={() => void openExternalUrl(getAiAgentDefinition(definition.id).installUrl)}
              data-testid={`ai-agents-onboarding-install-${definition.id}`}
            >
              {definition.label} 설치
              <ArrowUpRight className="size-4" />
            </Button>
          ))}
          <div data-testid="ai-agents-onboarding-continue">
            <Button
              type="button"
              onClick={onContinue}
              disabled={isAiAgentsStatusChecking(statuses)}
              data-testid={showLegacyClaudeCompatibility ? 'claude-onboarding-continue' : undefined}
            >
              {hasAnyInstalledAiAgent(statuses) ? '계속' : '나중에 설정'}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </OnboardingShell>
  )
}
