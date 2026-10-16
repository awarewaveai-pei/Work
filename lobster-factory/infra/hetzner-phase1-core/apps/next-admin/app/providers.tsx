'use client'

import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect } from 'react'
import { identifyFromEnvBootstrap } from '@/lib/analytics'

const posthogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

export function PHProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return

    posthog.init(key, {
      api_host: posthogHost,
      // App Router client navigations — aligns with PostHog SPA guidance (vs load-only pageviews).
      capture_pageview: "history_change",
      capture_pageleave: true,
      autocapture: false,
      capture_exceptions: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '[data-sensitive]',
      },
      persistence: 'localStorage',
      // /login/set-password gets a one-time sign-in token in its URL fragment (lib/accounts/client-invite.ts); no URL
      // fragment is ever sent, whichever effect runs first.
      before_send: (event) => {
        const props = event?.properties as Record<string, unknown> | undefined
        if (props) for (const k of Object.keys(props)) {
          const v = props[k]
          if (typeof v === 'string' && /^https?:\/\/[^#]*#/.test(v)) props[k] = v.replace(/#.*$/, '')
        }
        return event
      },
      loaded: (ph) => {
        ph.register({
          site_name: 'Aware Wave Admin',
          site_domain: window.location.hostname,
          app_surface: 'next-admin',
        })
        if (process.env.NODE_ENV === 'development') ph.debug()
        identifyFromEnvBootstrap()
      },
    })
  }, [])

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
