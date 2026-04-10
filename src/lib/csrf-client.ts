/**
 * Client-side utility to read CSRF token from cookies
 */
export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  
  const name = 'csrf-token='
  const decodedCookie = decodeURIComponent(document.cookie)
  const ca = decodedCookie.split(';')
  
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) === ' ') {
      c = c.substring(1)
    }
    if (c.indexOf(name) === 0) {
      return c.substring(name.length, c.length)
    }
  }
  
  return null
}
