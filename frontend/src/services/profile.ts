import { CoachLevel } from '../types'

const KEY = 'tactica_profile'

export interface Profile {
  name: string
  coachLevel: CoachLevel
}

const DEFAULT_PROFILE: Profile = {
  name: 'コーチ',
  coachLevel: 'intermediate'
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_PROFILE, ...JSON.parse(raw) }
  } catch {
    // 破損時はデフォルトへフォールバック
  }
  return { ...DEFAULT_PROFILE }
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(KEY, JSON.stringify(profile))
}
