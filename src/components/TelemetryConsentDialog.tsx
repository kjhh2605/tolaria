import { ShieldCheck } from '@phosphor-icons/react'
import { OnboardingShell } from './OnboardingShell'
import { Button } from './ui/button'

interface TelemetryConsentDialogProps {
  onAccept: () => void
  onDecline: () => void
}

export function TelemetryConsentDialog({ onAccept, onDecline }: TelemetryConsentDialogProps) {
  return (
    <OnboardingShell
      className="fixed inset-0 z-50"
      contentClassName="w-full rounded-lg border border-border bg-background shadow-[0_18px_55px_var(--shadow-dialog)]"
      style={{ background: 'var(--shadow-overlay)' }}
      contentStyle={{
        width: 'min(440px, 100%)',
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        alignItems: 'center',
      }}
      testId="telemetry-consent-shell"
    >
      <>
        <ShieldCheck size={40} weight="duotone" style={{ color: 'var(--primary)' }} />

        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
            HS-Hub 개선에 참여하기
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.6, marginTop: 8 }}>
            익명 오류 보고서를 보내 주시면 버그를 더 빠르게 수정할 수 있습니다.
            볼트 내용, 개인 정보, 추적 데이터는 수집하지 않습니다.
          </p>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.6, width: '100%' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 500, color: 'var(--foreground)' }}>수집하는 정보:</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>오류 스택 추적(JS 및 Rust)</li>
            <li>앱 버전, 운영체제, 시스템 아키텍처</li>
          </ul>
          <p style={{ margin: '10px 0 6px', fontWeight: 500, color: 'var(--foreground)' }}>수집하지 않는 정보:</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>볼트 내용, 노트 제목, 파일 경로</li>
            <li>개인 정보 또는 IP 주소</li>
          </ul>
        </div>

        <div style={{ display: 'flex', gap: 12, width: '100%', marginTop: 4 }}>
          <Button
            type="button"
            variant="outline"
            style={{ flex: 1, fontSize: 13, padding: '10px 16px' }}
            onClick={onDecline}
            data-testid="telemetry-decline"
            autoFocus
          >
            괜찮습니다
          </Button>
          <Button
            type="button"
            style={{ flex: 1, fontSize: 13, padding: '10px 16px', fontWeight: 500 }}
            onClick={onAccept}
            data-testid="telemetry-accept"
          >
            익명 보고 허용
          </Button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0, textAlign: 'center' }}>
          언제든지 설정에서 변경할 수 있습니다.
        </p>
      </>
    </OnboardingShell>
  )
}
