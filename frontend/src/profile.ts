import { useCallback, useEffect, useState } from 'react'
import type { Address, PublicClient } from 'viem'

export type ProfileAvatar =
  | { kind: 'emoji'; value: string }
  | { kind: 'image'; value: string }
  | { kind: 'generated'; seed: string }

export type UserProfile = {
  displayName: string
  avatar: ProfileAvatar
  updatedAt: string
}

export const PROFILE_KEY = 'accountable:profile'
export const ONBOARDING_KEY = 'accountable:onboarding'
export const AVATAR_OPTIONS = ['🌱', '⚡', '🎯', '🌙', '🔥', '🧠'] as const
export const PROFILE_IMAGE_MAX_BYTES = 350_000
export const GENERATED_AVATAR_VARIANTS = ['wallet', 'orbit', 'pulse', 'grid'] as const

export function generatedAvatarSeed(address: Address | string, variant: typeof GENERATED_AVATAR_VARIANTS[number] = 'wallet'): string {
  const base = address.toString().toLowerCase()
  return variant === 'wallet' ? base : base + ':' + variant
}

export const DEFAULT_PROFILE_AVATAR: ProfileAvatar = { kind: 'emoji', value: '🌱' }

function profileKey(address: Address): string {
  return PROFILE_KEY + ':' + address.toLowerCase()
}

function onboardingKey(address: Address): string {
  return ONBOARDING_KEY + ':' + address.toLowerCase()
}

export function shortAddr(addr: Address | string): string {
  const value = addr.toString()
  return value.length < 11 ? value : value.slice(0, 6) + '...' + value.slice(-4)
}

export function normalizeAvatar(value: unknown, fallbackSeed = ''): ProfileAvatar {
  if (typeof value === 'string' && value) {
    if (value.startsWith('data:image/')) return { kind: 'image', value }
    return { kind: 'emoji', value }
  }

  if (value && typeof value === 'object') {
    const avatar = value as Partial<ProfileAvatar>
    if (avatar.kind === 'emoji' && typeof avatar.value === 'string' && avatar.value) {
      return { kind: 'emoji', value: avatar.value }
    }
    if (avatar.kind === 'image' && typeof avatar.value === 'string' && avatar.value.startsWith('data:image/')) {
      return { kind: 'image', value: avatar.value }
    }
    if (avatar.kind === 'generated' && typeof avatar.seed === 'string' && avatar.seed) {
      return { kind: 'generated', seed: avatar.seed }
    }
  }

  return fallbackSeed ? { kind: 'generated', seed: fallbackSeed } : DEFAULT_PROFILE_AVATAR
}

export function avatarsMatch(left: ProfileAvatar, right: ProfileAvatar): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'generated' && right.kind === 'generated') return left.seed === right.seed
  if (left.kind === 'emoji' && right.kind === 'emoji') return left.value === right.value
  if (left.kind === 'image' && right.kind === 'image') return left.value === right.value
  return false
}

export function readStoredProfile(address?: Address): UserProfile | null {
  if (!address) return null

  try {
    const raw = localStorage.getItem(profileKey(address))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<UserProfile>
    return {
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
      avatar: normalizeAvatar(parsed.avatar, address),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function readOnboardingProfileSnapshot(address?: Address): UserProfile | null {
  if (!address) return null

  try {
    const raw = localStorage.getItem(onboardingKey(address))
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      displayName?: string
      avatar?: unknown
      updatedAt?: string
      status?: string
    }
    if (parsed.status !== 'completed' && parsed.status !== 'skipped') return null
    return {
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
      avatar: normalizeAvatar(parsed.avatar, address),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function readUserProfile(address?: Address): UserProfile | null {
  return readStoredProfile(address) ?? readOnboardingProfileSnapshot(address)
}

export function saveUserProfile(address: Address, profile: UserProfile) {
  localStorage.setItem(profileKey(address), JSON.stringify(profile))

  try {
    const raw = localStorage.getItem(onboardingKey(address))
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, unknown>
    localStorage.setItem(onboardingKey(address), JSON.stringify({
      ...parsed,
      displayName: profile.displayName,
      avatar: profile.avatar,
      updatedAt: profile.updatedAt,
    }))
  } catch {
    // Ignore malformed onboarding data when syncing profile.
  }
}

export function hashSeed(seed: string): number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function generatedAvatarPalette(seed: string): string[] {
  const palettes = [
    ['#00C2C7', '#7C3AED', '#F9A8D4'],
    ['#00A878', '#84CC16', '#FACC15'],
    ['#38BDF8', '#2563EB', '#C4B5FD'],
    ['#FB7185', '#F97316', '#FDE68A'],
    ['#14B8A6', '#0F766E', '#CCFBF1'],
    ['#A78BFA', '#EC4899', '#FBCFE8'],
  ]
  return palettes[hashSeed(seed) % palettes.length]
}

export function generatedAvatarCells(seed: string): boolean[] {
  let hash = hashSeed(seed)
  return Array.from({ length: 9 }, () => {
    hash = Math.imul(hash ^ 0x9e3779b9, 1664525) + 1013904223
    return (hash >>> 0) % 3 !== 0
  })
}

export type ResolvedMemberProfile = {
  displayName: string
  addressLabel: string
  avatar: ProfileAvatar
}

export function resolveMemberProfile(
  addr: Address,
  localProfiles: Record<string, UserProfile>,
  ensNames: Record<string, string>,
): ResolvedMemberProfile {
  const key = addr.toLowerCase()
  const localProfile = localProfiles[key]
  const localName = localProfile?.displayName.trim()
  const ens = ensNames[key]
  return {
    displayName: localName || ens || shortAddr(addr),
    addressLabel: shortAddr(addr),
    avatar: localProfile?.avatar ?? { kind: 'generated', seed: addr },
  }
}

export function useMemberProfiles(
  members: Address[],
  self: Address | undefined,
  selfProfile: UserProfile | null,
  publicClient: PublicClient | undefined,
) {
  const [ensNames, setEnsNames] = useState<Record<string, string>>({})
  const [localProfiles, setLocalProfiles] = useState<Record<string, UserProfile>>({})

  useEffect(() => {
    if (!publicClient || members.length === 0) {
      setEnsNames({})
      return
    }

    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(
        members.map(async member => {
          try {
            const name = await publicClient.getEnsName({ address: member })
            return [member.toLowerCase(), name] as const
          } catch {
            return [member.toLowerCase(), null] as const
          }
        }),
      )

      if (cancelled) return
      setEnsNames(Object.fromEntries(
        entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
          .map(([addr, name]) => [addr, name]),
      ))
    })()

    return () => {
      cancelled = true
    }
  }, [members, publicClient])

  useEffect(() => {
    const profiles = Object.fromEntries(
      members
        .map(member => [member.toLowerCase(), readUserProfile(member)] as const)
        .filter((entry): entry is readonly [string, UserProfile] => Boolean(entry[1])),
    )

    if (self && selfProfile) {
      profiles[self.toLowerCase()] = selfProfile
    }

    setLocalProfiles(profiles)
  }, [members, self, selfProfile])

  return useCallback((addr: Address): ResolvedMemberProfile => {
    return resolveMemberProfile(addr, localProfiles, ensNames)
  }, [ensNames, localProfiles])
}
