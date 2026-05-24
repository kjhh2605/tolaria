import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TelemetryConsentDialog } from './TelemetryConsentDialog'

const dragRegionMouseDown = vi.fn()

vi.mock('../hooks/useDragRegion', () => ({
  useDragRegion: () => ({ onMouseDown: dragRegionMouseDown }),
}))

describe('TelemetryConsentDialog', () => {
  it('renders the consent dialog', () => {
    render(<TelemetryConsentDialog onAccept={vi.fn()} onDecline={vi.fn()} />)
    expect(screen.getByText('HS-Hub 개선에 참여하기')).toBeDefined()
    expect(screen.getByText(/익명 오류 보고서/i)).toBeDefined()
  })

  it('calls onAccept when 익명 보고 허용 button is clicked', () => {
    const onAccept = vi.fn()
    render(<TelemetryConsentDialog onAccept={onAccept} onDecline={vi.fn()} />)
    fireEvent.click(screen.getByTestId('telemetry-accept'))
    expect(onAccept).toHaveBeenCalledOnce()
  })

  it('calls onDecline when 괜찮습니다 button is clicked', () => {
    const onDecline = vi.fn()
    render(<TelemetryConsentDialog onAccept={vi.fn()} onDecline={onDecline} />)
    fireEvent.click(screen.getByTestId('telemetry-decline'))
    expect(onDecline).toHaveBeenCalledOnce()
  })

  it('shows a details section explaining what data is shared', () => {
    render(<TelemetryConsentDialog onAccept={vi.fn()} onDecline={vi.fn()} />)
    expect(screen.getByText(/볼트 내용, 노트 제목/i)).toBeDefined()
  })

  it('focuses the first action for keyboard users', () => {
    render(<TelemetryConsentDialog onAccept={vi.fn()} onDecline={vi.fn()} />)
    expect(screen.getByTestId('telemetry-decline')).toHaveFocus()
  })

  it('uses the surrounding surface as a drag region and excludes the dialog card', () => {
    render(<TelemetryConsentDialog onAccept={vi.fn()} onDecline={vi.fn()} />)

    const shell = screen.getByTestId('telemetry-consent-shell')
    fireEvent.mouseDown(shell)

    expect(dragRegionMouseDown).toHaveBeenCalledOnce()
    expect(shell.querySelector('[data-no-drag]')).not.toBeNull()
  })
})
