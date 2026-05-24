import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClaudeCodeOnboardingPrompt } from './ClaudeCodeOnboardingPrompt'

const openExternalUrl = vi.fn()

vi.mock('../utils/url', () => ({
  openExternalUrl: (...args: unknown[]) => openExternalUrl(...args),
}))

describe('ClaudeCodeOnboardingPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the detected state with a continue action', () => {
    render(<ClaudeCodeOnboardingPrompt status="installed" onContinue={vi.fn()} />)

    expect(screen.getByText('Claude Code가 감지되었습니다')).toBeInTheDocument()
    expect(screen.getByTestId('claude-onboarding-continue')).toHaveTextContent('계속')
    expect(screen.queryByTestId('claude-onboarding-install')).not.toBeInTheDocument()
  })

  it('shows the install path when Claude Code is missing', () => {
    render(<ClaudeCodeOnboardingPrompt status="missing" onContinue={vi.fn()} />)

    expect(screen.getByText('Claude Code를 찾을 수 없습니다')).toBeInTheDocument()
    expect(screen.getByText('AI 기반 노트 관리를 사용하려면 Claude Code를 설치하세요.')).toBeInTheDocument()
    expect(screen.getByTestId('claude-onboarding-install')).toBeInTheDocument()
    expect(screen.getByTestId('claude-onboarding-continue')).toHaveTextContent('설치 없이 계속')
  })

  it('opens the Claude Code install page', () => {
    render(<ClaudeCodeOnboardingPrompt status="missing" onContinue={vi.fn()} />)

    fireEvent.click(screen.getByTestId('claude-onboarding-install'))

    expect(openExternalUrl).toHaveBeenCalledWith('https://docs.anthropic.com/en/docs/claude-code')
  })

  it('calls onContinue from the detected state', () => {
    const onContinue = vi.fn()
    render(<ClaudeCodeOnboardingPrompt status="installed" onContinue={onContinue} />)

    fireEvent.click(screen.getByTestId('claude-onboarding-continue'))

    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('disables continue while detection is still running', () => {
    render(<ClaudeCodeOnboardingPrompt status="checking" onContinue={vi.fn()} />)

    expect(screen.getByText('Claude Code 확인 중')).toBeInTheDocument()
    expect(screen.getByTestId('claude-onboarding-continue')).toBeDisabled()
  })
})
