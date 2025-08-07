import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export default auth((request: NextRequest & { auth: any }) => {
  const { pathname } = request.nextUrl
  const session = request.auth

  // Check if the route is protected (dashboard routes)
  const isProtectedRoute = pathname.startsWith('/dashboard')
  
  // If accessing protected route without session, redirect to sign-in
  if (isProtectedRoute && !session) {
    const signInUrl = new URL('/sign-in', request.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

  // If signed in and trying to access auth pages, redirect to dashboard
  if (session && (pathname === '/sign-in' || pathname === '/sign-up')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
