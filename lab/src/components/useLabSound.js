import { useEffect, useMemo, useRef } from 'react'
import { createSfx } from './sfx'
import { useSoundPref } from '../sound'
import click from '../assets/sfx/radio-click.m4a'
import impact from '../assets/sfx/well-clack.m4a'
import paper from '../assets/sfx/paper-peel.m4a'
import rub from '../assets/sfx/mirror-rub.m4a'
import cityFold from '../assets/sfx/city-fold.m4a'

// Reuse the lab's existing material sounds and its one shared mute preference.
export function useLabSound(profile = 'default') {
  const ref = useRef(null)
  const loop = useRef(null)
  const motion = useRef(0)
  const activeProfile = useRef(profile)
  const [on, toggle] = useSoundPref()
  const audio = useMemo(() => ({
    unlock: () => {
      ref.current?.unlock()
      if (activeProfile.current === 'city' && !loop.current) loop.current = ref.current?.loop('fold', { gain: motion.current, rate: .84 })
    },
    play: (name, options) => ref.current?.play(name, options),
    motion: (gain) => { motion.current = gain; loop.current?.set(gain, .22) },
  }), [])
  useEffect(() => {
    activeProfile.current = profile
    const engine = createSfx(profile === 'city' ? { fold: cityFold } : { click, impact, paper, rub }, { level: .65 })
    engine.setMuted(true); ref.current = engine
    return () => { loop.current?.stop(); loop.current = null; ref.current = null; motion.current = 0; engine.close() }
  }, [profile])
  useEffect(() => {
    ref.current?.setMuted(!on)
    if (on) audio.unlock()
    const visibility = () => ref.current?.setMuted(!on || document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [on, profile, audio])
  return { audio, sound: { on, toggle } }
}
