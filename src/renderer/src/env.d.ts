/// <reference types="vite/client" />

import type { ClassboardApi } from '@shared/types'

declare global {
  interface Window {
    classboard: ClassboardApi
  }
}

export {}
