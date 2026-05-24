import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { WelcomeScreen } from './WelcomeScreen'
import hsHubIcon from '@/assets/hs-hub-icon.svg'

const dragRegionMouseDown = vi.fn()

vi.mock('../hooks/useDragRegion', () => ({
  useDragRegion: () => ({ onMouseDown: dragRegionMouseDown }),
}))

const defaultProps = {
  mode: 'welcome' as const,
  defaultVaultPath: '~/Documents/HS-Hub',
  onCreateVault: vi.fn(),
  onRetryCreateVault: vi.fn(),
  onCreateEmptyVault: vi.fn(),
  onOpenFolder: vi.fn(),
  isOffline: false,
  creatingAction: null as 'template' | 'empty' | null,
  error: null,
  canRetryTemplate: false,
}

describe('WelcomeScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('welcome mode', () => {
    it('renders welcome title and subtitle', () => {
      render(<WelcomeScreen {...defaultProps} />)
      expect(screen.getByText('HS-Hub에 오신 것을 환영합니다')).toBeInTheDocument()
      expect(screen.getByText('한성대학교를 위한 AI 시대의 마크다운 지식 관리')).toBeInTheDocument()
    })

    it('renders the local HS-Hub branding icon', () => {
      render(<WelcomeScreen {...defaultProps} />)

      const brandIcon = screen.getByAltText('HS-Hub 아이콘')
      expect(brandIcon).toHaveAttribute('src', hsHubIcon)
    })

    it('shows the onboarding actions in the guided-first order', () => {
      render(<WelcomeScreen {...defaultProps} />)

      const optionButtons = screen.getAllByRole('button')
      expect(optionButtons[0]).toBe(screen.getByTestId('welcome-create-vault'))
      expect(optionButtons[1]).toBe(screen.getByTestId('welcome-create-new'))
      expect(optionButtons[2]).toBe(screen.getByTestId('welcome-open-folder'))
    })

    it('focuses the first action for keyboard users', () => {
      render(<WelcomeScreen {...defaultProps} />)
      expect(screen.getByTestId('welcome-create-vault')).toHaveFocus()
    })

    it('shows the simplified template option description', () => {
      render(<WelcomeScreen {...defaultProps} />)
      expect(screen.getByText('시작 가이드 볼트를 다운로드합니다')).toBeInTheDocument()
      expect(screen.queryByText(/~\/Documents\/HS-Hub/)).not.toBeInTheDocument()
    })

    it('shows offline guidance and disables the template option when offline', () => {
      render(<WelcomeScreen {...defaultProps} isOffline={true} />)
      expect(screen.getByTestId('welcome-create-vault')).toBeDisabled()
      expect(screen.getByText(/인터넷 연결이 필요합니다 — 나중에 복제할 수 있습니다/)).toBeInTheDocument()
    })

    it('calls onCreateEmptyVault when create empty button is clicked', () => {
      const onCreateEmptyVault = vi.fn()
      render(<WelcomeScreen {...defaultProps} onCreateEmptyVault={onCreateEmptyVault} />)
      fireEvent.click(screen.getByTestId('welcome-create-new'))
      expect(onCreateEmptyVault).toHaveBeenCalledOnce()
    })

    it('calls onCreateEmptyVault when create empty button is activated with Enter', () => {
      const onCreateEmptyVault = vi.fn()
      render(<WelcomeScreen {...defaultProps} onCreateEmptyVault={onCreateEmptyVault} />)
      const button = screen.getByTestId('welcome-create-new')

      button.focus()
      fireEvent.keyDown(button, { key: 'Enter' })

      expect(onCreateEmptyVault).toHaveBeenCalledOnce()
    })

    it('calls onCreateEmptyVault when create empty button is activated with Space', () => {
      const onCreateEmptyVault = vi.fn()
      render(<WelcomeScreen {...defaultProps} onCreateEmptyVault={onCreateEmptyVault} />)
      const button = screen.getByTestId('welcome-create-new')

      button.focus()
      fireEvent.keyDown(button, { key: ' ' })

      expect(onCreateEmptyVault).toHaveBeenCalledOnce()
    })

    it('calls onCreateVault when template button is clicked', () => {
      const onCreateVault = vi.fn()
      render(<WelcomeScreen {...defaultProps} onCreateVault={onCreateVault} />)
      fireEvent.click(screen.getByTestId('welcome-create-vault'))
      expect(onCreateVault).toHaveBeenCalledOnce()
    })

    it('calls onOpenFolder when open folder button is clicked', () => {
      const onOpenFolder = vi.fn()
      render(<WelcomeScreen {...defaultProps} onOpenFolder={onOpenFolder} />)
      fireEvent.click(screen.getByTestId('welcome-open-folder'))
      expect(onOpenFolder).toHaveBeenCalledOnce()
    })

    it('cycles onboarding actions with Tab and activates the selected action with Enter', () => {
      const onCreateEmptyVault = vi.fn()
      render(<WelcomeScreen {...defaultProps} onCreateEmptyVault={onCreateEmptyVault} />)

      fireEvent.keyDown(window, { key: 'Tab' })
      fireEvent.keyDown(window, { key: 'Enter' })

      expect(onCreateEmptyVault).toHaveBeenCalledOnce()
    })

    it('disables all buttons while creating', () => {
      render(<WelcomeScreen {...defaultProps} creatingAction="template" />)
      expect(screen.getByTestId('welcome-create-new')).toBeDisabled()
      expect(screen.getByTestId('welcome-open-folder')).toBeDisabled()
      expect(screen.getByTestId('welcome-create-vault')).toBeDisabled()
    })

    it('shows loading text on template button while creating', () => {
      render(<WelcomeScreen {...defaultProps} creatingAction="template" />)
      expect(screen.getByTestId('welcome-create-vault')).toHaveTextContent(/시작 가이드 다운로드 중/)
      expect(screen.getByTestId('welcome-status')).toHaveAttribute('aria-live', 'polite')
    })

    it('shows loading text on create-new button while creating an empty vault', () => {
      render(<WelcomeScreen {...defaultProps} creatingAction="empty" />)
      expect(screen.getByTestId('welcome-create-new')).toHaveTextContent(/볼트 생성 중/)
    })

    it('shows error message when error is set', () => {
      render(<WelcomeScreen {...defaultProps} error="Permission denied" />)
      expect(screen.getByTestId('welcome-error')).toHaveTextContent('Permission denied')
      expect(screen.getByTestId('welcome-error')).toHaveAttribute('aria-live', 'assertive')
    })

    it('does not show error when error is null', () => {
      render(<WelcomeScreen {...defaultProps} />)
      expect(screen.queryByTestId('welcome-error')).not.toBeInTheDocument()
    })

    it('shows a retry button after template download errors', () => {
      const onRetryCreateVault = vi.fn()
      render(
        <WelcomeScreen
          {...defaultProps}
          error="시작 가이드 볼트를 다운로드할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요."
          canRetryTemplate={true}
          onRetryCreateVault={onRetryCreateVault}
        />,
      )

      fireEvent.click(screen.getByTestId('welcome-retry-template'))
      expect(onRetryCreateVault).toHaveBeenCalledOnce()
    })

    it('does not show path badge in welcome mode', () => {
      render(<WelcomeScreen {...defaultProps} />)
      expect(screen.queryByText('~/HS-Hub')).not.toBeInTheDocument()
    })
  })

  describe('vault-missing mode', () => {
    const missingProps = {
      ...defaultProps,
      mode: 'vault-missing' as const,
      missingPath: '~/HS-Hub',
    }

    it('renders vault not found title', () => {
      render(<WelcomeScreen {...missingProps} />)
      expect(screen.getByText('볼트를 찾을 수 없습니다')).toBeInTheDocument()
      expect(screen.getByText(/디스크에서 찾을 수 없습니다/)).toBeInTheDocument()
    })

    it('does not show the missing vault path in a badge', () => {
      render(<WelcomeScreen {...missingProps} />)
      expect(screen.queryByText('~/HS-Hub')).not.toBeInTheDocument()
    })

    it('shows "다른 폴더 선택" instead of "Open existing vault"', () => {
      render(<WelcomeScreen {...missingProps} />)
      expect(screen.getByTestId('welcome-open-folder')).toHaveTextContent('다른 폴더 선택')
    })
  })

  describe('data-testid', () => {
    it('has welcome-screen container testid', () => {
      render(<WelcomeScreen {...defaultProps} />)
      expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
    })

    it('uses the surrounding surface as a drag region and excludes the card', () => {
      render(<WelcomeScreen {...defaultProps} />)

      const screenContainer = screen.getByTestId('welcome-screen')
      fireEvent.mouseDown(screenContainer)

      expect(dragRegionMouseDown).toHaveBeenCalledOnce()
      expect(screenContainer.querySelector('[data-no-drag]')).not.toBeNull()
    })
  })
})
