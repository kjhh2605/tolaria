import { describe, expect, it } from 'vitest'
import { LmsDashboardError, isSafeLmsUrl, lmsErrorMessage } from './lmsDashboard'

describe('lmsDashboard URL and error safety', () => {
  it('allows only clean HTTPS Hansung LMS URLs', () => {
    expect(isSafeLmsUrl('https://learn.hansung.ac.kr/mod/assign/view.php?id=1')).toBe(true)
    expect(isSafeLmsUrl('http://learn.hansung.ac.kr/mod/assign/view.php?id=1')).toBe(false)
    expect(isSafeLmsUrl('https://learn.hansung.ac.kr.evil.test/mod/assign/view.php?id=1')).toBe(false)
    expect(isSafeLmsUrl('https://evil.test/mod/assign/view.php?id=1')).toBe(false)
    expect(isSafeLmsUrl('https://user:pass@learn.hansung.ac.kr/mod/assign/view.php?id=1')).toBe(false)
    expect(isSafeLmsUrl('not a url')).toBe(false)
  })

  it('keeps user-visible errors in Korean and strips unsafe details from the Error message', () => {
    expect(lmsErrorMessage('AUTH_REQUIRED')).toBe('한성 e-class 로그인이 필요합니다.')
    const error = new LmsDashboardError({
      code: 'NETWORK_ERROR',
      message: '한성 e-class에 연결할 수 없습니다.',
      safe_details: 'timeout',
    })
    expect(error.message).toBe('한성 e-class에 연결할 수 없습니다.')
    expect(error.safeDetails).toBe('timeout')
  })
})
