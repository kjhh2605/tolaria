import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedbackDialog } from './FeedbackDialog'
import { APP_COMMAND_EVENT_NAME, APP_COMMAND_IDS } from '../hooks/appCommandDispatcher'
import { rememberFeedbackDialogOpener } from '../lib/feedbackDialogOpener'

describe('FeedbackDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders the local diagnostics flow when open', () => {
    render(<FeedbackDialog open={true} onClose={vi.fn()} buildNumber="b281" releaseChannel="alpha" />)
    expect(screen.getByTestId('feedback-dialog')).toBeInTheDocument()
    expect(screen.getByText('Help improve HS-Hub')).toBeInTheDocument()
    expect(screen.getByText(/does not ship public community links/i)).toBeInTheDocument()
    expect(screen.getByText('Report an issue')).toBeInTheDocument()
    expect(screen.getByText(/share them with your HS-Hub maintainer/i)).toBeInTheDocument()
    expect(screen.queryByText('Sponsor / Support')).not.toBeInTheDocument()
    expect(screen.queryByText('Feature requests')).not.toBeInTheDocument()
    expect(screen.queryByText('Discussions')).not.toBeInTheDocument()
    expect(screen.queryByText('Contribute code')).not.toBeInTheDocument()
  })

  it('focuses the diagnostics copy CTA when opened', async () => {
    render(<FeedbackDialog open={true} onClose={vi.fn()} buildNumber="b281" releaseChannel={null} />)
    const cta = screen.getByRole('button', { name: 'Copy sanitized diagnostics' })
    await waitFor(() => expect(cta).toHaveFocus())
  })

  it('does not render external contribution CTAs', () => {
    render(<FeedbackDialog open={true} onClose={vi.fn()} buildNumber="b281" releaseChannel={null} />)

    expect(screen.queryByRole('button', { name: 'Open Product Board' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Discussions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Pull Requests' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Contributing Guide' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open GitHub Issues' })).not.toBeInTheDocument()
  })

  it('copies a sanitized diagnostic bundle', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<FeedbackDialog open={true} onClose={vi.fn()} buildNumber="b281" releaseChannel="alpha" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy sanitized diagnostics' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0]?.[0]).toContain('HS-Hub sanitized diagnostics')
    expect(writeText.mock.calls[0]?.[0]).toContain('Build: b281')
    expect(writeText.mock.calls[0]?.[0]).toContain('Release channel: alpha')
    expect(screen.getByText('Diagnostics copied.')).toBeInTheDocument()
  })

  it('shows a local fallback when diagnostics cannot be copied', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('blocked'))
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<FeedbackDialog open={true} onClose={vi.fn()} buildNumber="b281" releaseChannel={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy sanitized diagnostics' }))

    expect(await screen.findByText(/Clipboard access is unavailable/i)).toBeInTheDocument()
  })

  it('closes when pressing Escape', () => {
    const onClose = vi.fn()
    render(<FeedbackDialog open={true} onClose={onClose} buildNumber="b281" releaseChannel={null} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes when clicking the top-right Close control', () => {
    const onClose = vi.fn()
    render(<FeedbackDialog open={true} onClose={onClose} buildNumber="b281" releaseChannel={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('reopens the command palette after closing when launched from it', () => {
    vi.useFakeTimers()

    const opener = document.createElement('input')
    opener.setAttribute('placeholder', 'Type a command...')
    document.body.appendChild(opener)
    rememberFeedbackDialogOpener(opener)

    const onClose = vi.fn()
    const handleReopen = vi.fn()
    window.addEventListener(APP_COMMAND_EVENT_NAME, handleReopen)

    const { rerender } = render(
      <FeedbackDialog open={false} onClose={onClose} buildNumber="b281" releaseChannel={null} />,
    )

    rerender(<FeedbackDialog open={true} onClose={onClose} buildNumber="b281" releaseChannel={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    vi.advanceTimersByTime(100)

    expect(onClose).toHaveBeenCalledOnce()
    expect(handleReopen).toHaveBeenCalledTimes(1)
    expect(handleReopen.mock.calls[0]?.[0]).toMatchObject({
      detail: APP_COMMAND_IDS.viewCommandPalette,
    })

    window.removeEventListener(APP_COMMAND_EVENT_NAME, handleReopen)
    opener.remove()
    vi.useRealTimers()
  })
})
