import { signal } from '@preact/signals'

const STORAGE_KEY = 'forge.notify-sessions'

export const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window

const readPref = (): boolean => {
  try {
    return notificationsSupported && Notification.permission === 'granted' && localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const notifySessions = signal(readPref())

// the browser only grants permission from a click, so this runs from the switch
export async function setNotifySessions(on: boolean): Promise<boolean> {
  if (on) {
    if (!notificationsSupported) return false
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    if (permission !== 'granted') return false
  }
  notifySessions.value = on
  try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0') } catch { /* private mode */ }
  return true
}

// one notification per session: a newer one replaces the older through the tag
export function notify(title: string, body: string, tag: string, onClick: () => void): void {
  if (!notifySessions.value || !notificationsSupported || Notification.permission !== 'granted') return
  const n = new Notification(title, { body, tag })
  n.onclick = () => { window.focus(); onClick(); n.close() }
}
