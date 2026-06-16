import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Encryptable } from '@cofhe/sdk'
import { WagmiAdapter } from '@cofhe/sdk/adapters'
import { chains } from '@cofhe/sdk/chains'
import { createCofheClient, createCofheConfig } from '@cofhe/sdk/web'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { type Address, type PublicClient, createPublicClient, http, isAddress, keccak256, stringToBytes } from 'viem'
import { normalize } from 'viem/ens'
import { mainnet } from 'viem/chains'
import { useAccount, usePublicClient, useWalletClient, useWriteContract } from 'wagmi'
import { ACCOUNTABILITY_ABI } from './abi'
import { CONTRACT_ADDRESS } from './config'
import { MemberAvatar } from './MemberAvatar'
import { MemberIdentity } from './MemberIdentity'
import { ProfileEditor } from './ProfileEditor'
import { ProfilePicker } from './ProfilePicker'
import {
  areAllGoalsComplete,
  buildRecentHistory,
  calculateStreak,
  localDateString,
  readCompletionHistory,
  recordCompletedDay,
} from './completionHistory'
import {
  DEFAULT_PROFILE_AVATAR,
  type ProfileAvatar,
  type UserProfile,
  normalizeAvatar,
  readUserProfile,
  saveUserProfile,
  useMemberProfiles,
} from './profile'

type Screen = 'home' | 'create' | 'dashboard' | 'leaderboard'
type Theme = 'light' | 'dark'
type CompletionMap = Record<string, boolean[]>
type GoalFeedback = { kind: 'success' | 'error'; text: string }
type MemberField = {
  id: string
  value: string
  address: Address | null
  resolvedName: string | null
  error: string | null
  isResolving: boolean
}
type BuildCategory = 'fitness' | 'focus/work' | 'sleep' | 'mindfulness' | 'learning' | 'breaking a habit'
type GoalCount = 1 | 2 | 3
type CheckInTime = 'morning' | 'midday' | 'evening'
type OnboardingStatus = 'completed' | 'skipped'
type OnboardingProfile = {
  status: OnboardingStatus
  building: BuildCategory[]
  dailyGoals: GoalCount
  checkIn: CheckInTime
  displayName: string
  avatar: ProfileAvatar
  updatedAt: string
}

const ACTIVE_GROUP_KEY = 'accountable:active-group'
const GOAL_LABELS_KEY = 'accountable:goal-labels'
const ONBOARDING_KEY = 'accountable:onboarding'
const THEME_KEY = 'accountable:theme'
const DEFAULT_GOALS = ['', '', '']
const BUILDING_OPTIONS: BuildCategory[] = ['fitness', 'focus/work', 'sleep', 'mindfulness', 'learning', 'breaking a habit']
const CHECK_IN_OPTIONS: CheckInTime[] = ['morning', 'midday', 'evening']
const mainnetEnsClient = createPublicClient({
  chain: mainnet,
  transport: http(),
})
const DEFAULT_ONBOARDING_VALUES = {
  building: [] as BuildCategory[],
  dailyGoals: 3 as GoalCount,
  checkIn: 'evening' as CheckInTime,
  displayName: '',
  avatar: DEFAULT_PROFILE_AVATAR,
}

function getInitialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return 'dark'
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(theme)
}

function shortAddr(addr: Address | string): string {
  const value = addr.toString()
  return value.length < 11 ? value : value.slice(0, 6) + '...' + value.slice(-4)
}

function createMemberField(): MemberField {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
    value: '',
    address: null,
    resolvedName: null,
    error: null,
    isResolving: false,
  }
}

function looksLikeEnsName(value: string): boolean {
  return !value.startsWith('0x') && value.includes('.') && value.length > 3
}

function formatTodayLabel(): string {
  const now = new Date()
  const day = now.getDate()
  const month = now.toLocaleString('en-GB', { month: 'long' })
  return 'Today ' + day + ' ' + month
}

function formatGoalsSubtitle(groupName: string, onboarding?: OnboardingProfile | null): string {
  const cleaned = groupName.trim().replace(/\s+/g, ' ')
  const checkIn = onboarding?.status === 'completed'
    ? ' Aim for your ' + onboarding.checkIn + ' check-in.'
    : ''
  const isPlaceholder = !cleaned || /^(your\s+group|group|untitled|untitled\s+group)$/i.test(cleaned)
  if (isPlaceholder) {
    return 'Only you can read these. Everyone else sees ✓ or ✗.' + checkIn
  }
  return cleaned + ' · only you can read these. Everyone else sees ✓ or ✗.' + checkIn
}

type LeaderboardRow = {
  member: Address
  count: bigint
  rank: number
  isLeader: boolean
}

function buildLeaderboardRows(rankedMembers: Address[], counts: bigint[]): LeaderboardRow[] {
  const rows = rankedMembers.map((member, index) => ({
    member,
    count: counts[index] ?? 0n,
  }))

  if (!rows.length) return []

  const topScore = rows[0].count
  const hasLeader = topScore > 0n
  let displayRank = 0
  let prevCount: bigint | null = null

  return rows.map(row => {
    if (prevCount === null || row.count < prevCount) {
      displayRank += 1
      prevCount = row.count
    }
    return {
      ...row,
      rank: displayRank,
      isLeader: hasLeader && row.count === topScore,
    }
  })
}

function activeGroupKey(address: Address): string {
  return ACTIVE_GROUP_KEY + ':' + address.toLowerCase()
}

function readActiveGroup(address?: Address): number | null {
  if (!address) return null
  const stored = localStorage.getItem(activeGroupKey(address))
  return stored === null ? null : Number(stored)
}

function saveActiveGroup(address: Address, groupId: number) {
  localStorage.setItem(activeGroupKey(address), String(groupId))
}

function goalLabelsKey(groupId: number, member: Address): string {
  return GOAL_LABELS_KEY + ':' + groupId + ':' + member.toLowerCase()
}

function loadGoalLabels(groupId: number, member: Address): string[] | null {
  try {
    const raw = localStorage.getItem(goalLabelsKey(groupId, member))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveGoalLabels(groupId: number, member: Address, labels: string[]) {
  localStorage.setItem(goalLabelsKey(groupId, member), JSON.stringify(labels))
}

function onboardingKey(address: Address): string {
  return ONBOARDING_KEY + ':' + address.toLowerCase()
}

function readOnboardingProfile(address?: Address): OnboardingProfile | null {
  if (!address) return null
  try {
    const raw = localStorage.getItem(onboardingKey(address))
    if (!raw) return null
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
      avatar: normalizeAvatar(parsed.avatar, address),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

function saveOnboardingProfile(address: Address, profile: OnboardingProfile) {
  localStorage.setItem(onboardingKey(address), JSON.stringify(profile))
}

function defaultGoalsForProfile(profile?: OnboardingProfile | null): string[] {
  const count = profile?.status === 'completed' ? profile.dailyGoals : DEFAULT_ONBOARDING_VALUES.dailyGoals
  return Array.from({ length: count }, () => '')
}

const BUILDING_SUGGESTIONS: Record<BuildCategory, string> = {
  fitness: '10-minute movement',
  'focus/work': 'One focused work sprint',
  sleep: 'Start wind-down on time',
  mindfulness: 'Two-minute breathing reset',
  learning: 'Read or practice for 15 minutes',
  'breaking a habit': 'Pause before the habit loop',
}

function suggestedGoalPlaceholders(profile?: OnboardingProfile | null): string[] {
  if (profile?.status !== 'completed') return ['Goal 1', 'Goal 2', 'Goal 3']

  return profile.building.map(item => BUILDING_SUGGESTIONS[item]).concat(['One tiny win', 'Keep it small', 'Done is enough'])
}

function buildingHeadline(profile?: OnboardingProfile | null): string | null {
  if (profile?.status !== 'completed' || profile.building.length === 0) return null
  const labels = profile.building.map(item => item.split('/')[0]).join(', ')
  return 'Building toward ' + labels + '.'
}

function clearActiveGroup(address: Address) {
  localStorage.removeItem(activeGroupKey(address))
}

async function findUserGroup(publicClient: PublicClient, address: Address): Promise<number | null> {
  const count = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ACCOUNTABILITY_ABI,
    functionName: 'groupCount',
  }) as bigint

  const total = Number(count)
  if (!total) return null

  const memberships = await Promise.all(
    Array.from({ length: total }, (_, groupId) =>
      publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ACCOUNTABILITY_ABI,
        functionName: 'isMember',
        args: [BigInt(groupId), address],
      }).then(isMember => (isMember ? groupId : null)),
    ),
  )

  return memberships.find(groupId => groupId !== null) ?? null
}

function NoGroupPrompt({ go, backLabel, onBack }: { go: (s: Screen) => void; backLabel: string; onBack: () => void }) {
  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>← {backLabel}</button>
      <div className="empty-state-card">
        <h1 className="screen-title">No crew yet</h1>
        <p className="screen-sub empty-state-copy">
          Ask a friend to add your wallet, or create your first group to start locking in daily goals.
        </p>
        <button className="btn-primary full" onClick={() => go('create')}>Create group</button>
      </div>
    </div>
  )
}

function goalToUint64(text: string): bigint {
  const hash = keccak256(stringToBytes(text.trim() || ' '))
  return BigInt(hash) & ((1n << 64n) - 1n)
}

function formatTxError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message
    if (/user rejected|denied|cancelled/i.test(message)) {
      return 'Transaction cancelled in wallet.'
    }
    return message
  }
  return 'Transaction failed.'
}

async function getBufferedEip1559Fees(publicClient: PublicClient) {
  const [block, fees] = await Promise.all([
    publicClient.getBlock({ blockTag: 'latest' }),
    publicClient.estimateFeesPerGas(),
  ])

  const baseFee = block.baseFeePerGas
  if (!baseFee) {
    return {}
  }

  // Use live base fee (not stale estimate) and 2x headroom for the next block(s).
  const maxFeePerGas = baseFee * 2n
  const estimatedPriority = fees.maxPriorityFeePerGas ?? 1n
  const maxPriorityFeePerGas = estimatedPriority > 0n ? estimatedPriority : 1n

  // EIP-1559: maxFee must be >= baseFee + priority tip.
  const minMaxFee = baseFee + maxPriorityFeePerGas
  return {
    maxFeePerGas: maxFeePerGas > minMaxFee ? maxFeePerGas : minMaxFee,
    maxPriorityFeePerGas,
  }
}

function OnboardingFlow({
  profile,
  address,
  onComplete,
  onSkip,
}: {
  profile: OnboardingProfile | null
  address: Address
  onComplete: (profile: OnboardingProfile) => void
  onSkip: () => void
}) {
  const existing = profile?.status === 'completed' ? profile : null
  const [step, setStep] = useState(0)
  const [building, setBuilding] = useState<BuildCategory[]>(existing?.building ?? DEFAULT_ONBOARDING_VALUES.building)
  const [dailyGoals, setDailyGoals] = useState<GoalCount>(existing?.dailyGoals ?? DEFAULT_ONBOARDING_VALUES.dailyGoals)
  const [checkIn, setCheckIn] = useState<CheckInTime>(existing?.checkIn ?? DEFAULT_ONBOARDING_VALUES.checkIn)
  const [displayName, setDisplayName] = useState(existing?.displayName ?? DEFAULT_ONBOARDING_VALUES.displayName)
  const [avatar, setAvatar] = useState(existing?.avatar ?? DEFAULT_ONBOARDING_VALUES.avatar)
  const [isDone, setIsDone] = useState(false)
  const totalSteps = 4

  const toggleBuilding = (option: BuildCategory) => {
    setBuilding(current =>
      current.includes(option)
        ? current.filter(item => item !== option)
        : [...current, option],
    )
  }

  const finish = () => {
    onComplete({
      status: 'completed',
      building,
      dailyGoals,
      checkIn,
      displayName: displayName.trim(),
      avatar,
      updatedAt: new Date().toISOString(),
    })
    setIsDone(true)
  }

  return (
    <div className="onboarding-shell" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        {isDone ? (
          <>
            <p className="onboarding-progress">Setup complete</p>
            <div className="onboarding-avatar" aria-hidden="true">
              <MemberAvatar address={address} avatar={avatar} size="lg" />
            </div>
            <h1 id="onboarding-title" className="screen-title">you're all set</h1>
            <p className="screen-sub">
              Start small, keep it private, and let your crew see the wins.
            </p>
            <button className="btn-primary full" onClick={onSkip}>Go to dashboard</button>
          </>
        ) : (
          <>
            <div className="onboarding-topline">
              <p className="onboarding-progress">Question {step + 1} of {totalSteps}</p>
              <button className="nav-link-btn" onClick={onSkip}>Skip</button>
            </div>

            {step === 0 && (
              <>
                <h1 id="onboarding-title" className="screen-title">What are you building?</h1>
                <p className="screen-sub">Choose any that fit. This just shapes suggestions.</p>
                <div className="answer-grid">
                  {BUILDING_OPTIONS.map(option => (
                    <button
                      key={option}
                      className={'answer-chip' + (building.includes(option) ? ' selected' : '')}
                      onClick={() => toggleBuilding(option)}
                      aria-pressed={building.includes(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h1 id="onboarding-title" className="screen-title">How many daily goals?</h1>
                <p className="screen-sub">Default is 3, but 1 tiny goal still counts. Small is strong.</p>
                <div className="answer-grid compact">
                  {[1, 2, 3].map(count => (
                    <button
                      key={count}
                      className={'answer-chip big' + (dailyGoals === count ? ' selected' : '')}
                      onClick={() => {
                        setDailyGoals(count as GoalCount)
                        setStep(2)
                      }}
                      aria-pressed={dailyGoals === count}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h1 id="onboarding-title" className="screen-title">When daily check-in?</h1>
                <p className="screen-sub">Pick the moment you are most likely to tap once and move on.</p>
                <div className="answer-grid">
                  {CHECK_IN_OPTIONS.map(option => (
                    <button
                      key={option}
                      className={'answer-chip' + (checkIn === option ? ' selected' : '')}
                      onClick={() => {
                        setCheckIn(option)
                        setStep(3)
                      }}
                      aria-pressed={checkIn === option}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h1 id="onboarding-title" className="screen-title">Pick your profile</h1>
                <p className="screen-sub">This stays on this device and shows up in your group list.</p>
                <ProfilePicker
                  address={address}
                  displayName={displayName}
                  avatar={avatar}
                  onDisplayNameChange={setDisplayName}
                  onAvatarChange={setAvatar}
                />
              </>
            )}

            <div className="onboarding-actions">
              <button className="btn-ghost" onClick={() => setStep(current => Math.max(0, current - 1))} disabled={step === 0}>Back</button>
              <button className="btn-primary" onClick={() => (step === totalSteps - 1 ? finish() : setStep(current => current + 1))}>
                {step === totalSteps - 1 ? 'Finish setup' : 'Next'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const HOME_PREVIEW_FRIEND = {
  address: '0x00000000000000000000000000000000000000a1' as Address,
  name: 'Maya',
  avatar: { kind: 'emoji', value: '🌙' } as ProfileAvatar,
  checks: [true, true, false] as const,
}

// Home
function HomeScreen({
  go,
  onboarding,
  userProfile,
  address,
}: {
  go: (s: Screen) => void
  onboarding: OnboardingProfile | null
  userProfile: UserProfile | null
  address?: Address
}) {
  const { isConnected } = useAccount()
  const greetingName = userProfile?.displayName.trim()
    || (onboarding?.status === 'completed' ? onboarding.displayName.trim() : '')

  return (
    <div className="screen home-screen">
      <section className="home-hero">
        <div className="logo-mark">ac<span className="asterisk">*</span>ountable</div>
        {isConnected && greetingName ? (
          <p className="home-greeting">
            {address && userProfile && <MemberAvatar address={address} avatar={userProfile.avatar} size="sm" />}
            <span>Hey {greetingName} — ready when you are.</span>
          </p>
        ) : null}
        <h1 className="hero-title">Commit to goals you&apos;d never say out loud.</h1>
        <p className="tagline">Friends keep you honest — they see ✓ or ✗, never what you wrote.</p>
      </section>

      <section className="home-preview" aria-label="Today's goals preview">
        <div className="preview-card" aria-hidden="true">
          <div className="preview-header">
            <h2 className="preview-title">Today&apos;s goals</h2>
            <span className="preview-lock">fhe</span>
          </div>
          <div className="preview-goals">
            <div className="preview-goal">
              <span>Send the hard email</span>
              <strong className="yes">✓</strong>
            </div>
            <div className="preview-goal">
              <span>Apply to the scary job</span>
              <strong className="no">✗</strong>
            </div>
            <div className="preview-goal">
              <span>No late-night scrolling</span>
              <strong className="yes">✓</strong>
            </div>
          </div>
          <div className="preview-friends">
            <div className="friend-row preview-row">
              <MemberIdentity
                address={HOME_PREVIEW_FRIEND.address}
                profile={{
                  displayName: HOME_PREVIEW_FRIEND.name,
                  addressLabel: 'goals hidden',
                  avatar: HOME_PREVIEW_FRIEND.avatar,
                }}
                nameClassName="friend-name"
                addressClassName="friend-addr"
              />
              <div className="checks">
                {HOME_PREVIEW_FRIEND.checks.map((done, index) => (
                  <span key={index} className={'pill ' + (done ? 'yes' : 'no')}>{done ? '✓' : '✗'}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="how-it-works">
        <p className="section-label home-section-label"><span className="dot teal" />How it works</p>
        <div className="steps-grid">
          <div className="step-card">
            <span>1</span>
            <h3>Write</h3>
            <p>Three private goals.</p>
          </div>
          <div className="step-card">
            <span>2</span>
            <h3>Check</h3>
            <p>Tap when done.</p>
          </div>
          <div className="step-card">
            <span>3</span>
            <h3>Share</h3>
            <p>Friends see ✓ or ✗ only.</p>
          </div>
        </div>
      </section>

      <div className="home-cta">
        <div className="home-cta-copy">
          <p className="eyebrow">Ready to make it real?</p>
          <h2>Connect your wallet to create a group.</h2>
        </div>
        <div className="home-wallet">
          <ConnectButton />
        </div>
        {isConnected && (
          <div className="home-actions">
            <button className="btn-primary" onClick={() => go('create')}>Create group</button>
            <button className="btn-ghost" onClick={() => go('dashboard')}>My dashboard</button>
          </div>
        )}
      </div>
      <div className="fhe-badge">
        <span className="badge-dot" />
        Goals encrypted with Fhenix CoFHE · Arbitrum Sepolia
      </div>
    </div>
  )
}

// Create Group
function CreateScreen({ go, onGroupCreated }: { go: (s: Screen) => void; onGroupCreated: (groupId: number) => void }) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useWriteContract()
  const [name, setName] = useState('')
  const [members, setMembers] = useState<MemberField[]>(() => [createMemberField()])
  const [status, setStatus] = useState<string | null>(null)
  const membersRef = useRef(members)
  const memberValuesKey = useMemo(
    () => members.map(member => member.id + ':' + member.value).join('|'),
    [members],
  )
  const validMembers = useMemo(
    () => members.map(member => member.address).filter((member): member is Address => Boolean(member)),
    [members],
  )
  const hasPendingOrInvalidMembers = members.some(member => {
    const hasValue = Boolean(member.value.trim())
    return hasValue && (member.isResolving || !member.address || Boolean(member.error))
  })
  const canCreate = Boolean(name.trim()) && validMembers.length > 0 && !hasPendingOrInvalidMembers && !isPending

  useEffect(() => {
    membersRef.current = members
  }, [members])

  useEffect(() => {
    let cancelled = false
    const timeout = window.setTimeout(() => {
      const fields = membersRef.current.map(member => ({ id: member.id, value: member.value }))
      fields.forEach(async field => {
        const value = field.value.trim()

        if (!value) {
          setMembers(current => current.map(member => member.id === field.id
            ? { ...member, address: null, resolvedName: null, error: null, isResolving: false }
            : member))
          return
        }

        if (isAddress(value)) {
          setMembers(current => current.map(member => member.id === field.id && member.value.trim() === value
            ? { ...member, address: value as Address, resolvedName: null, error: null, isResolving: false }
            : member))
          return
        }

        if (value.startsWith('0x')) {
          setMembers(current => current.map(member => member.id === field.id && member.value.trim() === value
            ? { ...member, address: null, resolvedName: null, error: 'Enter a valid 0x wallet address.', isResolving: false }
            : member))
          return
        }

        if (!looksLikeEnsName(value)) {
          setMembers(current => current.map(member => member.id === field.id && member.value.trim() === value
            ? { ...member, address: null, resolvedName: null, error: 'Enter a valid 0x address or ENS name.', isResolving: false }
            : member))
          return
        }

        setMembers(current => current.map(member => member.id === field.id && member.value.trim() === value
          ? { ...member, address: null, resolvedName: null, error: null, isResolving: true }
          : member))

        try {
          let ensName: string
          try {
            ensName = normalize(value)
          } catch {
            setMembers(current => current.map(member => member.id === field.id && member.value.trim() === value
              ? { ...member, address: null, resolvedName: null, error: 'Enter a valid ENS name (e.g. name.eth).', isResolving: false }
              : member))
            return
          }

          const resolved = await mainnetEnsClient.getEnsAddress({ name: ensName })
          if (cancelled) return
          setMembers(current => current.map(member => member.id === field.id && member.value.trim() === value
            ? {
              ...member,
              address: resolved,
              resolvedName: resolved ? value : null,
              error: resolved ? null : 'No wallet address found for this ENS name.',
              isResolving: false,
            }
            : member))
        } catch {
          if (cancelled) return
          setMembers(current => current.map(member => member.id === field.id && member.value.trim() === value
            ? {
              ...member,
              address: null,
              resolvedName: null,
              error: 'Could not resolve ENS on mainnet. Use a 0x address or try again.',
              isResolving: false,
            }
            : member))
        }
      })
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [memberValuesKey])

  const add = () => setMembers(current => [...current, createMemberField()])
  const remove = (id: string) => setMembers(current => current.filter(member => member.id !== id))
  const update = (id: string, value: string) => {
    setStatus(null)
    setMembers(current => current.map(member => member.id === id
      ? { ...member, value, address: null, resolvedName: null, error: null, isResolving: false }
      : member))
  }
  const paste = async (id: string) => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        setStatus('Clipboard is empty.')
        return
      }
      update(id, text.trim())
    } catch {
      setStatus('Could not read clipboard. Paste the wallet or ENS name manually.')
    }
  }

  const handleCreate = async () => {
    if (!address || !publicClient) return setStatus('Connect your wallet first.')
    if (!name.trim()) return setStatus('Add a group name first.')
    if (hasPendingOrInvalidMembers) return setStatus('Fix member address errors before creating the group.')
    if (!validMembers.length) return setStatus('Add at least one valid member wallet or ENS name.')

    try {
      setStatus('Creating group on-chain...')
      const nextGroupId = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ACCOUNTABILITY_ABI,
        functionName: 'groupCount',
      }) as bigint

      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ACCOUNTABILITY_ABI,
        functionName: 'createGroup',
        args: [name.trim(), validMembers],
        ...(await getBufferedEip1559Fees(publicClient)),
      })

      setStatus('Waiting for confirmation...')
      await publicClient.waitForTransactionReceipt({ hash })
      onGroupCreated(Number(nextGroupId))
      setStatus('Group created ✓')
      go('dashboard')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Group creation failed.')
    }
  }

  return (
    <div className="screen">
      <button className="back-btn" onClick={() => go('home')}>← Back</button>
      <h1 className="screen-title">Create a group</h1>
      <p className="screen-sub">You're added automatically. Add at least one friend by wallet address or ENS name.</p>
      <div className="form-card">
        <div className="field">
          <label>Group name</label>
          <input type="text" placeholder="e.g. Morning Crew" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Members <span className="label-hint">(0x address or ENS)</span></label>
          {members.map(member => (
            <div className="member-field" key={member.id}>
              <div className="member-row">
                <input
                  type="text"
                  placeholder="0x... or name.eth"
                  value={member.value}
                  onChange={e => update(member.id, e.target.value)}
                  aria-invalid={Boolean(member.error)}
                  aria-describedby={'member-feedback-' + member.id}
                />
                <button className="paste-btn" type="button" onClick={() => paste(member.id)}>Paste</button>
                {members.length > 1 && <button className="remove-btn" type="button" onClick={() => remove(member.id)}>✕</button>}
              </div>
              <div id={'member-feedback-' + member.id}>
                {member.isResolving && <p className="member-hint">Resolving ENS on mainnet...</p>}
                {member.address && !member.resolvedName && <p className="member-hint success">Valid address</p>}
                {member.address && member.resolvedName && (
                  <p className="member-hint success">{member.resolvedName} resolves to {shortAddr(member.address)}</p>
                )}
                {member.error && <p className="member-error">{member.error}</p>}
              </div>
            </div>
          ))}
          <button className="add-btn" type="button" onClick={add}>+ Add member</button>
        </div>
        <p className="form-help">Create group unlocks once the name and at least one valid member are ready.</p>
        <button className="btn-primary full" onClick={handleCreate} disabled={!canCreate}>
          {isPending ? 'Confirm in wallet...' : 'Create group'}
        </button>
        {status && <p className="status">{status}</p>}
      </div>
    </div>
  )
}

// Dashboard
function DashboardScreen({
  go,
  groupId,
  onboarding,
  userProfile,
  onEditSetup,
  onEditProfile,
}: {
  go: (s: Screen) => void
  groupId: number | null
  onboarding: OnboardingProfile | null
  userProfile: UserProfile | null
  onEditSetup: () => void
  onEditProfile: () => void
}) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { writeContractAsync, isPending: isWritePending } = useWriteContract()
  const [groupName, setGroupName] = useState('Your group')
  const [members, setMembers] = useState<Address[]>([])
  const [memberStatuses, setMemberStatuses] = useState<CompletionMap>({})
  const [goals, setGoals] = useState(() => defaultGoalsForProfile(onboarding))
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [notInGroup, setNotInGroup] = useState(false)
  const [pendingGoals, setPendingGoals] = useState<Set<number>>(() => new Set())
  const [goalFeedback, setGoalFeedback] = useState<Record<number, GoalFeedback>>({})
  const [showLockSuccess, setShowLockSuccess] = useState(false)
  const [lockSettled, setLockSettled] = useState(false)
  const [historyRevision, setHistoryRevision] = useState(0)
  const [celebratingGoals, setCelebratingGoals] = useState<Set<number>>(() => new Set())
  const isLockingGoals = isWritePending && pendingGoals.size === 0

  const ownCompletions = address ? memberStatuses[address.toLowerCase()] || [] : []
  const locked = ownCompletions.length > 0
  const today = useMemo(() => localDateString(), [])
  const completionHistory = useMemo(() => {
    if (!address || groupId === null) return new Set<string>()
    return readCompletionHistory(address, groupId)
  }, [address, groupId, historyRevision])
  const todayComplete = completionHistory.has(today)
  const streak = useMemo(() => calculateStreak(completionHistory, today), [completionHistory, today])
  const recentDays = useMemo(() => buildRecentHistory(completionHistory, 7, today), [completionHistory, today])
  const groupFriends = useMemo(
    () => (address
      ? members.filter(member => member.toLowerCase() !== address.toLowerCase())
      : members),
    [address, members],
  )
  const profileTitleName = userProfile?.displayName.trim() || (onboarding?.status === 'completed' ? onboarding.displayName : '')
  const profileLabel = profileTitleName || null
  const goalPlaceholders = useMemo(() => suggestedGoalPlaceholders(onboarding), [onboarding])
  const memberProfile = useMemberProfiles(members, address, userProfile, publicClient)

  const loadGroup = useCallback(async () => {
    if (!publicClient || groupId === null || !address) return
    setLoading(true)
    setNotInGroup(false)
    try {
      const id = BigInt(groupId)
      const [name, memberList, isMember] = await Promise.all([
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ACCOUNTABILITY_ABI, functionName: 'getGroupName', args: [id] }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ACCOUNTABILITY_ABI, functionName: 'getMembers', args: [id] }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ACCOUNTABILITY_ABI, functionName: 'isMember', args: [id, address] }),
      ])

      if (!isMember) {
        clearActiveGroup(address)
        setNotInGroup(true)
        return
      }

      const typedMembers = memberList as Address[]
      const statuses = await Promise.all(
        typedMembers.map(async member => {
          const completion = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: ACCOUNTABILITY_ABI,
            functionName: 'getCompletionStatus',
            args: [id, member],
          })
          return [member.toLowerCase(), completion as boolean[]] as const
        }),
      )

      setGroupName(name as string)
      setMembers(typedMembers)
      setMemberStatuses(Object.fromEntries(statuses))

      const selfCompletions = statuses.find(([member]) => member === address.toLowerCase())?.[1] ?? []
      if (areAllGoalsComplete(selfCompletions)) {
        recordCompletedDay(address, groupId)
        setHistoryRevision(current => current + 1)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load group.')
    } finally {
      setLoading(false)
    }
  }, [address, groupId, publicClient])

  useEffect(() => {
    loadGroup()
  }, [loadGroup])

  useEffect(() => {
    if (!address || groupId === null) return
    const saved = loadGoalLabels(groupId, address)
    if (saved) {
      setGoals(saved.length ? saved : defaultGoalsForProfile(onboarding))
    } else if (locked) {
      setGoals(ownCompletions.map((_, index) => 'Encrypted goal ' + (index + 1)))
    } else {
      setGoals(defaultGoalsForProfile(onboarding))
    }
  }, [address, groupId, locked, onboarding, ownCompletions.length])

  useEffect(() => {
    if (!showLockSuccess) return
    const timer = window.setTimeout(() => {
      setShowLockSuccess(false)
      setLockSettled(true)
    }, 1700)
    return () => window.clearTimeout(timer)
  }, [showLockSuccess])

  useEffect(() => {
    if (!lockSettled) return
    const timer = window.setTimeout(() => setLockSettled(false), 3200)
    return () => window.clearTimeout(timer)
  }, [lockSettled])

  const updateGoal = (i: number, v: string) => {
    const next = [...goals]
    next[i] = v
    setGoals(next)
  }

  const handleLockGoals = async () => {
    if (!address || !walletClient || !publicClient) return setStatus('Connect your wallet first.')
    if (groupId === null) return setStatus('Create a group first.')

    const goalTexts = goals.map(goal => goal.trim()).filter(Boolean)
    if (!goalTexts.length) return setStatus('Add at least one goal first.')

    try {
      setShowLockSuccess(false)
      setLockSettled(false)
      setStatus('Encrypting goals with CoFHE...')
      const cofheConfig = createCofheConfig({ supportedChains: [chains.arbSepolia] })
      const cofheClient = createCofheClient(cofheConfig)
      const adapted = await WagmiAdapter(walletClient, publicClient)
      await cofheClient.connect(adapted.publicClient, adapted.walletClient)
      const encryptedGoals = await cofheClient
        .encryptInputs(goalTexts.map(goal => Encryptable.uint64(goalToUint64(goal))))
        .execute()

      setStatus('Sending encrypted goals on-chain...')
      const args = [BigInt(groupId), encryptedGoals] as unknown as [bigint, readonly { ctHash: bigint; securityZone: number; utype: number; signature: Address }[]]
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ACCOUNTABILITY_ABI,
        functionName: 'setGoals',
        args,
        ...(await getBufferedEip1559Fees(publicClient)),
      })

      setStatus('Waiting for confirmation...')
      await publicClient.waitForTransactionReceipt({ hash })
      saveGoalLabels(groupId, address, goalTexts)
      setGoals(goalTexts)
      await loadGroup()
      setStatus('Goals locked ✓')
      setShowLockSuccess(true)
    } catch (error) {
      setShowLockSuccess(false)
      setLockSettled(false)
      setStatus(error instanceof Error ? error.message : 'Could not lock goals.')
    }
  }

  const completeGoal = async (i: number) => {
    if (!address) return setStatus('Connect your wallet first.')
    if (!publicClient || groupId === null) return
    if (ownCompletions[i] || pendingGoals.has(i)) return

    setGoalFeedback(prev => {
      const next = { ...prev }
      delete next[i]
      return next
    })
    setPendingGoals(prev => new Set(prev).add(i))
    setStatus('Goal ' + (i + 1) + ': confirm transaction in wallet...')

    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ACCOUNTABILITY_ABI,
        functionName: 'completeGoal',
        args: [BigInt(groupId), i],
        ...(await getBufferedEip1559Fees(publicClient)),
      })
      setStatus('Goal ' + (i + 1) + ': waiting for confirmation...')
      await publicClient.waitForTransactionReceipt({ hash })
      const successText = 'Goal ' + (i + 1) + ' marked complete ✓'
      setStatus(successText)
      setGoalFeedback(prev => ({
        ...prev,
        [i]: { kind: 'success', text: successText },
      }))
      setCelebratingGoals(prev => new Set(prev).add(i))
      window.setTimeout(() => {
        setCelebratingGoals(prev => {
          const next = new Set(prev)
          next.delete(i)
          return next
        })
      }, 900)
      const projectedCompletions = ownCompletions.map((done, idx) => (idx === i ? true : done))
      if (areAllGoalsComplete(projectedCompletions)) {
        recordCompletedDay(address, groupId)
        setHistoryRevision(current => current + 1)
      }
      await loadGroup()
    } catch (error) {
      const errorText = formatTxError(error)
      setStatus('Goal ' + (i + 1) + ' failed: ' + errorText)
      setGoalFeedback(prev => ({
        ...prev,
        [i]: { kind: 'error', text: errorText },
      }))
    } finally {
      setPendingGoals(prev => {
        const next = new Set(prev)
        next.delete(i)
        return next
      })
    }
  }

  if (groupId === null || notInGroup) {
    return <NoGroupPrompt go={go} backLabel="Back" onBack={() => go('home')} />
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="back-btn" onClick={() => go('home')}>← Back</button>
        <div className="header-actions">
          <button className="nav-link-btn" onClick={onEditProfile}>Edit profile</button>
          <button className="nav-link-btn" onClick={onEditSetup}>Edit setup</button>
          <button className="nav-link-btn" onClick={() => go('leaderboard')}>Leaderboard →</button>
        </div>
      </div>
      <h1 className="screen-title dashboard-title">
        {userProfile && address ? (
          <>
            <MemberAvatar address={address} avatar={userProfile.avatar} size="sm" />
            <span>{profileLabel ? profileLabel + "'s goals" : "Today's goals"}</span>
          </>
        ) : (
          profileLabel ? profileLabel + "'s goals" : "Today's goals"
        )}
      </h1>
      <p className="screen-sub">{formatGoalsSubtitle(groupName, onboarding)}</p>

      {locked && (
        <div className={'streak-card' + (todayComplete && streak > 0 ? ' active' : '')}>
          <div className="streak-head">
            <span className="dot teal" />
            <span className="streak-kicker">Your chain</span>
          </div>
          <div className="streak-main">
            {todayComplete && streak > 0 ? (
              <>
                <p className="streak-count" aria-label={streak + ' day streak'}>{streak}</p>
                <div>
                  <p className="streak-title">{streak === 1 ? 'day in a row' : 'days in a row'}</p>
                  <p className="streak-sub">Nice work. Keep the chain going.</p>
                </div>
              </>
            ) : (
              <>
                <p className="streak-count soft" aria-hidden="true">·</p>
                <div>
                  <p className="streak-title">Ready to start today</p>
                  <p className="streak-sub">Finish your goals whenever you are ready.</p>
                </div>
              </>
            )}
          </div>
          <div className="history-row" aria-label="Last 7 days">
            {recentDays.map(day => (
              <div
                key={day.date}
                className={'history-day' + (day.completed ? ' completed' : '') + (day.isToday ? ' today' : '')}
                title={day.date + (day.completed ? ' · completed' : '')}
              >
                <span className="history-dot" aria-hidden="true">{day.completed ? '✓' : ''}</span>
                <span className="history-label">{day.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section goals-section">
        <div className="section-label">
          <span className="dot teal" />
          Your goals
          <span className={'enc-tag' + (showLockSuccess || lockSettled ? ' enc-tag--affirmed' : '')}>fhe encrypted</span>
        </div>
        <div className="goals-body">
          {showLockSuccess && (
            <div className="lock-success-moment" role="status" aria-live="polite">
              <span className="lock-success-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              </span>
              <span className="asterisk lock-success-asterisk" aria-hidden="true">*</span>
              <span className="lock-success-copy">Encrypted. Only you can ever read these.</span>
            </div>
          )}
        {!locked && (
          <p className="section-empty goals-hint">
            {buildingHeadline(onboarding) ?? 'What are you tackling today?'}{' '}
            Drop in {goals.length === 1 ? 'one small goal' : 'up to ' + goals.length + ' small goals'} — friends only see ✓ or ✗.
          </p>
        )}
        {locked && (
          <p className="goal-tx-hint">Each tap sends one on-chain transaction. Confirm the wallet prompt for that goal.</p>
        )}
        {locked ? goals.map((goal, i) => {
          const isGoalComplete = ownCompletions[i]
          const isGoalPending = pendingGoals.has(i)
          const feedback = goalFeedback[i]
          return (
            <div key={i} className="goal-row">
              <button
                className={'goal-complete-btn'
                  + (isGoalComplete ? ' done' : '')
                  + (isGoalPending ? ' pending' : '')
                  + (celebratingGoals.has(i) ? ' celebrate' : '')}
                onClick={() => completeGoal(i)}
                disabled={isGoalComplete || isGoalPending}
                aria-busy={isGoalPending}
                aria-label={'Goal ' + (i + 1) + (isGoalComplete ? ' complete' : isGoalPending ? ' marking complete' : ' incomplete')}
              >
                <span className="goal-text">{isGoalPending ? 'Goal ' + (i + 1) + ': marking complete...' : goal || 'Goal ' + (i + 1)}</span>
                <span className="check">{isGoalPending ? '...' : isGoalComplete ? '✓' : '✗'}</span>
              </button>
              {feedback && <p className={'goal-status ' + feedback.kind}>{feedback.text}</p>}
            </div>
          )
        }) : goals.map((goal, i) => (
          <div key={i} className="goal-input-row">
            <input type="text" placeholder={goalPlaceholders[i] ?? 'Goal ' + (i + 1)} value={goal} onChange={e => updateGoal(i, e.target.value)} />
          </div>
        ))}
        {!locked && (
          <button className="btn-primary full" onClick={handleLockGoals} disabled={isLockingGoals}>
            {isLockingGoals ? 'Confirm in wallet...' : 'Lock in goals (encrypted)'}
          </button>
        )}
        </div>
        {loading && <p className="status">Loading group...</p>}
        {status && <p className="status">{status}</p>}
      </div>

      <div className="section">
        <div className="section-label">
          <span className="dot slate" />
          Your group
        </div>
        {groupFriends.length === 0 ? (
          <p className="section-empty">No friends in this group yet — add a wallet when you create your next crew.</p>
        ) : groupFriends.map(member => {
          const completions = memberStatuses[member.toLowerCase()] || []
          const slots = Math.max(onboarding?.status === 'completed' ? onboarding.dailyGoals : 3, completions.length)
          return (
            <div className="friend-row" key={member}>
              <MemberIdentity
                address={member}
                profile={memberProfile(member)}
                nameClassName="friend-name"
                addressClassName="friend-addr"
              />
              <div className="checks">
                {Array.from({ length: slots }).map((_, index) => (
                  <span key={index} className={'pill ' + (completions[index] ? 'yes' : 'no')}>{completions[index] ? '✓' : '✗'}</span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Leaderboard
function LeaderboardScreen({
  go,
  groupId,
  onboarding,
  userProfile,
}: {
  go: (s: Screen) => void
  groupId: number | null
  onboarding: OnboardingProfile | null
  userProfile: UserProfile | null
}) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [rankedMembers, setRankedMembers] = useState<Address[]>([])
  const [counts, setCounts] = useState<bigint[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const goalTotal = onboarding?.status === 'completed' ? onboarding.dailyGoals : 3
  const memberProfile = useMemberProfiles(rankedMembers, address, userProfile, publicClient)

  useEffect(() => {
    if (!publicClient || groupId === null) return

    ;(async () => {
      try {
        const leaderboard = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: ACCOUNTABILITY_ABI,
          functionName: 'getLeaderboard',
          args: [BigInt(groupId)],
        }) as readonly [Address[], bigint[]]
        setRankedMembers([...leaderboard[0]])
        setCounts([...leaderboard[1]])
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not load leaderboard.')
      }
    })()
  }, [groupId, publicClient])

  const rows = useMemo(
    () => buildLeaderboardRows(rankedMembers, counts),
    [counts, rankedMembers],
  )

  if (groupId === null) {
    return <NoGroupPrompt go={go} backLabel="Dashboard" onBack={() => go('dashboard')} />
  }

  return (
    <div className="screen">
      <button className="back-btn" onClick={() => go('dashboard')}>← Dashboard</button>
      <h1 className="screen-title">Today's board</h1>
      <p className="screen-sub">Ranked by goals completed. Goals stay private.</p>
      <div className="lb-card">
        {rows.length === 0 ? (
          <p className="section-empty">No members on the board yet.</p>
        ) : rows.map(entry => (
          <div key={entry.member} className={'lb-row' + (entry.isLeader ? ' leader' : '')}>
            <span className="lb-rank">#{entry.rank}</span>
            <div className="lb-info">
              <MemberIdentity
                address={entry.member}
                profile={memberProfile(entry.member)}
                nameClassName="lb-name"
                addressClassName="lb-addr"
                layout="row"
              />
            </div>
            <div className="lb-score">
              <span className="lb-count">{entry.count.toString()}</span>
              <span className="lb-total">/{goalTotal}</span>
            </div>
          </div>
        ))}
        {status && <p className="status">{status}</p>}
      </div>
    </div>
  )
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const targetTheme = theme === 'light' ? 'dark' : 'light'
  const targetLabel = targetTheme === 'light' ? 'Light' : 'Dark'

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onToggle}
      aria-label={'Switch to ' + targetLabel + ' mode'}
      aria-pressed={theme === 'dark'}
    >
      <span aria-hidden="true">{targetTheme === 'light' ? '☀' : '☾'}</span>
      <span>Switch to {targetLabel}</span>
    </button>
  )
}

// Root
export default function App() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [screen, setScreen] = useState<Screen>('home')
  const [activeGroupId, setActiveGroupIdState] = useState<number | null>(null)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfile | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showProfileEditor, setShowProfileEditor] = useState(false)

  useEffect(() => {
    if (!address) {
      setActiveGroupIdState(null)
      return
    }

    const stored = readActiveGroup(address)
    if (stored !== null) {
      setActiveGroupIdState(stored)
      return
    }

    if (!publicClient) return

    let cancelled = false
    ;(async () => {
      const found = await findUserGroup(publicClient, address)
      if (cancelled) return
      if (found !== null) {
        saveActiveGroup(address, found)
        setActiveGroupIdState(found)
      } else {
        setActiveGroupIdState(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [address, publicClient])

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (!address) {
      setOnboardingProfile(null)
      setUserProfile(null)
      setShowOnboarding(false)
      setShowProfileEditor(false)
      return
    }

    const stored = readOnboardingProfile(address)
    setOnboardingProfile(stored)
    setUserProfile(readUserProfile(address))
    setShowOnboarding(stored === null)
  }, [address])

  const setActiveGroupId = (groupId: number) => {
    if (address) saveActiveGroup(address, groupId)
    setActiveGroupIdState(groupId)
  }

  const completeOnboarding = (profile: OnboardingProfile) => {
    if (!address) return
    saveOnboardingProfile(address, profile)
    const nextProfile: UserProfile = {
      displayName: profile.displayName,
      avatar: profile.avatar,
      updatedAt: profile.updatedAt,
    }
    saveUserProfile(address, nextProfile)
    setOnboardingProfile(profile)
    setUserProfile(nextProfile)
  }

  const closeOrSkipOnboarding = () => {
    if (!address) return setShowOnboarding(false)
    if (!onboardingProfile) {
      const skippedProfile: OnboardingProfile = {
        status: 'skipped',
        ...DEFAULT_ONBOARDING_VALUES,
        updatedAt: new Date().toISOString(),
      }
      saveOnboardingProfile(address, skippedProfile)
      setOnboardingProfile(skippedProfile)
    }
    setShowOnboarding(false)
  }

  const handleProfileSave = (profile: UserProfile) => {
    setUserProfile(profile)
    setOnboardingProfile(current => current
      ? {
          ...current,
          displayName: profile.displayName,
          avatar: profile.avatar,
          updatedAt: profile.updatedAt,
        }
      : current)
  }

  return (
    <div className="app">
      <nav className="top-nav">
        <button className="nav-logo" onClick={() => setScreen('home')}>
          ac<span className="asterisk">*</span>ountable
        </button>
        <div className="nav-actions">
          {address && <button className="setup-link" onClick={() => setShowProfileEditor(true)}>Edit profile</button>}
          {address && <button className="setup-link" onClick={() => setShowOnboarding(true)}>Edit setup</button>}
          <ThemeToggle theme={theme} onToggle={() => setTheme(current => current === 'light' ? 'dark' : 'light')} />
          {screen !== 'home' && <ConnectButton showBalance={false} chainStatus="none" />}
        </div>
      </nav>
      <main className="main-content">
        {screen === 'home' && (
          <HomeScreen
            go={setScreen}
            onboarding={onboardingProfile}
            userProfile={userProfile}
            address={address}
          />
        )}
        {screen === 'create' && <CreateScreen go={setScreen} onGroupCreated={setActiveGroupId} />}
        {screen === 'dashboard' && (
          <DashboardScreen
            go={setScreen}
            groupId={activeGroupId}
            onboarding={onboardingProfile}
            userProfile={userProfile}
            onEditSetup={() => setShowOnboarding(true)}
            onEditProfile={() => setShowProfileEditor(true)}
          />
        )}
        {screen === 'leaderboard' && (
          <LeaderboardScreen
            go={setScreen}
            groupId={activeGroupId}
            onboarding={onboardingProfile}
            userProfile={userProfile}
          />
        )}
      </main>
      {address && showOnboarding && (
        <OnboardingFlow
          profile={onboardingProfile}
          address={address}
          onComplete={completeOnboarding}
          onSkip={closeOrSkipOnboarding}
        />
      )}
      {address && showProfileEditor && (
        <ProfileEditor
          address={address}
          profile={userProfile}
          onSave={handleProfileSave}
          onClose={() => setShowProfileEditor(false)}
        />
      )}
    </div>
  )
}
