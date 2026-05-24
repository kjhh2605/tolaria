import { Bug, Check, Copy, Megaphone } from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { HS_HUB_SUPPORT_CONTACT_LABEL } from '../constants/feedback'
import {
  buildSanitizedDiagnosticBundle,
  startFeedbackDiagnosticsCapture,
} from '../lib/feedbackDiagnostics'
import { takeFeedbackDialogOpener } from '../lib/feedbackDialogOpener'
import { useBuildNumber } from '../hooks/useBuildNumber'
import { APP_COMMAND_EVENT_NAME, APP_COMMAND_IDS } from '../hooks/appCommandDispatcher'

interface FeedbackDialogProps {
  open: boolean
  onClose: () => void
  buildNumber?: string
  releaseChannel?: string | null
}

const EMPTY_DIALOG_OPENER: ReturnType<typeof takeFeedbackDialogOpener> = {
  element: null,
  reopenCommandPalette: false,
}

function getCopyDiagnosticsLabel(copyState: 'idle' | 'copied' | 'failed') {
  return copyState === 'copied' ? 'Diagnostics copied' : 'Copy sanitized diagnostics'
}

function DiagnosticsActions({
  copyState,
  canCopyDiagnostics,
  onCopyDiagnostics,
}: {
  copyState: 'idle' | 'copied' | 'failed'
  canCopyDiagnostics: boolean
  onCopyDiagnostics: () => void
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between"
        onClick={onCopyDiagnostics}
        disabled={!canCopyDiagnostics}
        autoFocus={true}
      >
        {getCopyDiagnosticsLabel(copyState)}
        {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}
      </Button>
      {copyState === 'copied' ? (
        <p className="text-xs font-medium text-foreground">Diagnostics copied.</p>
      ) : null}
      {copyState === 'failed' ? (
        <p className="text-xs font-medium text-[var(--feedback-warning-text)]">
          Clipboard access is unavailable right now. Share the issue details manually with your HS-Hub maintainer.
        </p>
      ) : null}
    </div>
  )
}

function useDialogReturnFocus(open: boolean, onClose: () => void) {
  const openerRef = useRef(EMPTY_DIALOG_OPENER)

  useLayoutEffect(() => {
    if (open) {
      openerRef.current = takeFeedbackDialogOpener()
    }
  }, [open])

  return () => {
    const { element: opener, reopenCommandPalette } = openerRef.current
    openerRef.current = takeFeedbackDialogOpener()

    onClose()
    window.setTimeout(() => {
      if (reopenCommandPalette) {
        window.dispatchEvent(new CustomEvent(APP_COMMAND_EVENT_NAME, {
          detail: APP_COMMAND_IDS.viewCommandPalette,
        }))
        return
      }

      if (opener?.isConnected) {
        opener.focus()
      }
    }, 80)
  }
}

function useFeedbackDiagnosticsActions(diagnosticsBundle: string) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const canCopyDiagnostics = typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'

  const handleCopyDiagnostics = () => {
    if (!canCopyDiagnostics) {
      setCopyState('failed')
      return
    }

    void navigator.clipboard.writeText(diagnosticsBundle)
      .then(() => {
        setCopyState('copied')
      })
      .catch(() => {
        setCopyState('failed')
      })
  }

  const reset = () => {
    setCopyState('idle')
  }

  return {
    copyState,
    canCopyDiagnostics,
    handleCopyDiagnostics,
    reset,
  }
}

function FeedbackInstructions({
  copyState,
  canCopyDiagnostics,
  onCopyDiagnostics,
}: {
  copyState: 'idle' | 'copied' | 'failed'
  canCopyDiagnostics: boolean
  onCopyDiagnostics: () => void
}) {
  return (
    <Card className="gap-4 border-border/70 py-4 shadow-none">
      <CardHeader className="gap-3 px-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="rounded-md bg-[var(--accent-red-light)] p-2 text-[var(--accent-red)]">
            <Bug size={16} />
          </span>
          <CardTitle className="text-sm font-semibold">Report an issue</CardTitle>
        </div>
        <CardDescription className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
          Copy the sanitized diagnostics and share them with your HS-Hub maintainer. Include what you expected, what happened, and the steps to reproduce.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <DiagnosticsActions
          copyState={copyState}
          canCopyDiagnostics={canCopyDiagnostics}
          onCopyDiagnostics={onCopyDiagnostics}
        />
      </CardContent>
    </Card>
  )
}

export function FeedbackDialog({
  open,
  onClose,
  buildNumber,
  releaseChannel,
}: FeedbackDialogProps) {
  const detectedBuildNumber = useBuildNumber()
  const resolvedBuildNumber = buildNumber ?? detectedBuildNumber
  const diagnosticsBundle = useMemo(
    () => buildSanitizedDiagnosticBundle({ buildNumber: resolvedBuildNumber, releaseChannel }),
    [releaseChannel, resolvedBuildNumber],
  )
  const handleRequestClose = useDialogReturnFocus(open, onClose)
  const {
    copyState,
    canCopyDiagnostics,
    handleCopyDiagnostics,
    reset,
  } = useFeedbackDiagnosticsActions(diagnosticsBundle)

  useEffect(() => startFeedbackDiagnosticsCapture(), [])

  const handleClose = () => {
    reset()
    handleRequestClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[640px]" data-testid="feedback-dialog">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2">
            <Megaphone size={18} weight="duotone" />
            Help improve HS-Hub
          </DialogTitle>
          <DialogDescription>
            This build does not ship public community links. Share local diagnostics with {HS_HUB_SUPPORT_CONTACT_LABEL} instead.
          </DialogDescription>
        </DialogHeader>

        <FeedbackInstructions
          copyState={copyState}
          canCopyDiagnostics={canCopyDiagnostics}
          onCopyDiagnostics={handleCopyDiagnostics}
        />
      </DialogContent>
    </Dialog>
  )
}
