import { useCallback, useEffect, useMemo, useState } from 'react'
import { Encryptable } from '@cofhe/sdk'
import { WagmiAdapter } from '@cofhe/sdk/adapters'
import { chains } from '@cofhe/sdk/chains'
import { createCofheClient, createCofheConfig } from '@cofhe/sdk/web'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { type Address, isAddress, keccak256, stringToBytes } from 'viem'
import { useAccount, usePublicClient, useWalletClient, useWriteContract } from 'wagmi'
import { ACCOUNTABILITY_ABI } from './abi'
import { CONTRACT_ADDRESS } from './config'

type Screen = 'home' | 'create' | 'dashboard' | 'leaderboard'
type CompletionMap = Record<string, boolean[]>

const ACTIVE_GROUP_KEY = 'accountable:active-group'
const GOAL_LABELS_KEY = 'accountable:goal-labels'
const DEFAULT_GOALS = ['', '', '']

function shortAddr(addr: Address | string): string {
  const value = addr.toString()
  return value.length < 11 ? value : value.slice(0, 6) + '...' + value.slice(-4)
}

function memberName(addr: Address, self?: Address): string {
  return self && addr.toLowerCase() === self.toLowerCase() ? 'You' : shortAddr(addr)
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

function goalToUint64(text: string): bigint {
  const hash = keccak256(stringToBytes(text.trim() || ' '))
  return BigInt(hash) & ((1n << 64n) - 1n)
}

// Home
function HomeScreen({ go }: { go: (s: Screen) => void }) {
  const { isConnected } = useAccount()

  return (
    <div className="screen home-screen">
      <div className="logo-mark">acc<span className="asterisk">*</span>untable</div>
      <p className="tagline">Set your daily goals privately.<br />Friends see ✓ or ✗ — never what you wrote.</p>
      <ConnectButton />
      {isConnected && (
        <div className="home-actions">
          <button className="btn-primary" onClick={() => go('create')}>Create group</button>
          <button className="btn-ghost" onClick={() => go('dashboard')}>My dashboard</button>
        </div>
      )}
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
  const [members, setMembers] = useState([''])
  const [status, setStatus] = useState<string | null>(null)

  const add = () => setMembers([...members, ''])
  const remove = (i: number) => setMembers(members.filter((_, idx) => idx !== i))
  const update = (i: number, v: string) => {
    const next = [...members]
    next[i] = v
    setMembers(next)
  }

  const handleCreate = async () => {
    if (!address || !publicClient) return setStatus('Connect your wallet first.')
    if (!name.trim()) return setStatus('Add a group name first.')

    const parsedMembers = members
      .map(member => member.trim())
      .filter(Boolean)
      .filter(isAddress) as Address[]

    const invalidMembers = members.map(member => member.trim()).filter(Boolean).filter(member => !isAddress(member))
    if (invalidMembers.length) return setStatus('One member address is not valid.')

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
        args: [name.trim(), parsedMembers],
        gas: 500000n,
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
      <p className="screen-sub">You're added automatically. Invite friends by wallet address.</p>
      <div className="form-card">
        <div className="field">
          <label>Group name</label>
          <input type="text" placeholder="e.g. Morning Crew" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Members <span className="label-hint">(wallet addresses)</span></label>
          {members.map((member, i) => (
            <div className="member-row" key={i}>
              <input type="text" placeholder="0x..." value={member} onChange={e => update(i, e.target.value)} />
              {members.length > 1 && <button className="remove-btn" onClick={() => remove(i)}>✕</button>}
            </div>
          ))}
          <button className="add-btn" onClick={add}>+ Add member</button>
        </div>
        <button className="btn-primary full" onClick={handleCreate} disabled={isPending}>
          {isPending ? 'Confirm in wallet...' : 'Create group'}
        </button>
        {status && <p className="status">{status}</p>}
      </div>
    </div>
  )
}

// Dashboard
function DashboardScreen({ go, groupId }: { go: (s: Screen) => void; groupId: number | null }) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { writeContractAsync, isPending } = useWriteContract()
  const [groupName, setGroupName] = useState('Your group')
  const [members, setMembers] = useState<Address[]>([])
  const [memberStatuses, setMemberStatuses] = useState<CompletionMap>({})
  const [goals, setGoals] = useState(DEFAULT_GOALS)
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const ownCompletions = address ? memberStatuses[address.toLowerCase()] || [] : []
  const locked = ownCompletions.length > 0

  const loadGroup = useCallback(async () => {
    if (!publicClient || groupId === null) return
    setLoading(true)
    try {
      const id = BigInt(groupId)
      const [name, memberList] = await Promise.all([
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ACCOUNTABILITY_ABI, functionName: 'getGroupName', args: [id] }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ACCOUNTABILITY_ABI, functionName: 'getMembers', args: [id] }),
      ])

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
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load group.')
    } finally {
      setLoading(false)
    }
  }, [groupId, publicClient])

  useEffect(() => {
    loadGroup()
  }, [loadGroup])

  useEffect(() => {
    if (!address || groupId === null) return
    const saved = loadGoalLabels(groupId, address)
    if (saved) {
      setGoals(saved.length ? saved : DEFAULT_GOALS)
    } else if (locked) {
      setGoals(ownCompletions.map((_, index) => 'Encrypted goal ' + (index + 1)))
    } else {
      setGoals(DEFAULT_GOALS)
    }
  }, [address, groupId, locked, ownCompletions.length])

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
        gas: 500000n,
      })

      setStatus('Waiting for confirmation...')
      await publicClient.waitForTransactionReceipt({ hash })
      saveGoalLabels(groupId, address, goalTexts)
      setGoals(goalTexts)
      setStatus('Goals locked ✓')
      await loadGroup()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not lock goals.')
    }
  }

  const completeGoal = async (i: number) => {
    if (!publicClient || groupId === null) return
    if (ownCompletions[i]) return setStatus('That goal is already complete.')

    try {
      setStatus('Marking goal complete...')
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ACCOUNTABILITY_ABI,
        functionName: 'completeGoal',
        args: [BigInt(groupId), i],
        gas: 500000n,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setStatus('Goal complete ✓')
      await loadGroup()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not complete goal.')
    }
  }

  if (groupId === null) {
    return (
      <div className="screen">
        <button className="back-btn" onClick={() => go('home')}>← Back</button>
        <h1 className="screen-title">No group yet</h1>
        <p className="screen-sub">Create a group first, then your goals and leaderboard will appear here.</p>
        <button className="btn-primary full" onClick={() => go('create')}>Create group</button>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="back-btn" onClick={() => go('home')}>← Back</button>
        <button className="nav-link-btn" onClick={() => go('leaderboard')}>Leaderboard →</button>
      </div>
      <h1 className="screen-title">Today's goals</h1>
      <p className="screen-sub">{groupName}. Only you can read these. Everyone else sees ✓ or ✗ only.</p>

      <div className="section">
        <div className="section-label">
          <span className="dot teal" />
          Your goals
          <span className="enc-tag">fhe encrypted</span>
        </div>
        {locked ? goals.map((goal, i) => (
          <button key={i} className={'goal-complete-btn' + (ownCompletions[i] ? ' done' : '')} onClick={() => completeGoal(i)}>
            <span className="goal-text">{goal || 'Goal ' + (i + 1)}</span>
            <span className="check">{ownCompletions[i] ? '✓' : '✗'}</span>
          </button>
        )) : goals.map((goal, i) => (
          <div key={i} className="goal-input-row">
            <input type="text" placeholder={'Goal ' + (i + 1)} value={goal} onChange={e => updateGoal(i, e.target.value)} />
          </div>
        ))}
        {!locked && (
          <button className="btn-primary full" onClick={handleLockGoals} disabled={isPending}>
            {isPending ? 'Confirm in wallet...' : 'Lock in goals (encrypted)'}
          </button>
        )}
        {loading && <p className="status">Loading group...</p>}
        {status && <p className="status">{status}</p>}
      </div>

      <div className="section">
        <div className="section-label">
          <span className="dot slate" />
          Your group
        </div>
        {members.map(member => {
          const completions = memberStatuses[member.toLowerCase()] || []
          const slots = Math.max(3, completions.length)
          return (
            <div className="friend-row" key={member}>
              <div>
                <div className="friend-name">{memberName(member, address)}</div>
                <div className="friend-addr">{shortAddr(member)}</div>
              </div>
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
function LeaderboardScreen({ go, groupId }: { go: (s: Screen) => void; groupId: number | null }) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [rankedMembers, setRankedMembers] = useState<Address[]>([])
  const [counts, setCounts] = useState<bigint[]>([])
  const [status, setStatus] = useState<string | null>(null)

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

  const rows = useMemo(() => rankedMembers.map((member, index) => ({
    member,
    count: counts[index] || 0n,
  })), [counts, rankedMembers])

  if (groupId === null) {
    return (
      <div className="screen">
        <button className="back-btn" onClick={() => go('dashboard')}>← Dashboard</button>
        <h1 className="screen-title">No board yet</h1>
        <p className="screen-sub">Create a group first to start ranking daily completion.</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <button className="back-btn" onClick={() => go('dashboard')}>← Dashboard</button>
      <h1 className="screen-title">Today's board</h1>
      <p className="screen-sub">Ranked by goals completed. Goals stay private.</p>
      <div className="lb-card">
        {rows.map((entry, i) => (
          <div key={entry.member} className={'lb-row' + (i === 0 ? ' first' : '')}>
            <span className="lb-rank">{i === 0 ? '👑' : '#' + (i + 1)}</span>
            <div className="lb-info">
              <div className="lb-name">{memberName(entry.member, address)}</div>
              <div className="lb-addr">{shortAddr(entry.member)}</div>
            </div>
            <div className="lb-score">
              <span className="lb-count">{entry.count.toString()}</span>
              <span className="lb-total">/3</span>
            </div>
          </div>
        ))}
        {status && <p className="status">{status}</p>}
      </div>
    </div>
  )
}

// Root
export default function App() {
  const { address } = useAccount()
  const [screen, setScreen] = useState<Screen>('home')
  const [activeGroupId, setActiveGroupIdState] = useState<number | null>(null)

  useEffect(() => {
    setActiveGroupIdState(readActiveGroup(address))
  }, [address])

  const setActiveGroupId = (groupId: number) => {
    if (address) saveActiveGroup(address, groupId)
    setActiveGroupIdState(groupId)
  }

  return (
    <div className="app">
      <nav className="top-nav">
        <button className="nav-logo" onClick={() => setScreen('home')}>
          acc<span className="asterisk">*</span>untable
        </button>
        <ConnectButton showBalance={false} chainStatus="none" />
      </nav>
      <main className="main-content">
        {screen === 'home' && <HomeScreen go={setScreen} />}
        {screen === 'create' && <CreateScreen go={setScreen} onGroupCreated={setActiveGroupId} />}
        {screen === 'dashboard' && <DashboardScreen go={setScreen} groupId={activeGroupId} />}
        {screen === 'leaderboard' && <LeaderboardScreen go={setScreen} groupId={activeGroupId} />}
      </main>
    </div>
  )
}
