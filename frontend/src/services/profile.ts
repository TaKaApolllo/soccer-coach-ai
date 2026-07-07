import { CoachLevel } from '../types'

const KEY = 'tactica_profile'

export type FaceMode = 'real' | 'avatar'

export interface Profile {
  name: string
  coachLevel: CoachLevel
  faceMode: FaceMode
}

const DEFAULT_PROFILE: Profile = {
  name: 'コーチ',
  coachLevel: 'intermediate',
  faceMode: 'real'
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
