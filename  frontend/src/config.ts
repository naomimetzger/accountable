import { http, createConfig } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

export const config = getDefaultConfig({
  appName: 'acc*untable',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  chains: [arbitrumSepolia],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
})

export const CONTRACT_ADDRESS = '0x6046fdBAa67816d726BF6ED52816DCfc62BD41F4'