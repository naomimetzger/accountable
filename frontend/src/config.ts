import { http } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

export const config = getDefaultConfig({
  appName: 'ac*ountable',
  projectId: '0adc53fa435da163caedf3afcb2d8c8a',
  chains: [arbitrumSepolia],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
})

export const CONTRACT_ADDRESS = '0x6046fdBAa67816d726BF6ED52816DCfc62BD41F4' as const