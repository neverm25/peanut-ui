'useClient'

import { useContext, useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import {
    claimLinkGasless,
    claimLinkXChainGasless,
    generateKeysFromString,
    getRawParamsFromLink,
    interfaces,
} from '@squirrel-labs/peanut-sdk'

import * as context from '@/context'
import * as consts from '@/constants'
import * as utils from '@/utils'
export const useClaimLink = () => {
    const { chain: currentChain } = useAccount()
    const { switchChainAsync } = useSwitchChain()

    const { loadingState, setLoadingState } = useContext(context.loadingStateContext)

    const xchainFeeMultiplier = 0.98

    const claimLink = async ({ address, link }: { address: string; link: string }) => {
        setLoadingState('Executing transaction')
        try {
            const claimTx = await claimLinkGasless({
                link,
                recipientAddress: address,
                baseUrl: `${consts.next_proxy_url}/claim-v2`,
                APIKey: 'doesnt-matter',
            })

            return claimTx.transactionHash ?? claimTx.txHash ?? claimTx.hash ?? claimTx.tx_hash ?? ''
        } catch (error) {
            console.log('Error claiming link:', error)

            throw error
        } finally {
            setLoadingState('Idle')
        }
    }

    const claimLinkXchain = async ({
        address,
        link,
        destinationChainId,
        destinationToken,
    }: {
        address: string
        link: string
        destinationChainId: string
        destinationToken: string
    }) => {
        setLoadingState('Executing transaction')
        try {
            const isTestnet = utils.isTestnetChain(destinationChainId)
            const claimTx = await claimLinkXChainGasless({
                link,
                recipientAddress: address,
                destinationChainId,
                destinationToken,
                isMainnet: !isTestnet,
                squidRouterUrl: `${consts.next_proxy_url}/get-squid-route`,
                baseUrl: `${consts.next_proxy_url}/claim-x-chain`,
                APIKey: 'doesnt-matter',
            })

            return claimTx.txHash
        } catch (error) {
            console.log('Error claiming link:', error)
            throw error
        } finally {
            setLoadingState('Idle')
        }
    }

    const getSquidRoute = async ({
        linkDetails,
        destinationChainId,
        destinationToken,
    }: {
        linkDetails: interfaces.IPeanutLinkDetails
        destinationChainId: string
        destinationToken: string
    }) => {}

    const switchNetwork = async (chainId: string) => {
        if (currentChain?.id.toString() !== chainId.toString()) {
            setLoadingState('Allow network switch')

            try {
                await switchChainAsync({ chainId: Number(chainId) })
                setLoadingState('Switching network')
                await new Promise((resolve) => setTimeout(resolve, 2000))
                setLoadingState('Loading')
            } catch (error) {
                setLoadingState('Idle')
                console.error('Error switching network:', error)
                // TODO: handle error, either throw or return error
            }
        }
    }

    const checkTxStatus = async (txHash: string) => {}

    const sendNotification = async () => {}

    const estimatePoints = async ({
        address,
        link,
        chainId,
        amountUSD,
    }: {
        address: string
        link: string
        chainId: string
        amountUSD: number
    }) => {
        try {
            const response = await fetch('https://api.staging.peanut.to/calculate-pts-for-action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    actionType: 'CLAIM',
                    link: link,
                    userAddress: address,
                    chainId: chainId,
                    amountUsd: amountUSD,
                }),
            })
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }
            const data = await response.json()
            console.log(data.points)
            return Math.round(data.points)
        } catch (error) {
            console.error('Failed to estimate points:', error)
            return 0
        }
    }

    const getAttachmentInfo = async (link: string) => {
        const params = getRawParamsFromLink(link)
        const { address: pubKey } = generateKeysFromString(params.password)

        try {
            const response = await fetch('https://api.staging.peanut.to/get-link-details', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    pubKey,
                    apiKey: process.env.NEXT_PUBLIC_PEANUT_API_KEY,
                }),
            })
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }
            const data = await response.json()
            console.log(data)

            return {
                fileUrl: data.linkInfo.file_url,
                message: data.linkInfo.text_content,
            }
        } catch (error) {
            console.error('Failed to get attachment:', error)
        }
    }

    return {
        xchainFeeMultiplier,
        claimLink,
        claimLinkXchain,
        getSquidRoute,
        switchNetwork,
        checkTxStatus,
        sendNotification,
        estimatePoints,
        getAttachmentInfo,
    }
}

export default useClaimLink
