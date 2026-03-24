'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Page() {
  const router = useRouter()
  const params = useParams()

  useEffect(() => {
    // Redirect to tree view by default
    if (params.domain) {
      router.replace(`/${params.domain}/tree`)
    }
  }, [params.domain, router])

  return null
}
