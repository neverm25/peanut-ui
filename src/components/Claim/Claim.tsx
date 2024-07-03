'use client'
import { createElement, useEffect, useState, useContext, useMemo } from 'react'
import peanut, { claimLink, getSquidChains, interfaces as peanutInterfaces } from '@squirrel-labs/peanut-sdk'
import { useAccount } from 'wagmi'
import useClaimLink from './useClaimLink'

import * as genericViews from './Generic'
import * as _consts from './Claim.consts'
import * as interfaces from '@/interfaces'
import * as utils from '@/utils'
import * as context from '@/context'
import * as assets from '@/assets'
import * as consts from '@/constants'
import FlowManager from './Link/FlowManager'

export const Claim = ({}) => {
    const [step, setStep] = useState<_consts.IClaimScreenState>(_consts.INIT_VIEW_STATE)
    const [linkState, setLinkState] = useState<_consts.claimLinkState>('LOADING')
    const [claimLinkData, setClaimLinkData] = useState<interfaces.ILinkDetails | undefined>(undefined)
    const [crossChainDetails, setCrossChainDetails] = useState<
        Array<peanutInterfaces.ISquidChain & { tokens: peanutInterfaces.ISquidToken[] }> | undefined
    >(undefined)
    const [attachment, setAttachment] = useState<{ message: string | undefined; attachmentUrl: string | undefined }>({
        message: undefined,
        attachmentUrl: undefined,
    })
    const [type, setType] = useState<_consts.ClaimType | undefined>(undefined)
    const [recipient, setRecipient] = useState<{ name: string | undefined; address: string }>({
        name: undefined,
        address: '',
    })
    const [tokenPrice, setTokenPrice] = useState<number>(0)
    const [estimatedPoints, setEstimatedPoints] = useState<number>(0)
    const [selectedRoute, setSelectedRoute] = useState<any>(undefined)
    const [transactionHash, setTransactionHash] = useState<string>()
    const [hasFetchedRoute, setHasFetchedRoute] = useState<boolean>(false)
    const [liquidationAddress, setLiquidationAddress] = useState<interfaces.IBridgeLiquidationAddress | null>(null)

    const [recipientType, setRecipientType] = useState<interfaces.RecipientType>('address')
    const [offrampForm, setOfframpForm] = useState<_consts.IOfframpForm>({
        name: '',
        email: '',
        recipient: '',
    })

    const { setSelectedChainID, setSelectedTokenAddress } = useContext(context.tokenSelectorContext)

    const { address } = useAccount()
    const { getAttachmentInfo, estimatePoints } = useClaimLink()

    const isOfframpPossible = useMemo(() => {
        return (
            (claimLinkData?.chainId === '10' &&
                utils.compareTokenAddresses(
                    claimLinkData?.tokenAddress,
                    '0x0b2c639c533813f4aa9d7837caf62653d097ff85'
                )) ||
            (claimLinkData?.chainId === '42161' &&
                utils.compareTokenAddresses(claimLinkData?.tokenAddress, '0xaf88d065e77c8cc2239327c5edb3a432268e5831'))
        )
    }, [claimLinkData])

    const handleOnNext = () => {
        if (step.idx === _consts.CLAIM_SCREEN_FLOW.length - 1) return
        const newIdx = step.idx + 1
        setStep(() => ({
            screen: _consts.CLAIM_SCREEN_FLOW[newIdx],
            idx: newIdx,
        }))
    }
    const handleOnPrev = () => {
        if (step.idx === 0) return
        const newIdx = step.idx - 1
        setStep(() => ({
            screen: _consts.CLAIM_SCREEN_FLOW[newIdx],
            idx: newIdx,
        }))
    }
    const handleOnCustom = (screen: _consts.ClaimScreens) => {
        setStep(() => ({
            screen: screen,
            idx: _consts.CLAIM_SCREEN_FLOW.indexOf(screen),
        }))
    }

    const getCrossChainDetails = async (linkDetails: interfaces.ILinkDetails) => {
        // xchain is only available for native and erc20
        if (linkDetails.tokenType != 0 && linkDetails.tokenType != 1) {
            return undefined
        }
        if (linkDetails.chainId === '1') {
            return undefined
        }

        try {
            const crossChainDetails = await peanut.getXChainOptionsForLink({
                isTestnet: utils.isTestnetChain(linkDetails.chainId.toString()),
                sourceChainId: linkDetails.chainId.toString(),
                tokenType: linkDetails.tokenType,
            })

            const contractVersionCheck = peanut.compareVersions('v4.2', linkDetails.contractVersion, 'v') // v4.2 is the minimum version required for cross chain
            if (crossChainDetails.length > 0 && contractVersionCheck) {
                const xchainDetails = sortCrossChainDetails(
                    crossChainDetails.filter((chain: any) => chain.chainId != '1'),
                    consts.supportedPeanutChains
                )

                setSelectedChainID(xchainDetails[0].chainId)
                setSelectedTokenAddress(xchainDetails[0].tokens[0].address)
                return xchainDetails
            } else {
                return undefined
            }
        } catch (error) {
            console.log('error fetching cross chain details: ' + error)
            return undefined
        }
    }

    const sortCrossChainDetails = (details: any[], order: any[]) => {
        const orderMap = new Map(order.map((item, index) => [item.chainId, index]))
        return details.sort((a, b) => {
            const indexA = orderMap.get(a.chainId)
            const indexB = orderMap.get(b.chainId)
            if (indexA === undefined || indexB === undefined) {
                return 0 // Default to no order if not found
            }
            return indexA - indexB
        })
    }

    const checkLink = async (link: string) => {
        try {
            const linkDetails: interfaces.ILinkDetails = await peanut.getLinkDetails({
                link,
            })
            console.log('linkDetails', linkDetails)
            const attachmentInfo = await getAttachmentInfo(linkDetails.link)
            console.log('attachmentInfo', attachmentInfo)
            setAttachment({
                message: attachmentInfo?.message,
                attachmentUrl: attachmentInfo?.fileUrl,
            })

            setClaimLinkData(linkDetails)
            if (linkDetails.claimed) {
                setLinkState('ALREADY_CLAIMED')
            } else {
                const crossChainDetails = await getCrossChainDetails(linkDetails)
                setCrossChainDetails(crossChainDetails)
                const tokenPrice = await utils.fetchTokenPrice(
                    linkDetails.tokenAddress.toLowerCase(),
                    linkDetails.chainId
                )
                tokenPrice && setTokenPrice(tokenPrice?.price)

                if (address) {
                    setRecipient({ name: '', address })

                    const estimatedPoints = await estimatePoints({
                        address: address ?? '',
                        chainId: linkDetails.chainId,
                        amountUSD: Number(linkDetails.tokenAmount) * (tokenPrice?.price ?? 0),
                    })
                    console.log('estimatedPoints', estimatedPoints)
                    setEstimatedPoints(estimatedPoints)
                }

                if (address && linkDetails.senderAddress === address) {
                    setLinkState('CLAIM_SENDER')
                } else {
                    setLinkState('CLAIM')
                }
            }
        } catch (error) {
            setLinkState('NOT_FOUND')
        }
    }

    const checkAccess = async () => {
        const accessCode = utils.getPeanutAccessCode()
        if (accessCode?.accessCode !== process.env.NEXT_PUBLIC_PEANUT_ACCESS_CODE?.toLowerCase()) {
            utils.updatePeanutAccessCode('ilovepeanuts')
            window.location.reload()
        }
    }

    useEffect(() => {
        const pageUrl = typeof window !== 'undefined' ? window.location.href : ''
        if (pageUrl) {
            checkLink(pageUrl)
            checkAccess()
        }
    }, [])

    // useEffect(() => {
    //     ;async () => {
    //         if (claimLinkData) {
    //             const estimatedPoints = await estimatePoints({
    //                 address: address ?? '',
    //                 chainId: claimLinkData.chainId,
    //                 link: claimLinkData.link,
    //                 amountUSD: Number(claimLinkData.tokenAmount) * (tokenPrice ?? 0),
    //             })
    //             console.log('estimatedPoints', estimatedPoints)
    //             setEstimatedPoints(estimatedPoints)
    //         }
    //     }
    // }, [address])

    return (
        <div className="card">
            {linkState === 'LOADING' && (
                <div className="relative flex w-full items-center justify-center">
                    <div className="animate-spin">
                        <img src={assets.PEANUTMAN_LOGO.src} alt="logo" className="h-6 sm:h-10" />
                        <span className="sr-only">Loading...</span>
                    </div>
                </div>
            )}
            {linkState === 'CLAIM' && (
                <FlowManager
                    recipientType={recipientType}
                    step={step}
                    props={
                        {
                            onPrev: handleOnPrev,
                            onNext: handleOnNext,
                            onCustom: handleOnCustom,
                            claimLinkData,
                            crossChainDetails,
                            type,
                            setClaimType: setType,
                            recipient,
                            setRecipient,
                            tokenPrice,
                            setTokenPrice,
                            transactionHash,
                            setTransactionHash,
                            estimatedPoints,
                            setEstimatedPoints,
                            attachment,
                            setAttachment,
                            selectedRoute,
                            setSelectedRoute,
                            hasFetchedRoute,
                            setHasFetchedRoute,
                            recipientType,
                            setRecipientType,
                            offrampForm,
                            setOfframpForm,
                            liquidationAddress,
                            setLiquidationAddress,
                            isOfframpPossible,
                        } as _consts.IClaimScreenProps
                    }
                />
            )}

            {linkState === 'ALREADY_CLAIMED' && <genericViews.AlreadyClaimedLinkView claimLinkData={claimLinkData} />}
            {linkState === 'NOT_FOUND' && <genericViews.NotFoundClaimLink />}
            {linkState === 'CLAIM_SENDER' && (
                <genericViews.SenderClaimLinkView
                    changeToRecipientView={() => {
                        setLinkState('CLAIM')
                    }}
                    claimLinkData={claimLinkData}
                    setTransactionHash={setTransactionHash}
                    onCustom={handleOnCustom}
                />
            )}
        </div>
    )
}
