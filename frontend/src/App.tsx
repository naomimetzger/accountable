import { useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'

type Screen = 'home' | 'create' | 'dashboard' | 'leaderboard'

// ── Home ────────────────────────────────────────────────────────────────────

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

// ── Create Group ─────────────────────────────────────────────────────────────

function CreateScreen({ go }: { go: (s: Screen) => void }) {
  const [name, setName] = useState('')
  const [members, setMembers] = useState([''])
  const [status, setStatus] = useState('')

  const add = () => setMembers([...members, ''])
  const remove = (i: number) => setMembers(members.filter((_, idx) => idx !== i))
  const update = (i: number, v: string) => { const m = [...members]; m[i] = v; setMembers(m) }

  const handleCreate = async () => {
    if (!name) return setStatus('Add a group name first.')
    setStatus('Creating group on-chain...')
    // TODO: wire to contract createGroup()
    setTimeout(() => setStatus('Group created ✓'), 1200)
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
          {members.map((m, i) => (
            <div className="member-row" key={i}>
              <input type="text" placeholder="0x..." value={m} onChange={e => update(i, e.target.value)} />
              {members.length > 1 && <button className="remove-btn" onClick={() => remove(i)}>✕</button>}
            </div>
          ))}
          <button className="add-btn" onClick={add}>+ Add member</button>
        </div>
        <button className="btn-primary full" onClick={handleCreate}>Create group</button>
        {status && <p className="status">{status}</p>}
      </div>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────

const MOCK_FRIENDS = [
  { name: 'Kevin', addr: '0xabc...def', completions: [true, false, true] },
  { name: 'Ash', addr: '0x123...456', completions: [true, true, false] },
]

function DashboardScreen({ go }: { go: (s: Screen) => void }) {
  const [goals, setGoals] = useState(['', '', ''])
  const [done, setDone] = useState([false, false, false])
  const [locked, setLocked] = useState(false)

  const updateGoal = (i: number, v: string) => { const g = [...goals]; g[i] = v; setGoals(g) }
  const toggle = (i: number) => { const d = [...done]; d[i] = !d[i]; setDone(d) }

  return (
    <div className="screen">
      <div className="screen-header">
        <button className="back-btn" onClick={() => go('home')}>← Back</button>
        <button className="nav-link-btn" onClick={() => go('leaderboard')}>Leaderboard →</button>
      </div>
      <h1 className="screen-title">Today's goals</h1>
      <p className="screen-sub">Only you can read these. Everyone else sees ✓ or ✗ only.</p>

      <div className="section">
        <div className="section-label">
          <span className="dot teal" />
          Your goals
          <span className="enc-tag">fhe encrypted</span>
        </div>
        {goals.map((g, i) =>
          locked ? (
            <button key={i} className={`goal-complete-btn${done[i] ? ' done' : ''}`} onClick={() => toggle(i)}>
              <span className="goal-text">{g || `Goal ${i + 1}`}</span>
              <span className="check">{done[i] ? '✓' : '✗'}</span>
            </button>
          ) : (
            <div key={i} className="goal-input-row">
              <input type="text" placeholder={`Goal ${i + 1}`} value={g} onChange={e => updateGoal(i, e.target.value)} />
            </div>
          )
        )}
        {!locked && (
          <button className="btn-primary full" onClick={() => setLocked(true)}>
            Lock in goals (encrypted)
          </button>
        )}
      </div>

      <div className="section">
        <div className="section-label">
          <span className="dot slate" />
          Your group
        </div>
        {MOCK_FRIENDS.map((f, i) => (
          <div className="friend-row" key={i}>
            <div>
              <div className="friend-name">{f.name}</div>
              <div className="friend-addr">{f.addr}</div>
            </div>
            <div className="checks">
              {f.completions.map((c, j) => (
                <span key={j} className={`pill ${c ? 'yes' : 'no'}`}>{c ? '✓' : '✗'}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

const MOCK_LB = [
  { name: 'Ash', addr: '0x123...456', count: 2, total: 3 },
  { name: 'You', addr: '0x0d01...fAc4', count: 1, total: 3 },
  { name: 'Kevin', addr: '0xabc...def', count: 1, total: 3 },
]

function LeaderboardScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="screen">
      <button className="back-btn" onClick={() => go('dashboard')}>← Dashboard</button>
      <h1 className="screen-title">Today's board</h1>
      <p className="screen-sub">Ranked by goals completed. Goals stay private.</p>
      <div className="lb-card">
        {MOCK_LB.map((e, i) => (
          <div key={i} className={`lb-row${i === 0 ? ' first' : ''}`}>
            <span className="lb-rank">{i === 0 ? '👑' : `#${i + 1}`}</span>
            <div className="lb-info">
              <div className="lb-name">{e.name}</div>
              <div className="lb-addr">{e.addr}</div>
            </div>
            <div className="lb-score">
              <span className="lb-count">{e.count}</span>
              <span className="lb-total">/{e.total}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
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
        {screen === 'create' && <CreateScreen go={setScreen} />}
        {screen === 'dashboard' && <DashboardScreen go={setScreen} />}
        {screen === 'leaderboard' && <LeaderboardScreen go={setScreen} />}
      </main>
    </div>
  )
}