export const ACCOUNTABILITY_ABI = [
  {
    name: 'createGroup',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'members', type: 'address[]' }
    ],
    outputs: [{ name: 'groupId', type: 'uint256' }]
  },
  {
    name: 'completeGoal',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'groupId', type: 'uint256' },
      { name: 'goalIndex', type: 'uint8' }
    ],
    outputs: []
  },
  {
    name: 'getCompletionStatus',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'groupId', type: 'uint256' },
      { name: 'member', type: 'address' }
    ],
    outputs: [{ name: '', type: 'bool[]' }]
  },
  {
    name: 'getLeaderboard',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'groupId', type: 'uint256' }],
    outputs: [
      { name: 'rankedMembers', type: 'address[]' },
      { name: 'counts', type: 'uint256[]' }
    ]
  },
  {
    name: 'isMember',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'groupId', type: 'uint256' },
      { name: 'wallet', type: 'address' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'getMembers',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'groupId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address[]' }]
  },
  {
    name: 'getGroupName',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'groupId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }]
  },
  {
    name: 'groupCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'GroupCreated',
    type: 'event',
    inputs: [
      { name: 'groupId', type: 'uint256', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false }
    ]
  },
  {
    name: 'GoalCompleted',
    type: 'event',
    inputs: [
      { name: 'groupId', type: 'uint256', indexed: true },
      { name: 'member', type: 'address', indexed: true },
      { name: 'goalIndex', type: 'uint8', indexed: false }
    ]
  }
] as const