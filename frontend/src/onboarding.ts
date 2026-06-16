import type { Address } from 'viem'
import {
  DEFAULT_PROFILE_AVATAR,
  ONBOARDING_KEY,
  type ProfileAvatar,
  type UserProfile,
  normalizeAvatar,
  readUserProfile,
  saveUserProfile,
} from './profile'

export type OnboardingStatus = 'completed' | 'skipped'
export type BuildCategory = 'fitness' | 'focus/work' | 'sleep' | 'mindfulness' | 'learning' | 'breaking a habit'
export type GoalCount = 1 | 2 | 3
export type CheckInTime = 'morning' | 'midday' | 'evening'

export type OnboardingProfile = {
  status: OnboardingStatus
  building: BuildCategory[]
  dailyGoals: GoalCount
  checkIn: CheckInTime
  displayName: string
  avatar: ProfileAvatar
  updatedAt: string
}

export const GUEST_ONBOARDING_KEY = 'accountable:onboarding:guest'
export const GUEST_PROFILE_KEY = 'accountable:profile:guest'
export const ONBOARDING_COMPLETE_KEY = 'accountable:onboarding-complete'
export const GUEST_AVATAR_SEED = 'accountable-guest'
export const GUEST_PLACEHOLDER_ADDRESS = '0x0000000000000000000000000000000000000001' as Address

export const BUILDING_OPTIONS: BuildCategory[] = [
  'fitness',
  'focus/work',
  'sleep',
  'mindfulness',
  'learning',
  'breaking a habit',
]
export const CHECK_IN_OPTIONS: CheckInTime[] = ['morning', 'midday', 'evening']

export const DEFAULT_ONBOARDING_VALUES = {
  building: [] as BuildCategory[],
  dailyGoals: 3 as GoalCount,
  checkIn: 'evening' as CheckInTime,
  displayName: '',
  avatar: DEFAULT_PROFILE_AVATAR,
}

export const BUILDING_SUGGESTIONS: Record<BuildCategory, string> = {
  fitness: '10-minute movement',
  'focus/work': 'One focused work sprint',
  sleep: 'Start wind-down on time',
  mindfulness: 'Two-minute breathing reset',
  learning: 'Read or practice for 15 minutes',
  'breaking a habit': 'Pause before the habit loop',
}

function walletOnboardingKey(address: Address): string {
  return ONBOARDING_KEY + ':' + address.toLowerCase()
}

function parseOnboardingProfile(raw: string, avatarSeed: string): OnboardingProfile | null {
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingProfile>
    if (parsed.status !== 'completed' && parsed.status !== 'skipped') return null
    const dailyGoals = parsed.dailyGoals === 1 || parsed.dailyGoals === 2 || parsed.dailyGoals === 3
      ? parsed.dailyGoals
      : DEFAULT_ONBOARDING_VALUES.dailyGoals
    const checkIn = CHECK_IN_OPTIONS.includes(parsed.checkIn as CheckInTime)
      ? parsed.checkIn as CheckInTime
      : DEFAULT_ONBOARDING_VALUES.checkIn
    const building = Array.isArray(parsed.building)
      ? parsed.building.filter((item): item is BuildCategory => BUILDING_OPTIONS.includes(item as BuildCategory))
      : DEFAULT_ONBOARDING_VALUES.building

    return {
      status: parsed.status,
      building,
      dailyGoals,
      checkIn,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
      avatar: normalizeAvatar(parsed.avatar, avatarSeed),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function isOnboardingComplete(profile: OnboardingProfile | null | undefined): boolean {
  return profile?.status === 'completed' || profile?.status === 'skipped'
}

export function readGuestOnboarding(): OnboardingProfile | null {
  const raw = localStorage.getItem(GUEST_ONBOARDING_KEY)
  return raw ? parseOnboardingProfile(raw, GUEST_AVATAR_SEED) : null
}

export function saveGuestOnboarding(profile: OnboardingProfile) {
  localStorage.setItem(GUEST_ONBOARDING_KEY, JSON.stringify(profile))
  if (profile.status === 'completed' || profile.status === 'skipped') {
    localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true')
  }
}

export function readGuestProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(GUEST_PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<UserProfile>
    return {
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
      avatar: normalizeAvatar(parsed.avatar, GUEST_AVATAR_SEED),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function saveGuestProfile(profile: UserProfile) {
  localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(profile))
}

export function readWalletOnboarding(address: Address): OnboardingProfile | null {
  const raw = localStorage.getItem(walletOnboardingKey(address))
  return raw ? parseOnboardingProfile(raw, address) : null
}

export function saveWalletOnboarding(address: Address, profile: OnboardingProfile) {
  localStorage.setItem(walletOnboardingKey(address), JSON.stringify(profile))
}

export function readEffectiveOnboarding(address?: Address): OnboardingProfile | null {
  if (address) {
    const wallet = readWalletOnboarding(address)
    if (wallet) return wallet
    const guest = readGuestOnboarding()
    if (guest) return guest
    return null
  }
  return readGuestOnboarding()
}

export function readEffectiveProfile(address?: Address): UserProfile | null {
  if (address) {
    return readUserProfile(address) ?? profileFromOnboarding(readEffectiveOnboarding(address))
  }
  return readGuestProfile() ?? profileFromOnboarding(readGuestOnboarding())
}

export function profileFromOnboarding(profile: OnboardingProfile | null): UserProfile | null {
  if (!isOnboardingComplete(profile) || !profile) return null
  return {
    displayName: profile.displayName,
    avatar: profile.avatar,
    updatedAt: profile.updatedAt,
  }
}

export function syncGuestToWallet(address: Address): OnboardingProfile | null {
  const guest = readGuestOnboarding()
  if (!guest) return readWalletOnboarding(address)

  const existingWallet = readWalletOnboarding(address)
  if (!existingWallet) {
    saveWalletOnboarding(address, guest)
    const guestProfile = readGuestProfile() ?? profileFromOnboarding(guest)
    if (guestProfile) {
      saveUserProfile(address, guestProfile)
    }
    return guest
  }

  return existingWallet
}

export function persistOnboarding(
  profile: OnboardingProfile,
  address?: Address,
): UserProfile {
  const userProfile: UserProfile = {
    displayName: profile.displayName,
    avatar: profile.avatar,
    updatedAt: profile.updatedAt,
  }

  saveGuestOnboarding(profile)
  saveGuestProfile(userProfile)

  if (address) {
    saveWalletOnboarding(address, profile)
    saveUserProfile(address, userProfile)
  }

  return userProfile
}

export function defaultGoalsForProfile(profile?: OnboardingProfile | null): string[] {
  const count = profile?.status === 'completed' ? profile.dailyGoals : DEFAULT_ONBOARDING_VALUES.dailyGoals
  return Array.from({ length: count }, () => '')
}

export function suggestedGoalPlaceholders(profile?: OnboardingProfile | null): string[] {
  if (profile?.status !== 'completed') return ['Goal 1', 'Goal 2', 'Goal 3']
  return profile.building
    .map(item => BUILDING_SUGGESTIONS[item])
    .concat(['One tiny win', 'Keep it small', 'Done is enough'])
}

export function buildingHeadline(profile?: OnboardingProfile | null): string | null {
  if (profile?.status !== 'completed' || profile.building.length === 0) return null
  const labels = profile.building.map(item => item.split('/')[0]).join(', ')
  return 'Building toward ' + labels + '.'
}
