export const IN_EUINT64_ABI = {
  name: 'encryptedGoals',
  type: 'tuple[]',
  components: [
    { name: 'ctHash', type: 'uint256' },
    { name: 'securityZone', type: 'uint8' },
    { name: 'utype', type: 'uint8' },
    { name: 'signature', type: 'bytes' },
  ],
} as const

export const ACCOUNTABILITY_ABI = [
  {
    name: 'createGroup',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'members', type: 'address[]' },
    ],
    outputs: [{ name: 'groupId', type: 'uint256' }],
  },
  {
    name: 'setGoals',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'groupId', type: 'uint256' },
      IN_EUINT64_ABI,
    ],
    outputs: [],
  },
  {
    name: 'completeGoal',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'groupId', type: 'uint256' },
      { name: 'goalIndex', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    name: 'getCompletionStatus',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'groupId', type: 'uint256' },
      { name: 'member', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool[]' }],
  },
  {
    name: 'getGoals',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'groupId', type: 'uint256' },
      { name: 'member', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'getLeaderboard',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'groupId', type: 'uint256' }],
    outputs: [
      { name: 'rankedMembers', type: 'address[]' },
      { name: 'counts', type: 'uint256[]' },
    ],
  },
  {
    name: 'isMember',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'groupId', type: 'uint256' },
      { name: 'wallet', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getMembers',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'groupId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    name: 'getGroupName',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'groupId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'groupCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'GroupCreated',
    type: 'event',
    inputs: [
      { name: 'groupId', type: 'uint256', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
    ],
  },
  {
    name: 'GoalsSet',
    type: 'event',
    inputs: [
      { name: 'groupId', type: 'uint256', indexed: true },
      { name: 'member', type: 'address', indexed: true },
      { name: 'count', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'GoalCompleted',
    type: 'event',
    inputs: [
      { name: 'groupId', type: 'uint256', indexed: true },
      { name: 'member', type: 'address', indexed: true },
      { name: 'goalIndex', type: 'uint8', indexed: false },
    ],
  },
] as const
