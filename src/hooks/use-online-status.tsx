"use client"

import * as React from "react"

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = React.useState(
    typeof window !== 'undefined' ? navigator.onLine : true
  )
  const [wasOfflineOnMount, setWasOfflineOnMount] = React.useState(false)

  React.useEffect(() => {
    // Check if offline on mount (page refresh)
    if (typeof window !== 'undefined' && !navigator.onLine) {
      setWasOfflineOnMount(true)
      setIsOnline(false)
    }

    const handleOnline = () => {
      setIsOnline(true)
      setWasOfflineOnMount(false)
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return { isOnline, wasOfflineOnMount }
}
